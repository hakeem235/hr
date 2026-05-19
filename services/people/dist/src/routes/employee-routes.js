import { createEmployee, updateEmployeeStatus } from '../domain/employee.js';
import { createPosition, listPositions } from '../domain/position.js';
import { createCompensation, listCompensation, getCurrentCompensation } from '../domain/compensation.js';
import { PeopleError, statusFor } from '../domain/errors.js';
const etag = (v) => `"${v}"`;
const parseIfMatch = (h) => {
    const m = h?.match(/^"(\d+)"$/);
    return m ? Number(m[1]) : null;
};
const corr = (req) => req.headers['x-correlation-id'] ?? globalThis.crypto.randomUUID();
export function registerEmployeeRoutes(app, repo) {
    // POST /api/v1/employees
    app.post('/api/v1/employees', async (req, reply) => {
        const correlationId = corr(req);
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey) {
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'Idempotency-Key header required' } });
        }
        try {
            const body = req.body;
            if (!body?.personId || !body?.entityId || !body?.employeeNo || !body?.hireDate) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'personId, entityId, employeeNo, hireDate are required' } });
            }
            const rec = await createEmployee({ personId: String(body.personId), entityId: String(body.entityId), employeeNo: String(body.employeeNo), hireDate: String(body.hireDate), idempotencyKey }, repo, correlationId);
            return reply.status(201).header('ETag', etag(rec.version)).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // GET /api/v1/employees
    app.get('/api/v1/employees', async (req, reply) => {
        const q = req.query;
        const limit = Math.min(Number(q.limit ?? 20), 100);
        const { items, nextCursor } = await repo.listEmployees({
            entityId: q.entityId,
            status: q.status,
            role: q.role,
            cursor: q.cursor,
            limit,
        });
        return reply.send({ items, nextCursor: nextCursor ?? null, limit });
    });
    // GET /api/v1/employees/:id
    app.get('/api/v1/employees/:id', async (req, reply) => {
        const { id } = req.params;
        const rec = await repo.findEmployeeById(id);
        if (!rec)
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Employee ${id} not found` } });
        return reply.header('ETag', etag(rec.version)).send(rec);
    });
    // POST /api/v1/employees/:id/status  — state transitions
    app.post('/api/v1/employees/:id/status', async (req, reply) => {
        const correlationId = corr(req);
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null)
            return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
        try {
            const body = req.body;
            if (!body?.status)
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'status is required' } });
            const rec = await updateEmployeeStatus(id, body.status, body.exitDate, ifMatch, repo, correlationId);
            return reply.header('ETag', etag(rec.version)).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // ─── Positions ────────────────────────────────────────────────────────────
    // POST /api/v1/employees/:id/positions
    app.post('/api/v1/employees/:id/positions', async (req, reply) => {
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey)
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'Idempotency-Key header required' } });
        try {
            const { id } = req.params;
            const body = req.body;
            if (!body?.title || !body?.grade || !body?.departmentId || !body?.workflowRole || !body?.effectiveFrom) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'title, grade, departmentId, workflowRole, effectiveFrom are required' } });
            }
            const rec = await createPosition({ employeeId: id, title: String(body.title), grade: String(body.grade), departmentId: String(body.departmentId), reportsTo: body.reportsTo, workflowRole: body.workflowRole, effectiveFrom: String(body.effectiveFrom), idempotencyKey }, repo);
            return reply.status(201).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // GET /api/v1/employees/:id/positions
    app.get('/api/v1/employees/:id/positions', async (req, reply) => {
        const { id } = req.params;
        const items = await listPositions(id, repo);
        return reply.send({ items });
    });
    // GET /api/v1/employees/:id/positions/current
    app.get('/api/v1/employees/:id/positions/current', async (req, reply) => {
        const { id } = req.params;
        const q = req.query;
        const rec = await repo.getCurrentPosition(id, q.asOf);
        if (!rec)
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `No current position for employee ${id}` } });
        return reply.send(rec);
    });
    // ─── Compensation ─────────────────────────────────────────────────────────
    // POST /api/v1/employees/:id/compensation
    app.post('/api/v1/employees/:id/compensation', async (req, reply) => {
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey)
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'Idempotency-Key header required' } });
        try {
            const { id } = req.params;
            const body = req.body;
            if (!body?.basicMinor || !body?.effectiveFrom) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'basicMinor, effectiveFrom are required' } });
            }
            const rec = await createCompensation({ employeeId: id, basicMinor: Number(body.basicMinor), housingMinor: Number(body.housingMinor ?? 0), transportMinor: Number(body.transportMinor ?? 0), otherMinor: Number(body.otherMinor ?? 0), currency: body.currency, effectiveFrom: String(body.effectiveFrom), idempotencyKey }, repo);
            return reply.status(201).send(rec);
        }
        catch (err) {
            if (err instanceof PeopleError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
            throw err;
        }
    });
    // GET /api/v1/employees/:id/compensation
    app.get('/api/v1/employees/:id/compensation', async (req, reply) => {
        const { id } = req.params;
        const items = await listCompensation(id, repo);
        return reply.send({ items });
    });
    // GET /api/v1/employees/:id/compensation/current
    app.get('/api/v1/employees/:id/compensation/current', async (req, reply) => {
        const { id } = req.params;
        const q = req.query;
        const rec = await getCurrentCompensation(id, q.asOf, repo);
        if (!rec)
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `No current compensation for employee ${id}` } });
        return reply.send(rec);
    });
}
