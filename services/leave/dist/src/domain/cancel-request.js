/**
 * Cancellation domain logic.
 * Only pending_approval or approved (not yet started) requests may be cancelled.
 * Emits LeaveCancelled event for downstream consumers (payroll, calendar, notifications).
 */
import { LeaveError } from './working-days.js';
import { newEvent } from './create-request.js';
const CANCELLABLE = ['pending_approval', 'approved', 'scheduled'];
export async function cancelLeaveRequest(id, requesterId, expectedVersion, correlationId, repo) {
    const rec = await repo.findById(id);
    if (!rec) {
        throw new LeaveError('NOT_FOUND', `Leave request ${id} not found`);
    }
    if (rec.employeeId !== requesterId) {
        throw new LeaveError('FORBIDDEN', 'Only the requester may cancel this request');
    }
    if (!CANCELLABLE.includes(rec.status)) {
        throw new LeaveError('INVALID_STATE_TRANSITION', `Cannot cancel a request with status '${rec.status}'`, undefined, { current: rec.status, allowed: CANCELLABLE });
    }
    const event = newEvent('LeaveCancelled', rec.entityId, correlationId, rec.id, {
        requestId: rec.id,
        employeeId: rec.employeeId,
        leaveTypeId: rec.leaveTypeId,
        startDate: rec.startDate,
        endDate: rec.endDate,
        workingDays: rec.workingDays,
        previousStatus: rec.status,
    });
    return repo.updateStatus(id, 'cancelled', expectedVersion, event);
}
