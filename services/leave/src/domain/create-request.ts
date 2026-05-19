/**
 * Leave request creation. Demonstrates the conventions every module mirrors
 * (CLAUDE.md §6): server-side duration, idempotency, balance validation,
 * delegation of the approval to the workflow engine, outbox event emission.
 */
import { computeWorkingDays, LeaveError, type WorkingCalendar } from './working-days.js';

export type LeaveStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'declined'
  | 'cancelled'
  | 'scheduled'
  | 'taken';

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

export interface LeaveRecord {
  id: string;
  entityId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason?: string;
  attachments?: string[];
  status: LeaveStatus;
  workflowInstanceId?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  /** ETag version counter — increment on every mutation */
  version: number;
}

export interface ListFilter {
  employeeId?: string;
  entityId?: string;
  status?: LeaveStatus;
  cursor?: string;
  limit: number;
}

export interface LeaveRepo {
  findByIdempotencyKey(employeeId: string, key: string): Promise<LeaveRecord | null>;
  findById(id: string): Promise<LeaveRecord | null>;
  getBalance(employeeId: string, leaveTypeId: string, year: number): Promise<LeaveBalance>;
  hasOverlap(employeeId: string, start: string, end: string, excludeId?: string): Promise<boolean>;
  /** Persists request + outbox event in ONE transaction (outbox pattern). */
  saveWithEvent(rec: LeaveRecord, event: DomainEvent): Promise<void>;
  /** Updates status atomically; enforces ETag via expectedVersion. */
  updateStatus(
    id: string,
    status: LeaveStatus,
    expectedVersion: number,
    event: DomainEvent,
  ): Promise<LeaveRecord>;
  listRequests(filter: ListFilter): Promise<{ items: LeaveRecord[]; nextCursor?: string }>;
}

export interface WorkflowClient {
  start(trigger: string, context: Record<string, unknown>): Promise<string>;
}

export interface DomainEvent {
  eventId: string;
  eventType: string;
  entityId: string;
  correlationId: string;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

let _id = 0;
export const newId = (p: string) =>
  `${p}_${(++_id).toString(16).padStart(6, '0')}`;

export function newEvent(
  type: string,
  entityId: string,
  correlationId: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): DomainEvent {
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

export async function createLeaveRequest(
  input: CreateLeaveInput,
  cal: WorkingCalendar,
  repo: LeaveRepo,
  wf: WorkflowClient,
  correlationId: string,
): Promise<LeaveRecord> {
  const existing = await repo.findByIdempotencyKey(input.employeeId, input.idempotencyKey);
  if (existing) return existing;

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
    throw new LeaveError(
      'INSUFFICIENT_BALANCE',
      `Requested ${workingDays} exceeds available balance of ${available}.`,
      'endDate',
      { requested: workingDays, available },
    );
  }

  const wfInstance = await wf.start('LeaveRequestSubmitted', {
    requester: input.employeeId,
    entityId: input.entityId,
    request: { ...input, workingDays },
  });

  const now = new Date().toISOString();
  const rec: LeaveRecord = {
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

  await repo.saveWithEvent(
    rec,
    newEvent('LeaveRequestSubmitted', input.entityId, correlationId, rec.id, {
      requestId: rec.id,
      employeeId: rec.employeeId,
      leaveTypeId: rec.leaveTypeId,
      startDate: rec.startDate,
      endDate: rec.endDate,
      workingDays,
    }),
  );

  return rec;
}
