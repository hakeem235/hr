import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NotifRepo, NotificationRecord, RecipientPreference, NotifFilter, Channel } from '../src/domain/types.js';
import { NotifError } from '../src/domain/errors.js';
import { renderTemplate, interpolate } from '../src/domain/templates.js';
import { sendNotification, markRead, markAllRead } from '../src/domain/notification.js';
import { inAppProvider, emailProvider, smsProvider, ALL_PROVIDERS } from '../src/domain/channels.js';

/* ─── Fake repo ───────────────────────────────────────────────── */

function makeRepo(overrides: Partial<NotifRepo> = {}): NotifRepo {
  const notifications = new Map<string, NotificationRecord>();
  const preferences   = new Map<string, RecipientPreference>();
  return {
    findById:          async (id) => notifications.get(id) ?? null,
    listNotifications: async (f: NotifFilter) => {
      const items = [...notifications.values()]
        .filter((n) => !f.recipientId || n.recipientId === f.recipientId)
        .filter((n) => f.read === undefined || n.read === f.read)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, f.limit);
      return { items };
    },
    save:         async (rec) => { notifications.set(rec.id, rec); },
    markRead:     async (id) => {
      const rec = notifications.get(id)!;
      const u = { ...rec, read: true };
      notifications.set(id, u);
      return u;
    },
    markAllRead:  async (rid) => {
      let count = 0;
      for (const [id, rec] of notifications) {
        if (rec.recipientId === rid && !rec.read) { notifications.set(id, { ...rec, read: true }); count++; }
      }
      return count;
    },
    getPreference:  async (rid) => preferences.get(rid) ?? null,
    savePreference: async (pref) => { preferences.set(pref.recipientId, pref); },
    ...overrides,
  };
}

/* ─── Template system ─────────────────────────────────────────── */

test('interpolate: replaces {vars}', () => {
  assert.equal(interpolate('Hello {name}, your leave starts {date}', { name: 'Ahmed', date: '2026-03-15' }), 'Hello Ahmed, your leave starts 2026-03-15');
});

test('interpolate: leaves unknown vars intact', () => {
  assert.equal(interpolate('Hello {name}', {}), 'Hello {name}');
});

test('renderTemplate: English leave_approved', () => {
  const { title, body } = renderTemplate('leave_approved', { leaveType: 'Annual', startDate: '2026-03-15', endDate: '2026-03-22', days: '6' }, 'en');
  assert.ok(title.includes('approved'));
  assert.ok(body.includes('6'));
  assert.ok(body.includes('2026-03-15'));
});

test('renderTemplate: Arabic leave_approved', () => {
  const { title, body } = renderTemplate('leave_approved', { leaveType: 'سنوية', startDate: '2026-03-15', endDate: '2026-03-22', days: '6' }, 'ar');
  assert.ok(title.includes('الموافقة'));
  assert.ok(body.includes('6'));
});

test('renderTemplate: approval_required includes requester and SLA', () => {
  const { body } = renderTemplate('approval_required', { title: 'Leave', requesterName: 'Ahmed', slaDueAt: '17:00' }, 'en');
  assert.ok(body.includes('Ahmed'));
  assert.ok(body.includes('17:00'));
});

test('renderTemplate: unknown type returns type as title', () => {
  const { title } = renderTemplate('nonexistent_type' as never, {}, 'en');
  assert.equal(title, 'nonexistent_type');
});

test('renderTemplate: document_expiring shows date', () => {
  const { body } = renderTemplate('document_expiring', { docType: 'Iqama', expiresOn: '2026-12-31' }, 'ar');
  assert.ok(body.includes('2026-12-31'));
});

/* ─── Channels ────────────────────────────────────────────────── */

test('inAppProvider always sends', async () => {
  const result = await inAppProvider.send({ id: 'n1', title: 'Test', body: 'Body' } as NotificationRecord);
  assert.equal(result.status, 'sent');
  assert.equal(result.channel, 'in_app');
});

test('emailProvider suppresses if no address', async () => {
  const result = await emailProvider.send({ id: 'n2', title: 'Test', body: 'Body' } as NotificationRecord);
  assert.equal(result.status, 'suppressed');
});

test('emailProvider sends when address provided', async () => {
  const result = await emailProvider.send({ id: 'n3', title: 'Test', body: 'Body' } as NotificationRecord, 'user@example.com');
  assert.equal(result.status, 'sent');
});

test('smsProvider suppresses if no number', async () => {
  const result = await smsProvider.send({ id: 'n4', title: 'Test', body: 'Body' } as NotificationRecord);
  assert.equal(result.status, 'suppressed');
});

/* ─── sendNotification ────────────────────────────────────────── */

test('sendNotification: creates in_app delivery with default preference', async () => {
  const repo = makeRepo();
  const rec = await sendNotification(
    { recipientId: 'emp1', entityId: 'ent1', type: 'leave_approved',
      vars: { leaveType: 'Annual', startDate: '2026-03-15', endDate: '2026-03-22', days: '6' } },
    repo, ALL_PROVIDERS,
  );
  assert.equal(rec.recipientId, 'emp1');
  assert.equal(rec.read, false);
  assert.ok(rec.id.startsWith('ntf_'));
  assert.ok(rec.deliveries.some((d) => d.channel === 'in_app' && d.status === 'sent'));
});

test('sendNotification: renders in recipient locale (ar)', async () => {
  const repo = makeRepo();
  await repo.savePreference({ recipientId: 'emp_ar', locale: 'ar', channels: ['in_app'] });
  const rec = await sendNotification(
    { recipientId: 'emp_ar', entityId: 'ent1', type: 'leave_approved',
      vars: { leaveType: 'سنوية', startDate: '2026-03-15', endDate: '2026-03-22', days: '6' } },
    repo, ALL_PROVIDERS,
  );
  assert.ok(rec.title.includes('الموافقة'), `expected Arabic title, got: ${rec.title}`);
});

test('sendNotification: fans out to opted-in channels', async () => {
  const repo = makeRepo();
  await repo.savePreference({ recipientId: 'emp2', locale: 'en', channels: ['in_app', 'email'] });
  const rec = await sendNotification(
    { recipientId: 'emp2', entityId: 'ent1', type: 'letter_issued',
      vars: { letterType: 'Salary Certificate', documentId: 'doc_x' },
      priority: 'normal' },
    repo, ALL_PROVIDERS, { email: 'emp2@example.com' },
  );
  const channels = rec.deliveries.map((d) => d.channel);
  assert.ok(channels.includes('in_app'));
  assert.ok(channels.includes('email'));
});

test('sendNotification: suppresses non-in_app during quiet hours for normal priority', async () => {
  const repo = makeRepo();
  const now = new Date();
  // Set quiet hours to cover current time
  const from = `${String(now.getHours()).padStart(2, '0')}:00`;
  const until = `${String((now.getHours() + 1) % 24).padStart(2, '0')}:00`;
  await repo.savePreference({ recipientId: 'emp3', locale: 'en', channels: ['in_app', 'email', 'sms'], quietFrom: from, quietUntil: until });
  const rec = await sendNotification(
    { recipientId: 'emp3', entityId: 'ent1', type: 'leave_submitted',
      vars: { leaveType: 'Annual', startDate: '2026-06-01', endDate: '2026-06-07' },
      priority: 'normal' },
    repo, ALL_PROVIDERS,
  );
  // Only in_app should be delivered; email and sms suppressed
  assert.ok(rec.deliveries.every((d) => d.channel === 'in_app'));
});

test('sendNotification: urgent priority ignores quiet hours', async () => {
  const repo = makeRepo();
  const now = new Date();
  const from = `${String(now.getHours()).padStart(2, '0')}:00`;
  const until = `${String((now.getHours() + 1) % 24).padStart(2, '0')}:00`;
  await repo.savePreference({ recipientId: 'emp4', locale: 'en', channels: ['in_app', 'sms'], quietFrom: from, quietUntil: until });
  const rec = await sendNotification(
    { recipientId: 'emp4', entityId: 'ent1', type: 'approval_required',
      vars: { title: 'Leave', requesterName: 'X', slaDueAt: '17:00' },
      priority: 'urgent' },
    repo, ALL_PROVIDERS, { sms: '+966501234567' },
  );
  const channels = rec.deliveries.map((d) => d.channel);
  assert.ok(channels.includes('sms'), 'urgent should bypass quiet hours');
});

test('sendNotification: rejects missing recipientId', async () => {
  const repo = makeRepo();
  await assert.rejects(
    () => sendNotification({ recipientId: '', entityId: 'ent1', type: 'leave_approved', vars: {} }, repo, ALL_PROVIDERS),
    (e: NotifError) => e.code === 'VALIDATION',
  );
});

test('sendNotification: stores sourceEventType', async () => {
  const repo = makeRepo();
  const rec = await sendNotification(
    { recipientId: 'emp5', entityId: 'ent1', type: 'approval_required',
      vars: { title: 'Leave', requesterName: 'Y', slaDueAt: '13:00' },
      sourceEventType: 'StepActivated', sourceEventId: 'evt_abc' },
    repo, ALL_PROVIDERS,
  );
  assert.equal(rec.sourceEventType, 'StepActivated');
  assert.equal(rec.sourceEventId, 'evt_abc');
});

/* ─── markRead / markAllRead ──────────────────────────────────── */

test('markRead: marks single notification as read', async () => {
  const repo = makeRepo();
  const sent = await sendNotification(
    { recipientId: 'emp6', entityId: 'ent1', type: 'leave_declined', vars: {} },
    repo, ALL_PROVIDERS,
  );
  const updated = await markRead(sent.id, repo);
  assert.equal(updated.read, true);
});

test('markRead: throws NOT_FOUND for unknown id', async () => {
  const repo = makeRepo();
  await assert.rejects(
    () => markRead('ntf_ghost', repo),
    (e: NotifError) => e.code === 'NOT_FOUND',
  );
});

test('markAllRead: marks all unread for recipient', async () => {
  const repo = makeRepo();
  await Promise.all([
    sendNotification({ recipientId: 'emp7', entityId: 'ent1', type: 'leave_approved', vars: { leaveType: 'A', startDate: 'X', endDate: 'Y', days: '1' } }, repo, ALL_PROVIDERS),
    sendNotification({ recipientId: 'emp7', entityId: 'ent1', type: 'leave_declined', vars: {} }, repo, ALL_PROVIDERS),
    sendNotification({ recipientId: 'emp_other', entityId: 'ent1', type: 'leave_declined', vars: {} }, repo, ALL_PROVIDERS),
  ]);
  const count = await markAllRead('emp7', repo);
  assert.equal(count, 2);
  const { items } = await repo.listNotifications({ recipientId: 'emp7', read: false, limit: 10 });
  assert.equal(items.length, 0);
});
