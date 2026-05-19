/**
 * Leave request creation. Demonstrates the conventions every module mirrors
 * (CLAUDE.md §6): server-side duration, idempotency, balance validation,
 * delegation of the approval to the workflow engine, outbox event emission.
 */
import { type WorkingCalendar } from './working-days.js';
export type LeaveStatus = 'draft' | 'pending_approval' | 'approved' | 'declined' | 'cancelled' | 'scheduled' | 'taken';
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
    updateStatus(id: string, status: LeaveStatus, expectedVersion: number, event: DomainEvent): Promise<LeaveRecord>;
    listRequests(filter: ListFilter): Promise<{
        items: LeaveRecord[];
        nextCursor?: string;
    }>;
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
export declare const newId: (p: string) => string;
export declare function newEvent(type: string, entityId: string, correlationId: string, aggregateId: string, payload: Record<string, unknown>): DomainEvent;
export declare function createLeaveRequest(input: CreateLeaveInput, cal: WorkingCalendar, repo: LeaveRepo, wf: WorkflowClient, correlationId: string): Promise<LeaveRecord>;
