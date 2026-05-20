import type { FastifyInstance } from 'fastify';
import type { NotifRepo, SendInput, NotifType, Channel } from '../domain/types.js';
import type { ChannelProvider } from '../domain/channels.js';
import { sendNotification, markRead, markAllRead } from '../domain/notification.js';
import { NotifError, statusFor } from '../domain/errors.js';

interface Deps {
  repo: NotifRepo;
  providers: Record<Channel, ChannelProvider>;
}

export function registerNotificationRoutes(app: FastifyInstance, deps: Deps): void {
  const { repo, providers } = deps;

  /* ── Health ──────────────────────────────────────────────── */
  app.get('/api/v1/health', async () => ({ status: 'ok', service: 'notifications' }));

  /* ── Send (fan-out) ──────────────────────────────────────── */
  app.post('/api/v1/notifications', async (req, reply) => {
    try {
      const body = req.body as Record<string, unknown>;
      const missing = ['recipientId', 'entityId', 'type', 'vars'].filter((k) => !body?.[k]);
      if (missing.length) {
        return reply.status(422).send({ error: { code: 'VALIDATION', message: `Missing: ${missing.join(', ')}` } });
      }
      const input: SendInput = {
        recipientId:     String(body.recipientId),
        entityId:        String(body.entityId),
        type:            body.type as NotifType,
        priority:        body.priority as SendInput['priority'],
        vars:            body.vars as Record<string, string>,
        sourceEventType: body.sourceEventType as string | undefined,
        sourceEventId:   body.sourceEventId as string | undefined,
      };
      const contacts = (body.contacts ?? {}) as Partial<Record<Channel, string>>;
      const rec = await sendNotification(input, repo, providers, contacts);
      return reply.status(201).send(rec);
    } catch (err) {
      if (err instanceof NotifError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field } });
      throw err;
    }
  });

  /* ── List (in-app inbox) ─────────────────────────────────── */
  app.get('/api/v1/notifications', async (req, reply) => {
    const q = req.query as { recipientId?: string; entityId?: string; read?: string; type?: string; cursor?: string; limit?: string };
    if (!q.recipientId) return reply.status(422).send({ error: { code: 'VALIDATION', message: 'recipientId required' } });
    const limit = Math.min(Number(q.limit ?? 20), 100);
    const { items, nextCursor } = await repo.listNotifications({
      recipientId: q.recipientId,
      entityId:    q.entityId,
      read:        q.read !== undefined ? q.read === 'true' : undefined,
      type:        q.type as NotifType | undefined,
      cursor:      q.cursor,
      limit,
    });
    return reply.send({ items, nextCursor: nextCursor ?? null, limit });
  });

  /* ── Get single ──────────────────────────────────────────── */
  app.get('/api/v1/notifications/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rec = await repo.findById(id);
    if (!rec) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Notification ${id} not found` } });
    return reply.send(rec);
  });

  /* ── Mark single read ────────────────────────────────────── */
  app.post('/api/v1/notifications/:id/read', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const rec = await markRead(id, repo);
      return reply.send(rec);
    } catch (err) {
      if (err instanceof NotifError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  /* ── Mark all read ───────────────────────────────────────── */
  app.post('/api/v1/notifications/read-all', async (req, reply) => {
    const q = req.query as { recipientId?: string };
    if (!q.recipientId) return reply.status(422).send({ error: { code: 'VALIDATION', message: 'recipientId required' } });
    const count = await markAllRead(q.recipientId, repo);
    return reply.send({ marked: count });
  });

  /* ── Unread count ────────────────────────────────────────── */
  app.get('/api/v1/notifications/unread-count', async (req, reply) => {
    const q = req.query as { recipientId?: string };
    if (!q.recipientId) return reply.status(422).send({ error: { code: 'VALIDATION', message: 'recipientId required' } });
    const { items } = await repo.listNotifications({ recipientId: q.recipientId, read: false, limit: 1000 });
    return reply.send({ count: items.length });
  });

  /* ── Preferences ─────────────────────────────────────────── */
  app.get('/api/v1/preferences/:recipientId', async (req, reply) => {
    const { recipientId } = req.params as { recipientId: string };
    const pref = await repo.getPreference(recipientId);
    if (!pref) return reply.send({ recipientId, locale: 'en', channels: ['in_app'] });
    return reply.send(pref);
  });

  app.put('/api/v1/preferences/:recipientId', async (req, reply) => {
    const { recipientId } = req.params as { recipientId: string };
    const body = req.body as { locale?: string; channels?: string[]; quietFrom?: string; quietUntil?: string };
    const existing = await repo.getPreference(recipientId) ?? { recipientId, locale: 'en' as const, channels: ['in_app'] as Channel[] };
    const updated = {
      ...existing,
      locale:      (body.locale ?? existing.locale) as 'en' | 'ar',
      channels:    (body.channels ?? existing.channels) as Channel[],
      quietFrom:   body.quietFrom  ?? existing.quietFrom,
      quietUntil:  body.quietUntil ?? existing.quietUntil,
    };
    // Ensure in_app is always present
    if (!updated.channels.includes('in_app')) updated.channels.unshift('in_app');
    await repo.savePreference(updated);
    return reply.send(updated);
  });
}
