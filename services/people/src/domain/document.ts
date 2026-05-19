import type { DocumentRecord, DocumentFilter, PeopleRepo, DocumentType } from './types.js';
import { PeopleError } from './errors.js';
import { newId, newEvent } from './events.js';

export interface CreateDocumentInput {
  entityId: string;
  employeeId?: string;
  docType: DocumentType;
  title: string;
  storageKey: string;
  expiresOn?: string;
  idempotencyKey: string;
}

export async function createDocument(
  input: CreateDocumentInput,
  repo: PeopleRepo,
  correlationId: string,
): Promise<DocumentRecord> {
  const existing = await repo.findDocumentByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  if (input.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn)) {
    throw new PeopleError('VALIDATION', 'expiresOn must be YYYY-MM-DD', 'expiresOn');
  }

  const rec: DocumentRecord = {
    id: newId('doc'),
    entityId: input.entityId,
    employeeId: input.employeeId,
    docType: input.docType,
    title: input.title.trim(),
    storageKey: input.storageKey,
    version: 1,
    expiresOn: input.expiresOn,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
  };

  const event = newEvent('DocumentCreated', input.entityId, correlationId, 'document', rec.id, {
    documentId: rec.id,
    employeeId: rec.employeeId,
    docType: rec.docType,
    expiresOn: rec.expiresOn,
  });

  await repo.saveDocument(rec, event);
  return rec;
}

export async function listDocuments(
  filter: DocumentFilter,
  repo: PeopleRepo,
): Promise<{ items: DocumentRecord[]; nextCursor?: string }> {
  return repo.listDocuments(filter);
}
