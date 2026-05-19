import { createPerson, updatePerson } from '../domain/person.js';
import { PeopleError, statusFor } from '../domain/errors.js';
const etag = (v) => `"${v}"`;
const parseIfMatch = (h) => {
    const m = h?.match(/^"(\d+)"$/);
    return m ? Number(m[1]) : null;
};
const corr = (req) => req.headers['x-correlation-id'] ?? globalThis.crypto.randomUUID();
export function registerPersonRoutes(app, repo) {
    // POST /api/v1/persons
    app.post('/api/v1/persons', async (req, reply) => {
        const correlationId = corr(req);
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey) {
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'Idempotency-Key header required' } });
        }
        try {
            const body = req.body;
            if (!body?.fullNameEn || !body?.nationality || !body?.dateOfBirth) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'fullNameEn, nationality, dateOfBirth are required' } });
            }
            const rec = await createPerson({ fullNameEn: String(body.fullNameEn), fullNameAr: body.fullNameAr, nationality: String(body.nationality), dateOfBirth: String(body.dateOfBirth), nationalId: body.nationalId, idempotencyKey }, repo, correlationId);
            return reply.status(201).header('ETag', etag(rec.version)).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // GET /api/v1/persons
    app.get('/api/v1/persons', async (req, reply) => {
        const q = req.query;
        const limit = Math.min(Number(q.limit ?? 20), 100);
        const { items, nextCursor } = await repo.listPersons({ cursor: q.cursor, limit });
        return reply.send({ items, nextCursor: nextCursor ?? null, limit });
    });
    // GET /api/v1/persons/:id
    app.get('/api/v1/persons/:id', async (req, reply) => {
        const { id } = req.params;
        const rec = await repo.findPersonById(id);
        if (!rec)
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Person ${id} not found` } });
        return reply.header('ETag', etag(rec.version)).send(rec);
    });
    // PATCH /api/v1/persons/:id
    app.patch('/api/v1/persons/:id', async (req, reply) => {
        const correlationId = corr(req);
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null)
            return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
        try {
            const body = req.body;
            const rec = await updatePerson(id, body, ifMatch, repo, correlationId);
            return reply.header('ETag', etag(rec.version)).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
}
