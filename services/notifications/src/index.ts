import Fastify from 'fastify';
import type {
  NotifRepo, NotificationRecord, RecipientPreference, NotifFilter,
} from './domain/types.js';
import { ALL_PROVIDERS } from './domain/channels.js';
import { registerNotificationRoutes } from './routes/notification-routes.js';
import { renderTemplate } from './domain/templates.js';

// ─── In-Memory Repo ───────────────────────────────────────────────────────────

class InMemoryNotifRepo implements NotifRepo {
  private notifications = new Map<string, NotificationRecord>();
  private preferences   = new Map<string, RecipientPreference>();

  async findById(id: string) { return this.notifications.get(id) ?? null; }

  async listNotifications(filter: NotifFilter) {
    let all = [...this.notifications.values()]
      .filter((n) => !filter.recipientId || n.recipientId === filter.recipientId)
      .filter((n) => !filter.entityId    || n.entityId    === filter.entityId)
      .filter((n) => filter.read === undefined || n.read === filter.read)
      .filter((n) => !filter.type        || n.type        === filter.type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first

    if (filter.cursor) {
      const idx = all.findIndex((n) => n.id === filter.cursor);
      if (idx !== -1) all = all.slice(idx + 1);
    }
    const items = all.slice(0, filter.limit);
    return {
      items,
      nextCursor: all.length > filter.limit ? items[items.length - 1]?.id : undefined,
    };
  }

  async save(rec: NotificationRecord) { this.notifications.set(rec.id, rec); }

  async markRead(id: string): Promise<NotificationRecord> {
    const rec = this.notifications.get(id)!;
    const updated = { ...rec, read: true };
    this.notifications.set(id, updated);
    return updated;
  }

  async markAllRead(recipientId: string): Promise<number> {
    let count = 0;
    for (const [id, rec] of this.notifications) {
      if (rec.recipientId === recipientId && !rec.read) {
        this.notifications.set(id, { ...rec, read: true });
        count++;
      }
    }
    return count;
  }

  async getPreference(recipientId: string) { return this.preferences.get(recipientId) ?? null; }
  async savePreference(pref: RecipientPreference) { this.preferences.set(pref.recipientId, pref); }
}

// ─── Seeded data ──────────────────────────────────────────────────────────────

const repo = new InMemoryNotifRepo();
const NOW = new Date().toISOString();

// Seed recipient preferences
for (const [id, locale] of [
  ['emp_018f23', 'ar'], ['emp_004a11', 'en'], ['emp_mgr01', 'ar'],
  ['emp_hr01', 'ar'], ['emp_07d2f9', 'en'], ['emp_012e44', 'ar'],
] as [string, 'en' | 'ar'][]) {
  await repo.savePreference({ recipientId: id, locale, channels: ['in_app', 'email'] });
}

// Seed a few notifications for demo
const seedNotifs: NotificationRecord[] = [
  {
    id: 'ntf_000001', recipientId: 'emp_004a11', entityId: 'ent_default',
    type: 'approval_required',
    priority: 'high',
    ...renderTemplate('approval_required', { title: 'Leave Request', requesterName: 'Ahmed Al-Rashidi', slaDueAt: '17:00' }, 'en'),
    vars: { title: 'Leave Request', requesterName: 'Ahmed Al-Rashidi', slaDueAt: '17:00' },
    sourceEventType: 'StepActivated', read: false,
    deliveries: [{ channel: 'in_app', status: 'sent', attemptedAt: NOW }],
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: 'ntf_000002', recipientId: 'emp_018f23', entityId: 'ent_default',
    type: 'leave_submitted',
    priority: 'normal',
    ...renderTemplate('leave_submitted', { leaveType: 'Annual', startDate: '2026-06-01', endDate: '2026-06-07' }, 'ar'),
    vars: { leaveType: 'Annual', startDate: '2026-06-01', endDate: '2026-06-07' },
    sourceEventType: 'LeaveRequestSubmitted', read: false,
    deliveries: [{ channel: 'in_app', status: 'sent', attemptedAt: NOW }],
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: 'ntf_000003', recipientId: 'emp_07d2f9', entityId: 'ent_default',
    type: 'letter_issued',
    priority: 'normal',
    ...renderTemplate('letter_issued', { letterType: 'Salary Certificate', documentId: 'doc_abc001' }, 'en'),
    vars: { letterType: 'Salary Certificate', documentId: 'doc_abc001' },
    sourceEventType: 'LetterIssued', read: true,
    deliveries: [{ channel: 'in_app', status: 'sent', attemptedAt: NOW }, { channel: 'email', status: 'sent', attemptedAt: NOW }],
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
];

for (const n of seedNotifs) await repo.save(n);

// ─── Server ───────────────────────────────────────────────────────────────────

const app = Fastify({ logger: true });

app.get('/', async () => ({
  service: 'notifications',
  version: '0.1.0',
  endpoints: [
    'POST /api/v1/notifications',
    'GET  /api/v1/notifications?recipientId=',
    'GET  /api/v1/notifications/unread-count?recipientId=',
    'GET  /api/v1/notifications/:id',
    'POST /api/v1/notifications/:id/read',
    'POST /api/v1/notifications/read-all?recipientId=',
    'GET  /api/v1/preferences/:recipientId',
    'PUT  /api/v1/preferences/:recipientId',
    'GET  /api/v1/health',
  ],
}));

registerNotificationRoutes(app, { repo, providers: ALL_PROVIDERS });

const port = Number(process.env.PORT ?? 3005);
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
