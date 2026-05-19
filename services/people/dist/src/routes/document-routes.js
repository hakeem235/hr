import { createDocument, listDocuments } from '../domain/document.js';
import { PeopleError, statusFor } from '../domain/errors.js';
const corr = (req) => req.headers['x-correlation-id'] ?? globalThis.crypto.randomUUID();
export function registerDocumentRoutes(app, repo) {
    // POST /api/v1/documents
    app.post('/api/v1/documents', async (req, reply) => {
        const correlationId = corr(req);
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey)
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'Idempotency-Key header required' } });
        try {
            const body = req.body;
            if (!body?.entityId || !body?.docType || !body?.title || !body?.storageKey) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'entityId, docType, title, storageKey are required' } });
            }
            const rec = await createDocument({ entityId: String(body.entityId), employeeId: body.employeeId, docType: body.docType, title: String(body.title), storageKey: String(body.storageKey), expiresOn: body.expiresOn, idempotencyKey }, repo, correlationId);
            return reply.status(201).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // GET /api/v1/documents
    app.get('/api/v1/documents', async (req, reply) => {
        const q = req.query;
        const limit = Math.min(Number(q.limit ?? 20), 100);
        const { items, nextCursor } = await listDocuments({ employeeId: q.employeeId, entityId: q.entityId, docType: q.docType, expiringBefore: q.expiringBefore, cursor: q.cursor, limit }, repo);
        return reply.send({ items, nextCursor: nextCursor ?? null, limit });
    });
    // GET /api/v1/documents/:id
    app.get('/api/v1/documents/:id', async (req, reply) => {
        const { id } = req.params;
        const rec = await repo.findDocumentById(id);
        if (!rec)
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Document ${id} not found` } });
        return reply.send(rec);
    });
}
