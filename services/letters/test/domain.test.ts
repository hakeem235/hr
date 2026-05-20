import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLetterRequest, cancelLetterRequest, markLetterIssued,
  type LetterRepo, type LetterRecord, type DomainEvent, type ListFilter,
} from '../src/domain/letter.js';
import { LetterError } from '../src/domain/errors.js';
import { getLetterTypes, getLetterPolicy, getLetterType } from '../src/domain/letter-types.js';

/* ─── Fake repo factory ───────────────────────────────────────── */

function makeRepo(overrides: Partial<LetterRepo> = {}): LetterRepo {
  const store = new Map<string, LetterRecord>();
  return {
    findByIdempotencyKey: async (employeeId, key) =>
      [...store.values()].find((r) => r.employeeId === employeeId && r.idempotencyKey === key) ?? null,
    findById: async (id) => store.get(id) ?? null,
    saveWithEvent: async (rec) => { store.set(rec.id, rec); },
    updateStatus: async (id, status, expectedVersion, _event, extra) => {
      const rec = store.get(id);
      if (!rec) throw new LetterError('NOT_FOUND', `${id} not found`);
      if (rec.version !== expectedVersion) throw new LetterError('CONFLICT', 'version mismatch');
      const updated = { ...rec, status, version: rec.version + 1, updatedAt: new Date().toISOString(), ...extra };
      store.set(id, updated);
      return updated;
    },
    listRequests: async (_f: ListFilter) => ({ items: [], nextCursor: undefined }),
    ...overrides,
  };
}

const wf = { start: async () => 'wf_test01' };

/* ─── Letter types ────────────────────────────────────────────── */

test('getLetterTypes returns KSA types for default entity', () => {
  const types = getLetterTypes('ent_default');
  assert.ok(types.length >= 7);
  const ids = types.map((t) => t.id);
  assert.ok(ids.includes('salary_certificate'));
  assert.ok(ids.includes('noc'));
  assert.ok(ids.includes('bank_letter'));
  assert.ok(ids.includes('experience_letter'));
});

test('getLetterType returns correct type', () => {
  const t = getLetterType('noc');
  assert.ok(t);
  assert.equal(t!.requiresManagerApproval, true);
  assert.equal(t!.defaultLanguage, 'bilingual');
});

test('getLetterPolicy returns limits', () => {
  const p = getLetterPolicy('noc');
  assert.ok(p);
  assert.equal(p!.maxPerYear, 2);
  assert.equal(p!.generationSlaHours, 4);
});

test('getLetterPolicy returns undefined for unknown type', () => {
  assert.equal(getLetterPolicy('nonexistent'), undefined);
});

test('experience_letter does not require active employment', () => {
  const t = getLetterType('experience_letter');
  assert.equal(t!.requiresActiveEmployment, false);
});

test('salary_certificate allows bilingual', () => {
  const p = getLetterPolicy('salary_certificate');
  assert.ok(p!.availableLanguages.includes('bilingual'));
});

/* ─── createLetterRequest ─────────────────────────────────────── */

test('createLetterRequest happy path starts workflow + saves record', async () => {
  let savedEvent: DomainEvent | null = null;
  const repo = makeRepo({
    saveWithEvent: async (r, e) => { (repo as unknown as Record<string, unknown>)._last = r; savedEvent = e; },
  });

  const rec = await createLetterRequest(
    { entityId: 'ent1', employeeId: 'emp1', letterTypeId: 'salary_certificate',
      purpose: 'Bank account opening', language: 'bilingual', idempotencyKey: 'k1' },
    repo, wf, 'corr1',
  );
  assert.equal(rec.status, 'pending_approval');
  assert.equal(rec.workflowInstanceId, 'wf_test01');
  assert.equal(rec.version, 1);
  assert.ok(rec.id.startsWith('ltr_'));

  assert.ok(savedEvent);
  const ev = savedEvent as unknown as DomainEvent;
  assert.equal(ev.eventType, 'LetterRequested');
  assert.equal(ev.correlationId, 'corr1');
  assert.ok(ev.eventId);
  assert.ok(ev.occurredAt);
});

test('createLetterRequest is idempotent', async () => {
  const prior = { id: 'ltr_existing', version: 1 } as LetterRecord;
  const repo = makeRepo({ findByIdempotencyKey: async () => prior });
  const rec = await createLetterRequest(
    { entityId: 'ent1', employeeId: 'emp1', letterTypeId: 'salary_certificate',
      purpose: 'Bank account opening', language: 'bilingual', idempotencyKey: 'k1' },
    repo, wf, 'corr1',
  );
  assert.equal(rec.id, 'ltr_existing');
});

test('createLetterRequest rejects empty purpose', async () => {
  const repo = makeRepo();
  await assert.rejects(
    () => createLetterRequest(
      { entityId: 'ent1', employeeId: 'emp1', letterTypeId: 'noc',
        purpose: '   ', language: 'en', idempotencyKey: 'k2' },
      repo, wf, 'corr',
    ),
    (e: LetterError) => e.code === 'POLICY_VIOLATION' && e.field === 'purpose',
  );
});

test('createLetterRequest wraps workflow failure as WORKFLOW_UNAVAILABLE', async () => {
  const repo = makeRepo();
  const failWf = { start: async () => { throw new Error('connection refused'); } };
  await assert.rejects(
    () => createLetterRequest(
      { entityId: 'ent1', employeeId: 'emp1', letterTypeId: 'noc',
        purpose: 'visa', language: 'en', idempotencyKey: 'k3' },
      repo, failWf, 'corr',
    ),
    (e: LetterError) => e.code === 'WORKFLOW_UNAVAILABLE',
  );
});

/* ─── cancelLetterRequest ─────────────────────────────────────── */

function seedRecord(overrides: Partial<LetterRecord> = {}): LetterRecord {
  return {
    id: 'ltr_001', entityId: 'ent1', employeeId: 'emp1',
    letterTypeId: 'salary_certificate', purpose: 'bank', language: 'bilingual',
    status: 'pending_approval', workflowInstanceId: 'wf_1',
    idempotencyKey: 'k1', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), version: 1,
    ...overrides,
  };
}

async function repoWithRecord(rec: LetterRecord): Promise<LetterRepo> {
  const repo = makeRepo();
  await repo.saveWithEvent(rec, {} as DomainEvent);
  return repo;
}

test('cancelLetterRequest cancels pending_approval request', async () => {
  const repo = await repoWithRecord(seedRecord());
  const result = await cancelLetterRequest('ltr_001', 'emp1', 1, repo, 'corr');
  assert.equal(result.status, 'cancelled');
});

test('cancelLetterRequest cancels approved request', async () => {
  const repo = await repoWithRecord(seedRecord({ status: 'approved', version: 2 }));
  const result = await cancelLetterRequest('ltr_001', 'emp1', 2, repo, 'corr');
  assert.equal(result.status, 'cancelled');
});

test('cancelLetterRequest rejects wrong requester', async () => {
  const repo = await repoWithRecord(seedRecord());
  await assert.rejects(
    () => cancelLetterRequest('ltr_001', 'emp_other', 1, repo, 'corr'),
    (e: LetterError) => e.code === 'FORBIDDEN',
  );
});

test('cancelLetterRequest rejects issued status', async () => {
  const repo = await repoWithRecord(seedRecord({ status: 'issued', version: 3 }));
  await assert.rejects(
    () => cancelLetterRequest('ltr_001', 'emp1', 3, repo, 'corr'),
    (e: LetterError) => e.code === 'INVALID_STATE',
  );
});

test('cancelLetterRequest rejects declined status', async () => {
  const repo = await repoWithRecord(seedRecord({ status: 'declined' }));
  await assert.rejects(
    () => cancelLetterRequest('ltr_001', 'emp1', 1, repo, 'corr'),
    (e: LetterError) => e.code === 'INVALID_STATE',
  );
});

test('cancelLetterRequest rejects stale ETag', async () => {
  const repo = await repoWithRecord(seedRecord({ version: 3 }));
  await assert.rejects(
    () => cancelLetterRequest('ltr_001', 'emp1', 1, repo, 'corr'),
    (e: LetterError) => e.code === 'CONFLICT',
  );
});

test('cancelLetterRequest rejects non-existent request', async () => {
  const repo = makeRepo();
  await assert.rejects(
    () => cancelLetterRequest('ltr_ghost', 'emp1', 1, repo, 'corr'),
    (e: LetterError) => e.code === 'NOT_FOUND',
  );
});

/* ─── markLetterIssued ────────────────────────────────────────── */

test('markLetterIssued transitions approved → issued with documentId', async () => {
  const repo = await repoWithRecord(seedRecord({ status: 'approved', version: 2 }));
  const result = await markLetterIssued('ltr_001', 'doc_abc123', 2, repo, 'corr');
  assert.equal(result.status, 'issued');
  assert.equal(result.documentId, 'doc_abc123');
});

test('markLetterIssued rejects wrong initial status', async () => {
  const repo = await repoWithRecord(seedRecord({ status: 'pending_approval' }));
  await assert.rejects(
    () => markLetterIssued('ltr_001', 'doc_x', 1, repo, 'corr'),
    (e: LetterError) => e.code === 'INVALID_STATE',
  );
});
