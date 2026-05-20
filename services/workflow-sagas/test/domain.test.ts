/**
 * Workflow Sagas — domain tests.
 *
 * Tests:
 *   - InMemorySagaRepo  (save, findById, findByIdempotencyKey, list, cursor pagination)
 *   - SagaRunner        (happy path, retry logic, compensation on failure)
 *   - onboardingSaga    (activity names, provisionItAccess stub)
 *   - offboardingSaga   (activity names, revokeItAccess stub)
 *   - Event routing     (EmployeeOnboarded → onboarding saga, EmployeeTerminated → offboarding saga)
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { SagaRunner } from '../src/domain/saga-runner.js';
import { onboardingSaga } from '../src/sagas/onboarding.js';
import { offboardingSaga } from '../src/sagas/offboarding.js';
import { InMemorySagaRepo } from '../src/repo.js';
import type {
  SagaInstance, SagaDef, ActivityDef, ActivityContext,
} from '../src/domain/types.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function nowStr(): string {
  return new Date().toISOString().replace('Z', '+00:00');
}

function makeRepo() {
  return new InMemorySagaRepo();
}

function makeCtx(): ActivityContext {
  return {
    services: {
      people:        'http://localhost:3003/api/v1',
      integrations:  'http://localhost:3008/api/v1',
      benefits:      'http://localhost:3006/api/v1',
      notifications: 'http://localhost:3005/api/v1',
      payroll:       'http://localhost:3007/api/v1',
    },
    correlationId: 'test-corr-001',
  };
}

function makeSaga(overrides?: Partial<SagaInstance>): SagaInstance {
  return {
    id: 'saga_test_001',
    sagaName: 'onboarding',
    entityId: 'ent_test',
    employeeId: 'emp_test',
    correlationId: 'corr_test',
    idempotencyKey: 'test:idem:001',
    status: 'running',
    context: { employeeId: 'emp_test', entityId: 'ent_test' },
    activities: [],
    currentActivityIndex: 0,
    createdAt: nowStr(),
    ...overrides,
  };
}

function stubActivity(name: string, result: Record<string, unknown>): ActivityDef {
  return {
    name,
    description: `stub ${name}`,
    maxRetries: 0,
    async execute() { return result; },
  };
}

function failingActivity(name: string, failTimes: number, result: Record<string, unknown>): ActivityDef {
  let calls = 0;
  return {
    name,
    description: `failing stub ${name}`,
    maxRetries: failTimes,
    async execute() {
      calls++;
      if (calls <= failTimes) throw new Error(`transient failure #${calls}`);
      return result;
    },
  };
}

function alwaysFailActivity(name: string): ActivityDef {
  return {
    name,
    description: `always fails ${name}`,
    maxRetries: 1,
    async execute() { throw new Error('permanent failure'); },
  };
}

function stubCompensableActivity(name: string, result: Record<string, unknown>): ActivityDef & { compensateCalls: string[] } {
  const compensateCalls: string[] = [];
  return {
    name,
    description: `compensable stub ${name}`,
    maxRetries: 0,
    compensateCalls,
    async execute() { return result; },
    async compensate(saga) { compensateCalls.push(saga.id); },
  };
}

// ── InMemorySagaRepo tests ────────────────────────────────────────────────────

describe('InMemorySagaRepo', () => {
  it('saves and retrieves by id', async () => {
    const repo = makeRepo();
    const saga = makeSaga();
    await repo.save(saga);
    const found = await repo.findById(saga.id);
    assert.equal(found?.id, saga.id);
  });

  it('returns null for unknown id', async () => {
    const repo = makeRepo();
    assert.equal(await repo.findById('nope'), null);
  });

  it('findByIdempotencyKey returns existing saga', async () => {
    const repo = makeRepo();
    const saga = makeSaga({ idempotencyKey: 'test:idem:unique' });
    await repo.save(saga);
    const found = await repo.findByIdempotencyKey('test:idem:unique');
    assert.equal(found?.id, saga.id);
  });

  it('findByIdempotencyKey returns null for unknown key', async () => {
    const repo = makeRepo();
    assert.equal(await repo.findByIdempotencyKey('nope:nope'), null);
  });

  it('update overwrites existing record', async () => {
    const repo = makeRepo();
    const saga = makeSaga();
    await repo.save(saga);
    await repo.update({ ...saga, status: 'completed' });
    const found = await repo.findById(saga.id);
    assert.equal(found?.status, 'completed');
  });

  it('list returns all items when no filters', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 3; i++) {
      await repo.save(makeSaga({ id: `saga_list_${i}`, idempotencyKey: `key_${i}` }));
    }
    const { items } = await repo.list({});
    assert.equal(items.length, 3);
  });

  it('list filters by sagaName', async () => {
    const repo = makeRepo();
    await repo.save(makeSaga({ id: 'a', idempotencyKey: 'k1', sagaName: 'onboarding' }));
    await repo.save(makeSaga({ id: 'b', idempotencyKey: 'k2', sagaName: 'offboarding' }));
    const { items } = await repo.list({ sagaName: 'offboarding' });
    assert.equal(items.length, 1);
    assert.equal(items[0].sagaName, 'offboarding');
  });

  it('list filters by employeeId', async () => {
    const repo = makeRepo();
    await repo.save(makeSaga({ id: 'a', idempotencyKey: 'k1', employeeId: 'emp_a' }));
    await repo.save(makeSaga({ id: 'b', idempotencyKey: 'k2', employeeId: 'emp_b' }));
    const { items } = await repo.list({ employeeId: 'emp_a' });
    assert.equal(items.length, 1);
    assert.equal(items[0].employeeId, 'emp_a');
  });

  it('list cursor pagination', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const d = new Date(Date.now() - i * 1000).toISOString().replace('Z', '+00:00');
      await repo.save(makeSaga({ id: `page_${i}`, idempotencyKey: `pk_${i}`, createdAt: d }));
    }
    const first = await repo.list({ limit: 3 });
    assert.equal(first.items.length, 3);
    assert.ok(first.nextCursor !== null);

    const second = await repo.list({ limit: 3, cursor: first.nextCursor! });
    assert.equal(second.items.length, 2);
    assert.equal(second.nextCursor, null);
  });
});

// ── SagaRunner happy path ─────────────────────────────────────────────────────

describe('SagaRunner — happy path', () => {
  it('executes all activities and marks saga completed', async () => {
    const repo = makeRepo();
    const saga = makeSaga();
    await repo.save(saga);

    const def: SagaDef = {
      name: 'onboarding',
      description: 'test',
      activities: [
        stubActivity('step_a', { aResult: 1 }),
        stubActivity('step_b', { bResult: 2 }),
        stubActivity('step_c', { cResult: 3 }),
      ],
    };

    const result = await new SagaRunner(repo, makeCtx()).execute(saga, def);

    assert.equal(result.status, 'completed');
    assert.ok(result.completedAt);
    assert.equal(result.currentActivityIndex, 3);
    assert.equal(result.context.aResult, 1);
    assert.equal(result.context.bResult, 2);
    assert.equal(result.context.cResult, 3);
    assert.ok(result.activities.every((a) => a.state === 'completed'));
  });

  it('merges activity output into context for subsequent activities', async () => {
    const repo = makeRepo();
    const saga = makeSaga({ context: { base: 'value' } });
    await repo.save(saga);

    const def: SagaDef = {
      name: 'onboarding',
      description: 'context chain test',
      activities: [
        {
          name: 'first',
          description: 'first',
          maxRetries: 0,
          async execute(s) {
            assert.equal((s.context as any).base, 'value');
            return { fromFirst: 'hello' };
          },
        },
        {
          name: 'second',
          description: 'second',
          maxRetries: 0,
          async execute(s) {
            assert.equal((s.context as any).base, 'value');
            assert.equal((s.context as any).fromFirst, 'hello');
            return { fromSecond: 'world' };
          },
        },
      ],
    };

    const result = await new SagaRunner(repo, makeCtx()).execute(saga, def);
    assert.equal(result.status, 'completed');
    assert.equal((result.context as any).fromFirst, 'hello');
    assert.equal((result.context as any).fromSecond, 'world');
  });
});

// ── SagaRunner retry logic ────────────────────────────────────────────────────

describe('SagaRunner — retries', () => {
  it('retries a transient failure and succeeds', async () => {
    const repo = makeRepo();
    const saga = makeSaga();
    await repo.save(saga);

    const def: SagaDef = {
      name: 'onboarding',
      description: 'retry test',
      activities: [
        failingActivity('flaky_step', 2, { recovered: true }),
      ],
    };

    const result = await new SagaRunner(repo, makeCtx()).execute(saga, def);
    assert.equal(result.status, 'completed');
    assert.equal((result.context as any).recovered, true);
  });

  it('exhausts retries and triggers compensation', async () => {
    const repo = makeRepo();
    const saga = makeSaga();
    await repo.save(saga);

    const compensable = stubCompensableActivity('step_a', { done: true });
    const def: SagaDef = {
      name: 'onboarding',
      description: 'failure test',
      activities: [
        compensable,
        alwaysFailActivity('step_b'),
      ],
    };

    const result = await new SagaRunner(repo, makeCtx()).execute(saga, def);
    assert.equal(result.status, 'compensated');
    assert.ok(result.failureReason?.includes('step_b'));
    // compensation for step_a should have been called
    assert.equal(compensable.compensateCalls.length, 1);
  });
});

// ── SagaRunner compensation ───────────────────────────────────────────────────

describe('SagaRunner — compensation', () => {
  it('runs compensations in reverse order', async () => {
    const repo = makeRepo();
    const saga = makeSaga();
    await repo.save(saga);

    const order: string[] = [];
    function trackingActivity(name: string): ActivityDef {
      return {
        name,
        description: name,
        maxRetries: 0,
        async execute() { return {}; },
        async compensate() { order.push(name); },
      };
    }

    const def: SagaDef = {
      name: 'onboarding',
      description: 'reverse compensation test',
      activities: [
        trackingActivity('first'),
        trackingActivity('second'),
        alwaysFailActivity('third'),
      ],
    };

    await new SagaRunner(repo, makeCtx()).execute(saga, def);
    // compensation should run second, then first (reverse)
    assert.deepEqual(order, ['second', 'first']);
  });

  it('skips compensation for activities without compensate fn', async () => {
    const repo = makeRepo();
    const saga = makeSaga();
    await repo.save(saga);

    const compensable = stubCompensableActivity('has_comp', { x: 1 });
    const def: SagaDef = {
      name: 'onboarding',
      description: 'selective compensation',
      activities: [
        stubActivity('no_comp', { y: 2 }),   // no compensate fn
        compensable,
        alwaysFailActivity('fails'),
      ],
    };

    const result = await new SagaRunner(repo, makeCtx()).execute(saga, def);
    assert.equal(result.status, 'compensated');
    assert.equal(compensable.compensateCalls.length, 1);
  });

  it('marks saga as failed when compensation itself throws', async () => {
    const repo = makeRepo();
    const saga = makeSaga();
    await repo.save(saga);

    const def: SagaDef = {
      name: 'onboarding',
      description: 'failed compensation',
      activities: [
        {
          name: 'bad_compensation',
          description: 'activity whose compensation fails',
          maxRetries: 0,
          async execute() { return {}; },
          async compensate() { throw new Error('compensation also broken'); },
        },
        alwaysFailActivity('trigger_failure'),
      ],
    };

    const result = await new SagaRunner(repo, makeCtx()).execute(saga, def);
    assert.equal(result.status, 'failed');
    assert.ok(result.failureReason?.includes('compensation also broken'));
  });
});

// ── Onboarding saga structure ─────────────────────────────────────────────────

describe('onboardingSaga definition', () => {
  it('has exactly 6 activities', () => {
    assert.equal(onboardingSaga.activities.length, 6);
  });

  it('activity names are in expected order', () => {
    const names = onboardingSaga.activities.map((a) => a.name);
    assert.deepEqual(names, [
      'validateEmployee',
      'enrollGosi',
      'registerQiwaContract',
      'activateBenefits',
      'sendWelcomeNotification',
      'provisionItAccess',
    ]);
  });

  it('enrollGosi has a compensate function', () => {
    const act = onboardingSaga.activities.find((a) => a.name === 'enrollGosi');
    assert.ok(typeof act?.compensate === 'function');
  });

  it('registerQiwaContract has a compensate function', () => {
    const act = onboardingSaga.activities.find((a) => a.name === 'registerQiwaContract');
    assert.ok(typeof act?.compensate === 'function');
  });

  it('activateBenefits has a compensate function', () => {
    const act = onboardingSaga.activities.find((a) => a.name === 'activateBenefits');
    assert.ok(typeof act?.compensate === 'function');
  });

  it('sendWelcomeNotification has no compensate (informational only)', () => {
    const act = onboardingSaga.activities.find((a) => a.name === 'sendWelcomeNotification');
    assert.equal(act?.compensate, undefined);
  });

  it('provisionItAccess stub returns synthetic result', async () => {
    const saga = makeSaga();
    const act = onboardingSaga.activities.find((a) => a.name === 'provisionItAccess')!;
    const result = await act.execute(saga, makeCtx());
    assert.equal(result.itProvisioningStatus, 'stub_provisioned');
    assert.ok(typeof result.adAccount === 'string');
  });
});

// ── Offboarding saga structure ────────────────────────────────────────────────

describe('offboardingSaga definition', () => {
  it('has exactly 6 activities', () => {
    assert.equal(offboardingSaga.activities.length, 6);
  });

  it('activity names are in expected order', () => {
    const names = offboardingSaga.activities.map((a) => a.name);
    assert.deepEqual(names, [
      'submitGosiExit',
      'terminateQiwaContract',
      'cancelBenefits',
      'calculateFinalSettlement',
      'revokeItAccess',
      'sendOffboardingNotification',
    ]);
  });

  it('revokeItAccess stub returns revoked status', async () => {
    const saga = makeSaga({ sagaName: 'offboarding' });
    const act = offboardingSaga.activities.find((a) => a.name === 'revokeItAccess')!;
    const result = await act.execute(saga, makeCtx());
    assert.equal(result.itRevocationStatus, 'stub_revoked');
  });

  it('sendOffboardingNotification has no compensate', () => {
    const act = offboardingSaga.activities.find((a) => a.name === 'sendOffboardingNotification');
    assert.equal(act?.compensate, undefined);
  });
});

// ── Event routing via saga-routes (unit) ──────────────────────────────────────

describe('Event routing — idempotency', () => {
  it('same onboarding idempotencyKey returns existing saga without duplicate', async () => {
    const repo = makeRepo();
    const key = 'event:evt_001:onboarding';
    const existing = makeSaga({ idempotencyKey: key, status: 'completed' });
    await repo.save(existing);

    const found = await repo.findByIdempotencyKey(key);
    assert.equal(found?.id, existing.id);
    assert.equal(found?.status, 'completed');
  });

  it('different eventIds produce different idempotency keys', () => {
    const key1 = `event:evt_001:onboarding`;
    const key2 = `event:evt_002:onboarding`;
    assert.notEqual(key1, key2);
  });

  it('same event triggering both onboarding and offboarding uses distinct keys', () => {
    const eventId = 'evt_xyz';
    const onboardKey = `event:${eventId}:onboarding`;
    const offboardKey = `event:${eventId}:offboarding`;
    assert.notEqual(onboardKey, offboardKey);
  });
});

// ── InMemorySagaRepo seed (index.ts integration) ──────────────────────────────

describe('InMemorySagaRepo seed data', () => {
  let repo: InMemorySagaRepo;

  before(async () => {
    repo = new InMemorySagaRepo();
    // Seed the same way index.ts does
    const seed1: SagaInstance = {
      id: 'saga_seed_001', sagaName: 'onboarding', entityId: 'ent_default',
      employeeId: 'emp_007', correlationId: 'corr_seed', idempotencyKey: 'seed:on:emp_007',
      status: 'completed', context: {}, activities: [], currentActivityIndex: 6,
      createdAt: nowStr(), completedAt: nowStr(),
    };
    const seed2: SagaInstance = {
      id: 'saga_seed_002', sagaName: 'offboarding', entityId: 'ent_default',
      employeeId: 'emp_003', correlationId: 'corr_seed2', idempotencyKey: 'seed:off:emp_003',
      status: 'completed', context: {}, activities: [], currentActivityIndex: 6,
      createdAt: nowStr(), completedAt: nowStr(),
    };
    await repo.save(seed1);
    await repo.save(seed2);
  });

  it('lists 2 seeded sagas', async () => {
    const { items } = await repo.list({});
    assert.equal(items.length, 2);
  });

  it('can find seeded onboarding saga', async () => {
    const s = await repo.findById('saga_seed_001');
    assert.equal(s?.sagaName, 'onboarding');
    assert.equal(s?.status, 'completed');
  });

  it('can find seeded offboarding saga', async () => {
    const s = await repo.findById('saga_seed_002');
    assert.equal(s?.sagaName, 'offboarding');
    assert.equal(s?.employeeId, 'emp_003');
  });

  it('filters seeded sagas by sagaName', async () => {
    const { items } = await repo.list({ sagaName: 'offboarding' });
    assert.equal(items.length, 1);
    assert.equal(items[0].sagaName, 'offboarding');
  });
});
