import { sendNotification, markRead, markAllRead } from '../domain/notification.js';
import { NotifError, statusFor } from '../domain/errors.js';
export function registerNotificationRoutes(app, deps) {
    const { repo, providers } = deps;
    /* ── Health ──────────────────────────────────────────────── */
    app.get('/api/v1/health', async () => ({ status: 'ok', service: 'notifications' }));
    /* ── Send (fan-out) ──────────────────────────────────────── */
    app.post('/api/v1/notifications', async (req, reply) => {
        try {
            const body = req.body;
            const missing = ['recipientId', 'entityId', 'type', 'vars'].filter((k) => !body?.[k]);
            if (missing.length) {
                return reply.status(422).send({ error: { code: 'VALIDATION', message: `Missing: ${missing.join(', ')}` } });
            }
            const input = {
                recipientId: String(body.recipientId),
                entityId: String(body.entityId),
                type: body.type,
                priority: body.priority,
                vars: body.vars,
                sourceEventType: body.sourceEventType,
                sourceEventId: body.sourceEventId,
            };
            const contacts = (body.contacts ?? {});
            const rec = await sendNotification(input, repo, providers, contacts);
            return reply.status(201).send(rec);
        }
        catch (err) {
            if (err instanceof NotifError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field } });
            throw err;
        }
    });
    /* ── List (in-app inbox) ─────────────────────────────────── */
    app.get('/api/v1/notifications', async (req, reply) => {
        const q = req.query;
        if (!q.recipientId)
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'recipientId required' } });
        const limit = Math.min(Number(q.limit ?? 20), 100);
        const { items, nextCursor } = await repo.listNotifications({
            recipientId: q.recipientId,
            entityId: q.entityId,
            read: q.read !== undefined ? q.read === 'true' : undefined,
            type: q.type,
            cursor: q.cursor,
            limit,
        });
        return reply.send({ items, nextCursor: nextCursor ?? null, limit });
    });
    /* ── Get single ──────────────────────────────────────────── */
    app.get('/api/v1/notifications/:id', async (req, reply) => {
        const { id } = req.params;
        const rec = await repo.findById(id);
        if (!rec)
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Notification ${id} not found` } });
        return reply.send(rec);
    });
    /* ── Mark single read ────────────────────────────────────── */
    app.post('/api/v1/notifications/:id/read', async (req, reply) => {
        try {
            const { id } = req.params;
            const rec = await markRead(id, repo);
            return reply.send(rec);
        }
        catch (err) {
            if (err instanceof NotifError)
                return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message } });
            throw err;
        }
    });
    /* ── Mark all read ───────────────────────────────────────── */
    app.post('/api/v1/notifications/read-all', async (req, reply) => {
        const q = req.query;
        if (!q.recipientId)
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'recipientId required' } });
        const count = await markAllRead(q.recipientId, repo);
        return reply.send({ marked: count });
    });
    /* ── Unread count ────────────────────────────────────────── */
    app.get('/api/v1/notifications/unread-count', async (req, reply) => {
        const q = req.query;
        if (!q.recipientId)
            return reply.status(422).send({ error: { code: 'VALIDATION', message: 'recipientId required' } });
        const { items } = await repo.listNotifications({ recipientId: q.recipientId, read: false, limit: 1000 });
        return reply.send({ count: items.length });
    });
    /* ── Preferences ─────────────────────────────────────────── */
    app.get('/api/v1/preferences/:recipientId', async (req, reply) => {
        const { recipientId } = req.params;
        const pref = await repo.getPreference(recipientId);
        if (!pref)
            return reply.send({ recipientId, locale: 'en', channels: ['in_app'] });
        return reply.send(pref);
    });
    app.put('/api/v1/preferences/:recipientId', async (req, reply) => {
        const { recipientId } = req.params;
        const body = req.body;
        const existing = await repo.getPreference(recipientId) ?? { recipientId, locale: 'en', channels: ['in_app'] };
        const updated = {
            ...existing,
            locale: (body.locale ?? existing.locale),
            channels: (body.channels ?? existing.channels),
            quietFrom: body.quietFrom ?? existing.quietFrom,
            quietUntil: body.quietUntil ?? existing.quietUntil,
        };
        // Ensure in_app is always present
        if (!updated.channels.includes('in_app'))
            updated.channels.unshift('in_app');
        await repo.savePreference(updated);
        return reply.send(updated);
    });
}
