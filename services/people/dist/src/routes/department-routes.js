import { createDepartment, updateDepartment } from '../domain/department.js';
import { PeopleError, statusFor } from '../domain/errors.js';
const etag = (v) => `"${v}"`;
const parseIfMatch = (h) => {
    const m = h?.match(/^"(\d+)"$/);
    return m ? Number(m[1]) : null;
};
const corr = (req) => req.headers['x-correlation-id'] ?? globalThis.crypto.randomUUID();
export function registerDepartmentRoutes(app, repo) {
    // POST /api/v1/departments
    app.post('/api/v1/departments', async (req, reply) => {
        const correlationId = corr(req);
        try {
            const body = req.body;
            if (!body?.entityId || !body?.name) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'entityId and name are required' } });
            }
            const rec = await createDepartment({ entityId: String(body.entityId), name: String(body.name), parentId: body.parentId }, repo, correlationId);
            return reply.status(201).header('ETag', etag(rec.version)).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // GET /api/v1/departments?entityId=
    app.get('/api/v1/departments', async (req, reply) => {
        const { entityId } = req.query;
        if (!entityId)
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'entityId query param required' } });
        const items = await repo.listDepartments(entityId);
        return reply.send({ items });
    });
    // GET /api/v1/departments/:id
    app.get('/api/v1/departments/:id', async (req, reply) => {
        const { id } = req.params;
        const rec = await repo.findDepartmentById(id);
        if (!rec)
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Department ${id} not found` } });
        return reply.header('ETag', etag(rec.version)).send(rec);
    });
    // PATCH /api/v1/departments/:id
    app.patch('/api/v1/departments/:id', async (req, reply) => {
        const correlationId = corr(req);
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null)
            return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
        try {
            const body = req.body;
            const rec = await updateDepartment(id, body, ifMatch, repo, correlationId);
            return reply.header('ETag', etag(rec.version)).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
}
