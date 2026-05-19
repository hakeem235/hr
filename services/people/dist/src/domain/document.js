import { PeopleError } from './errors.js';
import { newId, newEvent } from './events.js';
export async function createDocument(input, repo, correlationId) {
    const existing = await repo.findDocumentByIdempotencyKey(input.idempotencyKey);
    if (existing)
        return existing;
    if (input.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn)) {
        throw new PeopleError('VALIDATION', 'expiresOn must be YYYY-MM-DD', 'expiresOn');
    }
    const rec = {
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
export async function listDocuments(filter, repo) {
    return repo.listDocuments(filter);
}
