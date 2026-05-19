/**
 * Leave request creation. Demonstrates the conventions every module mirrors
 * (CLAUDE.md §6): server-side duration, idempotency, balance validation,
 * delegation of the approval to the workflow engine, outbox event emission.
 *
 * Persistence and the workflow-engine client are interfaces here so the logic
 * is testable without infra. Real adapters live in src/db and a wf client.
 */
import { computeWorkingDays, LeaveError, type WorkingCalendar } from './working-days.js';

export interface CreateLeaveInput {
  entityId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  attachments?: string[];
  idempotencyKey: string;
}

export interface LeaveBalance {
  accruedDays: number;
  usedDays: number;
  carriedDays: number;
}

export interface LeaveRepo {
  findByIdempotencyKey(employeeId: string, key: string): Promise<LeaveRecord | null>;
  getBalance(employeeId: string, leaveTypeId: string, year: number): Promise<LeaveBalance>;
  hasOverlap(employeeId: string, start: string, end: string): Promise<boolean>;
  /** Persists request + outbox event in ONE transaction (outbox pattern). */
  saveWithEvent(rec: LeaveRecord, event: DomainEvent): Promise<void>;
}

export interface WorkflowClient {
  /** Starts the leave-approval workflow; returns the instance id. */
  start(trigger: string, context: Record<string, unknown>): Promise<string>;
}

export interface LeaveRecord {
  id: string;
  entityId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason?: string;
  status: 'pending_approval';
  workflowInstanceId: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface DomainEvent {
  eventType: string;
  entityId: string;
  correlationId: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

let _id = 0;
const newId = (p: string) => `${p}_${(++_id).toString(16).padStart(6, '0')}`;

export async function createLeaveRequest(
  input: CreateLeaveInput,
  cal: WorkingCalendar,
  repo: LeaveRepo,
  wf: WorkflowClient,
  correlationId: string,
): Promise<LeaveRecord> {
  // 1. Idempotency — a retried request must not double-submit (CLAUDE.md §6).
  const existing = await repo.findByIdempotencyKey(input.employeeId, input.idempotencyKey);
  if (existing) return existing;

  // 2. Server-side duration. Never trust the client.
  const workingDays = computeWorkingDays(input.startDate, input.endDate, cal);
  if (workingDays === 0) {
    throw new LeaveError('INVALID_DATE_RANGE', 'Range contains no working days', 'startDate');
  }

  // 3. Overlap check.
  if (await repo.hasOverlap(input.employeeId, input.startDate, input.endDate)) {
    throw new LeaveError('OVERLAPPING_REQUEST', 'Overlaps an existing request', 'startDate');
  }

  // 4. Balance check.
  const year = Number(input.startDate.slice(0, 4));
  const bal = await repo.getBalance(input.employeeId, input.leaveTypeId, year);
  const available = bal.accruedDays + bal.carriedDays - bal.usedDays;
  if (workingDays > available) {
    throw new LeaveError(
      'INSUFFICIENT_BALANCE',
      `Requested ${workingDays} exceeds available balance of ${available}.`,
      'endDate',
      { requested: workingDays, available },
    );
  }

  // 5. Delegate the approval to the workflow engine. Leave does NOT own the
  //    approval flow (workflow-engine.md §7).
  const wfInstance = await wf.start('LeaveRequestSubmitted', {
    requester: input.employeeId,
    entityId: input.entityId,
    request: { ...input, workingDays },
  });

  const rec: LeaveRecord = {
    id: newId('lv'),
    entityId: input.entityId,
    employeeId: input.employeeId,
    leaveTypeId: input.leaveTypeId,
    startDate: input.startDate,
    endDate: input.endDate,
    workingDays,
    reason: input.reason,
    status: 'pending_approval',
    workflowInstanceId: wfInstance,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
  };

  // 6. Persist record + event atomically (outbox pattern, CLAUDE.md §4).
  await repo.saveWithEvent(rec, {
    eventType: 'LeaveRequestSubmitted',
    entityId: input.entityId,
    correlationId,
    aggregateType: 'leave_request',
    aggregateId: rec.id,
    payload: {
      requestId: rec.id,
      employeeId: rec.employeeId,
      leaveTypeId: rec.leaveTypeId,
      startDate: rec.startDate,
      endDate: rec.endDate,
      workingDays,
    },
  });

  return rec;
}
