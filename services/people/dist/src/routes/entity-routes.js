import { createEntity, updateEntity, upsertHoliday, deleteHoliday } from '../domain/department.js';
import { PeopleError, statusFor } from '../domain/errors.js';
const etag = (v) => `"${v}"`;
const parseIfMatch = (h) => {
    const m = h?.match(/^"(\d+)"$/);
    return m ? Number(m[1]) : null;
};
const corr = (req) => req.headers['x-correlation-id'] ?? globalThis.crypto.randomUUID();
export function registerEntityRoutes(app, repo) {
    // POST /api/v1/entities
    app.post('/api/v1/entities', async (req, reply) => {
        const correlationId = corr(req);
        try {
            const body = req.body;
            if (!body?.legalName) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'legalName is required', field: 'legalName' } });
            }
            const rec = await createEntity({ legalName: String(body.legalName), country: body.country, workWeek: body.workWeek }, repo, correlationId);
            return reply.status(201).header('ETag', etag(rec.version)).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // GET /api/v1/entities
    app.get('/api/v1/entities', async (_req, reply) => {
        const items = await repo.listEntities();
        return reply.send({ items });
    });
    // GET /api/v1/entities/:id
    app.get('/api/v1/entities/:id', async (req, reply) => {
        const { id } = req.params;
        const rec = await repo.findEntityById(id);
        if (!rec)
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Entity ${id} not found` } });
        return reply.header('ETag', etag(rec.version)).send(rec);
    });
    // PATCH /api/v1/entities/:id
    app.patch('/api/v1/entities/:id', async (req, reply) => {
        const correlationId = corr(req);
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null)
            return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
        try {
            const body = req.body;
            const rec = await updateEntity(id, body, ifMatch, repo, correlationId);
            return reply.header('ETag', etag(rec.version)).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // POST /api/v1/entities/:id/holidays
    app.post('/api/v1/entities/:id/holidays', async (req, reply) => {
        const { id } = req.params;
        try {
            const body = req.body;
            if (!body?.holidayDate || !body?.name) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'holidayDate and name are required' } });
            }
            const rec = await upsertHoliday({ entityId: id, holidayDate: String(body.holidayDate), name: String(body.name), isReligious: Boolean(body.isReligious) }, repo);
            return reply.status(201).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // GET /api/v1/entities/:id/holidays
    app.get('/api/v1/entities/:id/holidays', async (req, reply) => {
        const { id } = req.params;
        const items = await repo.listHolidays(id);
        return reply.send({ items });
    });
    // DELETE /api/v1/entities/:id/holidays/:date
    app.delete('/api/v1/entities/:id/holidays/:date', async (req, reply) => {
        const { id, date } = req.params;
        try {
            await deleteHoliday(id, date, repo);
            return reply.status(204).send();
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message } });
            throw err;
        }
    });
}
