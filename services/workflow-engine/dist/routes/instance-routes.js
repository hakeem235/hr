import { EngineError } from '../domain/types.js';
function httpStatus(code) {
    switch (code) {
        case 'NOT_FOUND': return 404;
        case 'FORBIDDEN': return 403;
        case 'INVALID_STATE':
        case 'INVALID_STATE_TRANSITION': return 409;
        case 'DEFINITION_NOT_FOUND': return 422;
        default: return 400;
    }
}
export function registerInstanceRoutes(app, executor) {
    /* ── Start a new instance ──────────────────────────────────── */
    app.post('/api/v1/workflow-instances', async (req, reply) => {
        const b = req.body;
        if (!b?.workflowId) {
            return reply.status(400).send({
                error: { code: 'INVALID_INPUT', message: 'workflowId is required' },
            });
        }
        try {
            const instance = await executor.startInstance(b.workflowId, b.context ?? {});
            return reply.status(201).send(instance);
        }
        catch (e) {
            if (e instanceof EngineError) {
                return reply.status(httpStatus(e.code)).send({ error: { code: e.code, message: e.message } });
            }
            req.log.error(e);
            return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Unexpected error.' } });
        }
    });
    /* ── Get instance + step executions ───────────────────────── */
    app.get('/api/v1/workflow-instances/:id', async (req, reply) => {
        const { id } = req.params;
        const instance = await executor.repo.getInstance(id);
        if (!instance) {
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Instance "${id}" not found` } });
        }
        const steps = await executor.repo.getStepExecutions(id);
        return reply.send({ ...instance, steps });
    });
    /* ── THE decision endpoint (workflow-engine.md §7) ─────────── */
    app.post('/api/v1/workflow-instances/:id/steps/:stepId/decision', async (req, reply) => {
        const { id, stepId } = req.params;
        const b = req.body;
        if (!b?.decision || !['approved', 'declined'].includes(b.decision)) {
            return reply.status(400).send({
                error: { code: 'INVALID_INPUT', message: 'decision must be "approved" or "declined"' },
            });
        }
        if (b.decision === 'declined' && !b.note) {
            return reply.status(422).send({
                error: { code: 'NOTE_REQUIRED', message: 'note is required when declining' },
            });
        }
        const actorId = req.headers['x-actor-id'] ?? b.actorId;
        if (!actorId) {
            return reply.status(400).send({
                error: { code: 'INVALID_INPUT', message: 'actorId required (header X-Actor-Id or body actorId)' },
            });
        }
        try {
            const instance = await executor.processDecision(id, stepId, b.decision, actorId, b.note);
            return reply.send(instance);
        }
        catch (e) {
            if (e instanceof EngineError) {
                return reply.status(httpStatus(e.code)).send({ error: { code: e.code, message: e.message, details: e.details } });
            }
            req.log.error(e);
            return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Unexpected error.' } });
        }
    });
    /* ── Cancel an instance ────────────────────────────────────── */
    app.post('/api/v1/workflow-instances/:id/cancel', async (req, reply) => {
        const { id } = req.params;
        const b = (req.body ?? {});
        try {
            const instance = await executor.cancelInstance(id, b.reason ?? 'Cancelled by request');
            return reply.send(instance);
        }
        catch (e) {
            if (e instanceof EngineError) {
                return reply.status(httpStatus(e.code)).send({ error: { code: e.code, message: e.message } });
            }
            req.log.error(e);
            return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Unexpected error.' } });
        }
    });
    /* ── Pending approvals inbox ───────────────────────────────── */
    app.get('/api/v1/approvals', async (req, reply) => {
        const { actorId, limit } = req.query;
        const items = await executor.repo.listPendingApprovals(actorId, Number(limit ?? 50));
        return reply.send({ items });
    });
}
