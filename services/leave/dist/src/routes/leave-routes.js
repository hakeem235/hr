import { createLeaveRequest } from '../domain/create-request.js';
import { cancelLeaveRequest } from '../domain/cancel-request.js';
import { getLeaveTypes, getLeavePolicy } from '../domain/leave-types.js';
import { LeaveError, statusFor } from '../domain/working-days.js';
function correlationId(req) {
    return req.headers['x-correlation-id'] ?? crypto.randomUUID();
}
function etag(version) {
    return `"${version}"`;
}
function parseIfMatch(header) {
    if (!header)
        return null;
    const m = header.match(/^"(\d+)"$/);
    return m ? Number(m[1]) : null;
}
export function registerLeaveRoutes(app, deps) {
    /* ── Health ─────────────────────────────────────────────── */
    app.get('/api/v1/health', async () => ({ status: 'ok', service: 'leave' }));
    /* ── Leave types ────────────────────────────────────────── */
    app.get('/api/v1/leave-types', async (req, reply) => {
        const { entityId = 'ent_default' } = req.query;
        return reply.send(getLeaveTypes(entityId));
    });
    /* ── Leave policies ─────────────────────────────────────── */
    app.get('/api/v1/leave-policies/:typeId', async (req, reply) => {
        const { typeId } = req.params;
        const { entityId = 'ent_default' } = req.query;
        const policy = getLeavePolicy(typeId, entityId);
        if (!policy) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: `No policy found for leave type '${typeId}'` },
            });
        }
        return reply.send(policy);
    });
    /* ── Leave balances ─────────────────────────────────────── */
    app.get('/api/v1/leave-balances', async (req, reply) => {
        const { employeeId, entityId = 'ent_default' } = req.query;
        if (!employeeId) {
            return reply.status(400).send({
                error: { code: 'INVALID_INPUT', message: 'employeeId query param is required', field: 'employeeId' },
            });
        }
        const year = new Date().getFullYear();
        const types = getLeaveTypes(entityId);
        const balances = await Promise.all(types.map(async (lt) => {
            const bal = await deps.repo.getBalance(employeeId, lt.id, year);
            return {
                leaveTypeId: lt.id,
                leaveTypeName: lt.name,
                leaveTypeNameAr: lt.nameAr,
                annualEntitlementDays: lt.annualEntitlementDays,
                accruedDays: bal.accruedDays,
                usedDays: bal.usedDays,
                carriedDays: bal.carriedDays,
                availableDays: bal.accruedDays + bal.carriedDays - bal.usedDays,
            };
        }));
        return reply.send(balances);
    });
    /* ── List leave requests ────────────────────────────────── */
    app.get('/api/v1/leave-requests', async (req, reply) => {
        const q = req.query;
        const limit = Math.min(Number(q.limit ?? 20), 100);
        const { items, nextCursor } = await deps.repo.listRequests({
            employeeId: q.employeeId,
            entityId: q.entityId,
            status: q.status,
            cursor: q.cursor,
            limit,
        });
        return reply.send({ items, nextCursor: nextCursor ?? null, limit });
    });
    /* ── Create leave request ───────────────────────────────── */
    app.post('/api/v1/leave-requests', async (req, reply) => {
        const idem = req.headers['idempotency-key'];
        if (!idem || typeof idem !== 'string') {
            return reply.status(400).send({
                error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header is required.' },
            });
        }
        const b = req.body;
        for (const f of ['entityId', 'employeeId', 'leaveTypeId', 'startDate', 'endDate']) {
            if (!b?.[f]) {
                return reply.status(400).send({
                    error: { code: 'INVALID_INPUT', message: `Missing field: ${f}`, field: f },
                });
            }
        }
        try {
            const cal = await deps.calendarFor(b.entityId);
            const rec = await createLeaveRequest({
                entityId: b.entityId,
                employeeId: b.employeeId,
                leaveTypeId: b.leaveTypeId,
                startDate: b.startDate,
                endDate: b.endDate,
                reason: b.reason,
                attachments: b.attachments,
                idempotencyKey: idem,
            }, cal, deps.repo, deps.wf, correlationId(req));
            return reply
                .status(201)
                .header('ETag', etag(rec.version))
                .send(rec);
        }
        catch (e) {
            if (e instanceof LeaveError) {
                return reply.status(statusFor(e.code)).send({
                    error: { code: e.code, message: e.message, field: e.field, details: e.details },
                });
            }
            req.log.error(e);
            return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Unexpected error.' } });
        }
    });
    /* ── Get leave request detail ───────────────────────────── */
    app.get('/api/v1/leave-requests/:id', async (req, reply) => {
        const { id } = req.params;
        const rec = await deps.repo.findById(id);
        if (!rec) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: `Leave request ${id} not found` },
            });
        }
        return reply
            .header('ETag', etag(rec.version))
            .header('Cache-Control', 'no-cache')
            .send(rec);
    });
    /* ── Cancel leave request ───────────────────────────────── */
    app.post('/api/v1/leave-requests/:id/cancel', async (req, reply) => {
        const { id } = req.params;
        const ifMatch = parseIfMatch(req.headers['if-match']);
        if (ifMatch === null) {
            return reply.status(428).send({
                error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header is required for cancellation.' },
            });
        }
        const b = (req.body ?? {});
        const requesterId = b.requesterId;
        if (!requesterId) {
            return reply.status(400).send({
                error: { code: 'INVALID_INPUT', message: 'requesterId is required', field: 'requesterId' },
            });
        }
        try {
            const rec = await cancelLeaveRequest(id, requesterId, ifMatch, correlationId(req), deps.repo);
            return reply
                .header('ETag', etag(rec.version))
                .send(rec);
        }
        catch (e) {
            if (e instanceof LeaveError) {
                const code = e.code === 'NOT_FOUND' ? 404
                    : e.code === 'FORBIDDEN' ? 403
                        : e.code === 'CONFLICT' ? 409
                            : statusFor(e.code);
                return reply.status(code).send({
                    error: { code: e.code, message: e.message, field: e.field, details: e.details },
                });
            }
            req.log.error(e);
            return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Unexpected error.' } });
        }
    });
    /* ── Conflict check ─────────────────────────────────────── */
    app.get('/api/v1/leave-requests/:id/conflicts', async (req, reply) => {
        const { id } = req.params;
        const rec = await deps.repo.findById(id);
        if (!rec) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: `Leave request ${id} not found` },
            });
        }
        const hasOverlap = await deps.repo.hasOverlap(rec.employeeId, rec.startDate, rec.endDate, id);
        return reply.send({ requestId: id, hasOverlap, checkedAt: new Date().toISOString() });
    });
}
