import { createPayrollRun, calculatePayrollRun, approvePayrollRun, submitWps, markRunPaid, cancelPayrollRun, } from '../domain/payroll-run.js';
import { calculateGosi } from '../domain/gosi.js';
import { PayrollError, statusFor } from '../domain/errors.js';
const etag = (v) => `"${v}"`;
const parseIfMatch = (h) => {
    const m = h?.match(/^"(\d+)"$/);
    return m ? Number(m[1]) : null;
};
const corr = (req) => req.headers['x-correlation-id'] ?? globalThis.crypto.randomUUID();
export function registerPayrollRoutes(app, repo) {
    app.get('/api/v1/health', async () => ({ status: 'ok', service: 'payroll' }));
    // ── Payroll runs ────────────────────────────────────────────────────────────
    app.post('/api/v1/payroll-runs', async (req, reply) => {
        const correlationId = corr(req);
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey) {
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'Idempotency-Key header required' } });
        }
        try {
            const body = req.body;
            const missing = ['entityId', 'period'].filter((k) => !body?.[k]);
            if (missing.length) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: `Missing: ${missing.join(', ')}` } });
            }
            const run = await createPayrollRun({ entityId: String(body.entityId), period: String(body.period), idempotencyKey }, repo, correlationId);
            return reply.status(201).header('ETag', etag(run.version)).send(run);
        }
        catch (err) {
            if (err instanceof PayrollError) {
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field } });
            }
            throw err;
        }
    });
    app.get('/api/v1/payroll-runs', async (req, reply) => {
        const q = req.query;
        const limit = Math.min(Number(q.limit ?? 20), 100);
        const { items, nextCursor } = await repo.listRuns({
            entityId: q.entityId,
            period: q.period,
            status: q.status,
            cursor: q.cursor,
            limit,
        });
        return reply.send({ items, nextCursor: nextCursor ?? null, limit });
    });
    app.get('/api/v1/payroll-runs/:id', async (req, reply) => {
        const { id } = req.params;
        const run = await repo.findRunById(id);
        if (!run) {
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `PayrollRun ${id} not found` } });
        }
        return reply.header('ETag', etag(run.version)).send(run);
    });
    app.post('/api/v1/payroll-runs/:id/calculate', async (req, reply) => {
        const correlationId = corr(req);
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null) {
            return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
        }
        try {
            const body = req.body;
            if (!Array.isArray(body?.employees) || body.employees.length === 0) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: 'employees array required' } });
            }
            const { run, payslips } = await calculatePayrollRun(id, body.employees, ifMatch, repo, correlationId);
            return reply.header('ETag', etag(run.version)).send({ run, payslips });
        }
        catch (err) {
            if (err instanceof PayrollError) {
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field } });
            }
            throw err;
        }
    });
    app.post('/api/v1/payroll-runs/:id/approve', async (req, reply) => {
        const correlationId = corr(req);
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null) {
            return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
        }
        try {
            const run = await approvePayrollRun(id, ifMatch, repo, correlationId);
            return reply.header('ETag', etag(run.version)).send(run);
        }
        catch (err) {
            if (err instanceof PayrollError) {
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message } });
            }
            throw err;
        }
    });
    app.post('/api/v1/payroll-runs/:id/submit-wps', async (req, reply) => {
        const correlationId = corr(req);
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null) {
            return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
        }
        try {
            const run = await submitWps(id, ifMatch, repo, correlationId);
            return reply.header('ETag', etag(run.version)).send(run);
        }
        catch (err) {
            if (err instanceof PayrollError) {
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message } });
            }
            throw err;
        }
    });
    app.post('/api/v1/payroll-runs/:id/mark-paid', async (req, reply) => {
        const correlationId = corr(req);
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null) {
            return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
        }
        try {
            const run = await markRunPaid(id, ifMatch, repo, correlationId);
            return reply.header('ETag', etag(run.version)).send(run);
        }
        catch (err) {
            if (err instanceof PayrollError) {
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message } });
            }
            throw err;
        }
    });
    app.post('/api/v1/payroll-runs/:id/cancel', async (req, reply) => {
        const correlationId = corr(req);
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null) {
            return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
        }
        try {
            const run = await cancelPayrollRun(id, ifMatch, repo, correlationId);
            return reply.header('ETag', etag(run.version)).send(run);
        }
        catch (err) {
            if (err instanceof PayrollError) {
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message } });
            }
            throw err;
        }
    });
    // ── Payslips ────────────────────────────────────────────────────────────────
    app.get('/api/v1/payroll-runs/:id/payslips', async (req, reply) => {
        const { id } = req.params;
        const run = await repo.findRunById(id);
        if (!run) {
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `PayrollRun ${id} not found` } });
        }
        const slips = await repo.listPayslipsByRun(id);
        return reply.send({ items: slips, total: slips.length });
    });
    app.get('/api/v1/payslips/:id', async (req, reply) => {
        const { id } = req.params;
        const slip = await repo.findPayslipById(id);
        if (!slip) {
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Payslip ${id} not found` } });
        }
        return reply.header('ETag', etag(slip.version)).send(slip);
    });
    // ── GOSI calculator (utility endpoint) ─────────────────────────────────────
    app.post('/api/v1/gosi/calculate', async (req, reply) => {
        try {
            const body = req.body;
            const missing = ['employeeId', 'basicMinor', 'nationality'].filter((k) => !body?.[k] && body?.[k] !== 0);
            if (missing.length) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: `Missing: ${missing.join(', ')}` } });
            }
            const result = calculateGosi(String(body.employeeId), Number(body.basicMinor), String(body.nationality));
            return reply.send(result);
        }
        catch (err) {
            if (err instanceof PayrollError) {
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field } });
            }
            throw err;
        }
    });
}
