/**
 * HR Letter request domain.
 * Mirrors leave/create-request.ts conventions exactly (CLAUDE.md §12).
 * The module owns its data; it delegates approval to the workflow engine.
 */
import { LetterError } from './errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LetterStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'generating'
  | 'issued'
  | 'declined'
  | 'cancelled';

export type LetterLanguage = 'en' | 'ar' | 'bilingual';

export interface CreateLetterInput {
  entityId: string;
  employeeId: string;
  letterTypeId: string;
  purpose: string;              // e.g. "visa application", "bank account opening"
  recipientName?: string;       // addressee for the letter
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
  documentId?: string;          // set once the letter is physically generated/stored
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
  updateStatus(
    id: string,
    status: LetterStatus,
    expectedVersion: number,
    event: DomainEvent,
    extra?: Partial<Pick<LetterRecord, 'documentId'>>,
  ): Promise<LetterRecord>;
  listRequests(filter: ListFilter): Promise<{ items: LetterRecord[]; nextCursor?: string }>;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
export const newId = (prefix: string): string =>
  `${prefix}_${(++_id).toString(16).padStart(6, '0')}`;

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
    aggregateType: 'letter_request',
    aggregateId,
    payload,
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createLetterRequest(
  input: CreateLetterInput,
  repo: LetterRepo,
  wf: WorkflowClient,
  correlationId: string,
): Promise<LetterRecord> {
  const existing = await repo.findByIdempotencyKey(input.employeeId, input.idempotencyKey);
  if (existing) return existing;

  if (!input.purpose.trim()) {
    throw new LetterError('POLICY_VIOLATION', 'purpose is required', 'purpose');
  }

  const wfInstanceId = await wf.start('LetterRequested', {
    requester: input.employeeId,
    entityId: input.entityId,
    request: { ...input },
  }).catch((err: unknown) => {
    throw new LetterError(
      'WORKFLOW_UNAVAILABLE',
      `Could not start approval workflow: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  const now = new Date().toISOString();
  const rec: LetterRecord = {
    id: newId('ltr'),
    entityId: input.entityId,
    employeeId: input.employeeId,
    letterTypeId: input.letterTypeId,
    purpose: input.purpose.trim(),
    recipientName: input.recipientName?.trim(),
    language: input.language,
    status: 'pending_approval',
    workflowInstanceId: wfInstanceId,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  await repo.saveWithEvent(
    rec,
    newEvent('LetterRequested', input.entityId, correlationId, rec.id, {
      requestId: rec.id,
      employeeId: rec.employeeId,
      letterTypeId: rec.letterTypeId,
      purpose: rec.purpose,
      language: rec.language,
    }),
  );

  return rec;
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

const CANCELLABLE: LetterStatus[] = ['pending_approval', 'approved'];

export async function cancelLetterRequest(
  id: string,
  requesterId: string,
  expectedVersion: number,
  repo: LetterRepo,
  correlationId: string,
): Promise<LetterRecord> {
  const rec = await repo.findById(id);
  if (!rec) throw new LetterError('NOT_FOUND', `Letter request ${id} not found`);
  if (rec.employeeId !== requesterId) throw new LetterError('FORBIDDEN', 'Only the requester may cancel');
  if (!CANCELLABLE.includes(rec.status)) {
    throw new LetterError('INVALID_STATE', `Cannot cancel a request with status '${rec.status}'`, 'status', {
      current: rec.status,
      cancellable: CANCELLABLE,
    });
  }
  if (rec.version !== expectedVersion) {
    throw new LetterError('CONFLICT', 'Version mismatch', undefined, {
      expected: expectedVersion,
      current: rec.version,
    });
  }

  return repo.updateStatus(
    id,
    'cancelled',
    expectedVersion,
    newEvent('LetterCancelled', rec.entityId, correlationId, id, {
      requestId: id,
      employeeId: rec.employeeId,
      letterTypeId: rec.letterTypeId,
    }),
  );
}

// ─── Mark issued (called when workflow emits LetterIssued) ────────────────────

export async function markLetterIssued(
  id: string,
  documentId: string,
  expectedVersion: number,
  repo: LetterRepo,
  correlationId: string,
): Promise<LetterRecord> {
  const rec = await repo.findById(id);
  if (!rec) throw new LetterError('NOT_FOUND', `Letter request ${id} not found`);
  if (rec.status !== 'approved' && rec.status !== 'generating') {
    throw new LetterError('INVALID_STATE', `Cannot issue a letter with status '${rec.status}'`);
  }
  if (rec.version !== expectedVersion) {
    throw new LetterError('CONFLICT', 'Version mismatch', undefined, {
      expected: expectedVersion, current: rec.version,
    });
  }

  return repo.updateStatus(
    id, 'issued', expectedVersion,
    newEvent('LetterIssued', rec.entityId, correlationId, id, {
      requestId: id,
      employeeId: rec.employeeId,
      documentId,
    }),
    { documentId },
  );
}
