/**
 * Leave request creation. Demonstrates the conventions every module mirrors
 * (CLAUDE.md §6): server-side duration, idempotency, balance validation,
 * delegation of the approval to the workflow engine, outbox event emission.
 */
import { computeWorkingDays, LeaveError } from './working-days.js';
let _id = 0;
export const newId = (p) => `${p}_${(++_id).toString(16).padStart(6, '0')}`;
export function newEvent(type, entityId, correlationId, aggregateId, payload) {
    return {
        eventId: newId('evt'),
        eventType: type,
        entityId,
        correlationId,
        occurredAt: new Date().toISOString(),
        aggregateType: 'leave_request',
        aggregateId,
        payload,
    };
}
export async function createLeaveRequest(input, cal, repo, wf, correlationId) {
    const existing = await repo.findByIdempotencyKey(input.employeeId, input.idempotencyKey);
    if (existing)
        return existing;
    const workingDays = computeWorkingDays(input.startDate, input.endDate, cal);
    if (workingDays === 0) {
        throw new LeaveError('INVALID_DATE_RANGE', 'Range contains no working days', 'startDate');
    }
    if (await repo.hasOverlap(input.employeeId, input.startDate, input.endDate)) {
        throw new LeaveError('OVERLAPPING_REQUEST', 'Overlaps an existing request', 'startDate');
    }
    const year = Number(input.startDate.slice(0, 4));
    const bal = await repo.getBalance(input.employeeId, input.leaveTypeId, year);
    const available = bal.accruedDays + bal.carriedDays - bal.usedDays;
    if (workingDays > available) {
        throw new LeaveError('INSUFFICIENT_BALANCE', `Requested ${workingDays} exceeds available balance of ${available}.`, 'endDate', { requested: workingDays, available });
    }
    const wfInstance = await wf.start('LeaveRequestSubmitted', {
        requester: input.employeeId,
        entityId: input.entityId,
        request: { ...input, workingDays },
    });
    const now = new Date().toISOString();
    const rec = {
        id: newId('lv'),
        entityId: input.entityId,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        workingDays,
        reason: input.reason,
        attachments: input.attachments,
        status: 'pending_approval',
        workflowInstanceId: wfInstance,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        updatedAt: now,
        version: 1,
    };
    await repo.saveWithEvent(rec, newEvent('LeaveRequestSubmitted', input.entityId, correlationId, rec.id, {
        requestId: rec.id,
        employeeId: rec.employeeId,
        leaveTypeId: rec.leaveTypeId,
        startDate: rec.startDate,
        endDate: rec.endDate,
        workingDays,
    }));
    return rec;
}
