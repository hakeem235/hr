export type LetterStatus = 'draft' | 'pending_approval' | 'approved' | 'generating' | 'issued' | 'declined' | 'cancelled';
export type LetterLanguage = 'en' | 'ar' | 'bilingual';
export interface CreateLetterInput {
    entityId: string;
    employeeId: string;
    letterTypeId: string;
    purpose: string;
    recipientName?: string;
    language: LetterLanguage;
    idempotencyKey: string;
}
export interface LetterRecord {
    id: string;
    entityId: string;
    employeeId: string;
    letterTypeId: string;
    purpose: string;
    recipientName?: string;
    language: LetterLanguage;
    status: LetterStatus;
    workflowInstanceId?: string;
    documentId?: string;
    idempotencyKey: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}
export interface ListFilter {
    employeeId?: string;
    entityId?: string;
    status?: LetterStatus;
    cursor?: string;
    limit: number;
}
export interface LetterRepo {
    findByIdempotencyKey(employeeId: string, key: string): Promise<LetterRecord | null>;
    findById(id: string): Promise<LetterRecord | null>;
    /** Persist record + outbox event atomically (outbox pattern). */
    saveWithEvent(rec: LetterRecord, event: DomainEvent): Promise<void>;
    /** Update status with ETag enforcement + outbox event. */
    updateStatus(id: string, status: LetterStatus, expectedVersion: number, event: DomainEvent, extra?: Partial<Pick<LetterRecord, 'documentId'>>): Promise<LetterRecord>;
    listRequests(filter: ListFilter): Promise<{
        items: LetterRecord[];
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
export declare const newId: (prefix: string) => string;
export declare function newEvent(type: string, entityId: string, correlationId: string, aggregateId: string, payload: Record<string, unknown>): DomainEvent;
export declare function createLetterRequest(input: CreateLetterInput, repo: LetterRepo, wf: WorkflowClient, correlationId: string): Promise<LetterRecord>;
export declare function cancelLetterRequest(id: string, requesterId: string, expectedVersion: number, repo: LetterRepo, correlationId: string): Promise<LetterRecord>;
export declare function markLetterIssued(id: string, documentId: string, expectedVersion: number, repo: LetterRepo, correlationId: string): Promise<LetterRecord>;
