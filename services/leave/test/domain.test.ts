import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWorkingDays, statusFor, LeaveError } from '../src/domain/working-days.js';
import { createLeaveRequest, newId } from '../src/domain/create-request.js';
import { cancelLeaveRequest } from '../src/domain/cancel-request.js';
import { getLeaveTypes, getLeavePolicy } from '../src/domain/leave-types.js';
import type { LeaveRepo, LeaveRecord, DomainEvent, LeaveStatus, ListFilter } from '../src/domain/create-request.js';

const ksaCal = { workWeek: [0, 1, 2, 3, 4], holidays: new Set<string>() };

/* ─── Working day calculation ───────────────────────────────── */

test('computeWorkingDays excludes Fri/Sat for KSA week', () => {
  assert.equal(computeWorkingDays('2026-03-15', '2026-03-22', ksaCal), 6);
});

test('computeWorkingDays excludes holidays', () => {
  const cal = { workWeek: [0, 1, 2, 3, 4], holidays: new Set(['2026-03-18']) };
  assert.equal(computeWorkingDays('2026-03-15', '2026-03-22', cal), 5);
});

test('computeWorkingDays single day', () => {
  assert.equal(computeWorkingDays('2026-03-15', '2026-03-15', ksaCal), 1);
});

test('computeWorkingDays rejects reversed range', () => {
  assert.throws(() => computeWorkingDays('2026-03-22', '2026-03-15', ksaCal), LeaveError);
});

test('statusFor maps codes to HTTP', () => {
  assert.equal(statusFor('INSUFFICIENT_BALANCE'), 409);
  assert.equal(statusFor('POLICY_VIOLATION'), 422);
  assert.equal(statusFor('WORKFLOW_UNAVAILABLE'), 503);
  assert.equal(statusFor('UNKNOWN'), 400);
});

/* ─── In-memory fake repo ───────────────────────────────────── */

function makeRepo(overrides: Partial<LeaveRepo> = {}): LeaveRepo {
  const store = new Map<string, LeaveRecord>();
  return {
    findByIdempotencyKey: async () => null,
    findById: async (id) => store.get(id) ?? null,
    getBalance: async () => ({ accruedDays: 18, usedDays: 0, carriedDays: 0 }),
    hasOverlap: async () => false,
    saveWithEvent: async (rec) => { store.set(rec.id, rec); },
    updateStatus: async (id, status, expectedVersion, _event) => {
      const rec = store.get(id);
      if (!rec) throw new LeaveError('NOT_FOUND', `${id} not found`);
      if (rec.version !== expectedVersion) throw new LeaveError('CONFLICT', 'version mismatch');
      const updated = { ...rec, status, version: rec.version + 1, updatedAt: new Date().toISOString() };
      store.set(id, updated);
      return updated;
    },
    listRequests: async (_f: ListFilter) => ({ items: [], nextCursor: undefined }),
    ...overrides,
  };
}

const wf = { start: async () => 'wf_test01' };

/* ─── createLeaveRequest ────────────────────────────────────── */

test('createLeaveRequest happy path computes days + starts workflow', async () => {
  let savedEvent: DomainEvent | null = null;
  const repo = makeRepo({
    saveWithEvent: async (r, e) => { (repo as any)._store = r; savedEvent = e; },
  });
  const rec = await createLeaveRequest(
    { entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
      startDate: '2026-03-15', endDate: '2026-03-22', idempotencyKey: 'k1' },
    ksaCal, repo, wf, 'corr1',
  );
  assert.equal(rec.workingDays, 6);
  assert.equal(rec.status, 'pending_approval');
  assert.equal(rec.workflowInstanceId, 'wf_test01');
  assert.equal(rec.version, 1);
  assert.ok(savedEvent);
  const ev = savedEvent as DomainEvent;
  assert.equal(ev.eventType, 'LeaveRequestSubmitted');
  assert.equal(ev.correlationId, 'corr1');
  assert.ok(ev.eventId);
  assert.ok(ev.occurredAt);
});

test('createLeaveRequest is idempotent', async () => {
  const prior = { id: 'lv_existing', version: 1 } as LeaveRecord;
  const repo = makeRepo({ findByIdempotencyKey: async () => prior });
  const rec = await createLeaveRequest(
    { entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
      startDate: '2026-03-15', endDate: '2026-03-22', idempotencyKey: 'k1' },
    ksaCal, repo, wf, 'corr1',
  );
  assert.equal(rec.id, 'lv_existing');
});

test('createLeaveRequest rejects insufficient balance', async () => {
  const repo = makeRepo({ getBalance: async () => ({ accruedDays: 4, usedDays: 0, carriedDays: 0 }) });
  await assert.rejects(
    () => createLeaveRequest(
      { entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
        startDate: '2026-03-15', endDate: '2026-03-22', idempotencyKey: 'k1' },
      ksaCal, repo, wf, 'corr1'),
    (e: LeaveError) => e.code === 'INSUFFICIENT_BALANCE' && e.details?.available === 4,
  );
});

test('createLeaveRequest rejects overlap', async () => {
  const repo = makeRepo({ hasOverlap: async () => true });
  await assert.rejects(
    () => createLeaveRequest(
      { entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
        startDate: '2026-03-15', endDate: '2026-03-22', idempotencyKey: 'k1' },
      ksaCal, repo, wf, 'corr1'),
    (e: LeaveError) => e.code === 'OVERLAPPING_REQUEST',
  );
});

test('createLeaveRequest rejects zero working days', async () => {
  /* 2026-03-20 = Fri, 2026-03-21 = Sat — no working days */
  await assert.rejects(
    () => createLeaveRequest(
      { entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
        startDate: '2026-03-20', endDate: '2026-03-21', idempotencyKey: 'k2' },
      ksaCal, makeRepo(), wf, 'corr1'),
    (e: LeaveError) => e.code === 'INVALID_DATE_RANGE',
  );
});

/* ─── cancelLeaveRequest ────────────────────────────────────── */

async function seedRequest(status: LeaveStatus = 'pending_approval'): Promise<{ repo: LeaveRepo; id: string }> {
  const store = new Map<string, LeaveRecord>();
  const id = newId('lv');
  const now = new Date().toISOString();
  store.set(id, {
    id, entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
    startDate: '2026-06-01', endDate: '2026-06-05', workingDays: 5,
    status, version: 1, idempotencyKey: 'k-cancel', createdAt: now, updatedAt: now,
  });
  const repo = makeRepo({
    findById: async (i) => store.get(i) ?? null,
    updateStatus: async (i, s, v, _e) => {
      const r = store.get(i)!;
      if (r.version !== v) throw new LeaveError('CONFLICT', 'version mismatch');
      const u = { ...r, status: s, version: r.version + 1, updatedAt: new Date().toISOString() };
      store.set(i, u);
      return u;
    },
  });
  return { repo, id };
}

test('cancelLeaveRequest cancels a pending_approval request', async () => {
  const { repo, id } = await seedRequest('pending_approval');
  const rec = await cancelLeaveRequest(id, 'emp1', 1, 'corr1', repo);
  assert.equal(rec.status, 'cancelled');
  assert.equal(rec.version, 2);
});

test('cancelLeaveRequest cancels an approved request', async () => {
  const { repo, id } = await seedRequest('approved');
  const rec = await cancelLeaveRequest(id, 'emp1', 1, 'corr1', repo);
  assert.equal(rec.status, 'cancelled');
});

test('cancelLeaveRequest rejects wrong requester', async () => {
  const { repo, id } = await seedRequest();
  await assert.rejects(
    () => cancelLeaveRequest(id, 'emp_other', 1, 'corr1', repo),
    (e: LeaveError) => e.code === 'FORBIDDEN',
  );
});

test('cancelLeaveRequest rejects already-taken request', async () => {
  const { repo, id } = await seedRequest('taken');
  await assert.rejects(
    () => cancelLeaveRequest(id, 'emp1', 1, 'corr1', repo),
    (e: LeaveError) => e.code === 'INVALID_STATE_TRANSITION',
  );
});

test('cancelLeaveRequest rejects already-declined request', async () => {
  const { repo, id } = await seedRequest('declined');
  await assert.rejects(
    () => cancelLeaveRequest(id, 'emp1', 1, 'corr1', repo),
    (e: LeaveError) => e.code === 'INVALID_STATE_TRANSITION',
  );
});

test('cancelLeaveRequest rejects stale version (ETag conflict)', async () => {
  const { repo, id } = await seedRequest();
  await assert.rejects(
    () => cancelLeaveRequest(id, 'emp1', 99, 'corr1', repo),
    (e: LeaveError) => e.code === 'CONFLICT',
  );
});

test('cancelLeaveRequest rejects non-existent request', async () => {
  const repo = makeRepo();
  await assert.rejects(
    () => cancelLeaveRequest('lv_ghost', 'emp1', 1, 'corr1', repo),
    (e: LeaveError) => e.code === 'NOT_FOUND',
  );
});

/* ─── Leave types & policies ────────────────────────────────── */

test('getLeaveTypes returns KSA types for default entity', () => {
  const types = getLeaveTypes('ent_default');
  const ids = types.map((t) => t.id);
  assert.ok(ids.includes('annual'));
  assert.ok(ids.includes('sick'));
  assert.ok(ids.includes('hajj'));
  assert.ok(ids.includes('maternity'));
});

test('annual leave entitlement is 21 days (KSA Labour Law)', () => {
  const annual = getLeaveTypes('ent_default').find((t) => t.id === 'annual')!;
  assert.equal(annual.annualEntitlementDays, 21);
  assert.equal(annual.paid, true);
});

test('sick leave requires attachment', () => {
  const sick = getLeaveTypes('ent_default').find((t) => t.id === 'sick')!;
  assert.equal(sick.requiresAttachment, true);
});

test('getLeavePolicy returns accrual method for annual leave', () => {
  const policy = getLeavePolicy('annual', 'ent_default')!;
  assert.equal(policy.accrualMethod, 'monthly');
  assert.equal(policy.accrualRatePerMonth, 1.75);
});

test('getLeavePolicy returns undefined for unknown type', () => {
  assert.equal(getLeavePolicy('unknown_type', 'ent_default'), undefined);
});
