import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWorkingDays, statusFor, LeaveError } from '../src/domain/working-days.js';
import { createLeaveRequest } from '../src/domain/create-request.js';

const ksaCal = { workWeek: [0, 1, 2, 3, 4], holidays: new Set<string>() };

test('computeWorkingDays excludes Fri/Sat for KSA week', () => {
  // 2026-03-15 is a Sunday. Sun–Thu = 5 working days; Fri/Sat excluded.
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

// --- create-request integration with in-memory fakes ---

function makeRepo(overrides = {}) {
  return {
    findByIdempotencyKey: async () => null,
    getBalance: async () => ({ accruedDays: 18, usedDays: 0, carriedDays: 0 }),
    hasOverlap: async () => false,
    saveWithEvent: async () => {},
    ...overrides,
  };
}
const wf = { start: async () => 'wf_test01' };

test('createLeaveRequest happy path computes days + starts workflow', async () => {
  let savedEvent: any = null;
  const repo = makeRepo({ saveWithEvent: async (_r: any, e: any) => { savedEvent = e; } });
  const rec = await createLeaveRequest(
    { entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
      startDate: '2026-03-15', endDate: '2026-03-22', idempotencyKey: 'k1' },
    ksaCal, repo as any, wf, 'corr1',
  );
  assert.equal(rec.workingDays, 6);
  assert.equal(rec.status, 'pending_approval');
  assert.equal(rec.workflowInstanceId, 'wf_test01');
  assert.equal(savedEvent.eventType, 'LeaveRequestSubmitted');
  assert.equal(savedEvent.correlationId, 'corr1');
});

test('createLeaveRequest is idempotent', async () => {
  const prior = { id: 'lv_existing' };
  const repo = makeRepo({ findByIdempotencyKey: async () => prior });
  const rec = await createLeaveRequest(
    { entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
      startDate: '2026-03-15', endDate: '2026-03-22', idempotencyKey: 'k1' },
    ksaCal, repo as any, wf, 'corr1',
  );
  assert.equal(rec.id, 'lv_existing');
});

test('createLeaveRequest rejects insufficient balance', async () => {
  const repo = makeRepo({ getBalance: async () => ({ accruedDays: 4, usedDays: 0, carriedDays: 0 }) });
  await assert.rejects(
    () => createLeaveRequest(
      { entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
        startDate: '2026-03-15', endDate: '2026-03-22', idempotencyKey: 'k1' },
      ksaCal, repo as any, wf, 'corr1'),
    (e: any) => e.code === 'INSUFFICIENT_BALANCE' && e.details.available === 4,
  );
});

test('createLeaveRequest rejects overlap', async () => {
  const repo = makeRepo({ hasOverlap: async () => true });
  await assert.rejects(
    () => createLeaveRequest(
      { entityId: 'ent1', employeeId: 'emp1', leaveTypeId: 'annual',
        startDate: '2026-03-15', endDate: '2026-03-22', idempotencyKey: 'k1' },
      ksaCal, repo as any, wf, 'corr1'),
    (e: any) => e.code === 'OVERLAPPING_REQUEST',
  );
});
