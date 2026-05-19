import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowExecutor, type EngineRepo } from '../src/domain/executor.js';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  StepExecution,
  DomainEvent,
} from '../src/domain/types.js';
import { EngineError } from '../src/domain/types.js';
import type { ActorStore, OrgNode, Delegation } from '../src/domain/actor-resolver.js';
import { KSA_CALENDAR } from '../src/domain/sla.js';

/* ─── Minimal in-memory repo for tests ─────────────────────── */

function makeRepo(): EngineRepo & { events: DomainEvent[] } {
  const definitions = new Map<string, Map<number, WorkflowDefinition>>();
  const instances   = new Map<string, WorkflowInstance>();
  const steps       = new Map<string, StepExecution[]>();
  const events: DomainEvent[] = [];

  const repo: EngineRepo & { events: DomainEvent[] } = {
    events,
    async getDefinition(id, version) {
      const vers = definitions.get(id);
      if (!vers) return null;
      if (version !== undefined) return vers.get(version) ?? null;
      const latest = Math.max(...vers.keys());
      return vers.get(latest) ?? null;
    },
    async getLatestDefinition(id) { return repo.getDefinition(id); },
    async saveDefinition(def) {
      if (!definitions.has(def.workflowId)) definitions.set(def.workflowId, new Map());
      definitions.get(def.workflowId)!.set(def.version, def);
    },
    async getInstance(id) { return instances.get(id) ?? null; },
    async saveInstance(i) { instances.set(i.id, i); },
    async getStepExecutions(instanceId) { return steps.get(instanceId) ?? []; },
    async saveStepExecution(s) {
      const list = steps.get(s.instanceId) ?? [];
      list.push(s);
      steps.set(s.instanceId, list);
    },
    async updateStepExecution(s) {
      const list = steps.get(s.instanceId) ?? [];
      const idx = list.findIndex((x) => x.id === s.id);
      if (idx >= 0) list[idx] = s; else list.push(s);
      steps.set(s.instanceId, list);
    },
    async commitTransition(instance, step, event) {
      instances.set(instance.id, instance);
      const list = steps.get(step.instanceId) ?? [];
      const idx = list.findIndex((x) => x.id === step.id);
      if (idx >= 0) list[idx] = step; else list.push(step);
      steps.set(step.instanceId, list);
      events.push(event);
    },
    async listPendingApprovals() { return []; },
  };
  return repo;
}

/* ─── Minimal actor store ───────────────────────────────────── */

function makeActorStore(overrides: Partial<ActorStore> = {}): ActorStore {
  const org: OrgNode[] = [
    { employeeId: 'emp1', managerId: 'mgr1', role: 'employee', entityId: 'ent1', isActive: true },
    { employeeId: 'mgr1', managerId: undefined, role: 'manager', entityId: 'ent1', isActive: true },
    { employeeId: 'hr1',  managerId: undefined, role: 'hr_ops',  entityId: 'ent1', isActive: true },
  ];
  return {
    findEmployee: async (id) => org.find((e) => e.employeeId === id) ?? null,
    findManager:  async (id) => {
      const emp = org.find((e) => e.employeeId === id);
      if (!emp?.managerId) return null;
      return org.find((e) => e.employeeId === emp.managerId) ?? null;
    },
    findByRole: async (role, entityId) => org.filter((e) => e.role === role && e.entityId === entityId),
    getActiveDelegation: async () => null,
    ...overrides,
  };
}

/* ─── Simple 2-step leave-approval definition ───────────────── */

const SIMPLE_DEF: WorkflowDefinition = {
  workflowId: 'leave-approval',
  version: 1,
  trigger: 'LeaveRequestSubmitted',
  steps: [
    {
      id: 'manager-review',
      type: 'approval',
      actor: { strategy: 'reports_to', of: '$.requester' },
      transitions: [
        { on: 'approved', to: 'end_approved' },
        { on: 'declined', to: 'end_declined' },
      ],
    },
    { id: 'end_approved', type: 'terminal', result: 'approved', transitions: [] },
    { id: 'end_declined', type: 'terminal', result: 'declined', transitions: [] },
  ],
};

function makeExecutor(repo: EngineRepo, actorStore: ActorStore): WorkflowExecutor {
  return new WorkflowExecutor(repo, actorStore, async () => KSA_CALENDAR);
}

/* ─── startInstance ─────────────────────────────────────────── */

test('startInstance: creates instance and activates first approval step', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);
  const executor = makeExecutor(repo, makeActorStore());

  const instance = await executor.startInstance('leave-approval', {
    requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 },
  });

  assert.equal(instance.status, 'active');
  assert.equal(instance.workflowId, 'leave-approval');
  assert.equal(instance.definitionVersion, 1);
  assert.deepEqual(instance.currentStepIds, ['manager-review']);

  const steps = await repo.getStepExecutions(instance.id);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].stepId, 'manager-review');
  assert.equal(steps[0].state, 'active');
  assert.equal(steps[0].actorId, 'mgr1');
});

test('startInstance: emits StepActivated event', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);
  const executor = makeExecutor(repo, makeActorStore());

  await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });
  assert.ok(repo.events.some((e) => e.eventType === 'StepActivated'));
});

test('startInstance: throws if definition not found', async () => {
  const repo = makeRepo();
  const executor = makeExecutor(repo, makeActorStore());
  await assert.rejects(
    () => executor.startInstance('nonexistent', {}),
    (e: EngineError) => e.code === 'DEFINITION_NOT_FOUND',
  );
});

test('startInstance: version pinned at creation', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);
  const executor = makeExecutor(repo, makeActorStore());

  const instance = await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });
  assert.equal(instance.definitionVersion, 1);

  // Publish v2 — existing instance still on v1
  await repo.saveDefinition({ ...SIMPLE_DEF, version: 2 });
  const refreshed = await repo.getInstance(instance.id);
  assert.equal(refreshed!.definitionVersion, 1);
});

/* ─── processDecision ───────────────────────────────────────── */

test('processDecision: approved → completes workflow', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);
  const executor = makeExecutor(repo, makeActorStore());

  const instance = await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });
  const result = await executor.processDecision(instance.id, 'manager-review', 'approved', 'mgr1');

  assert.equal(result.status, 'completed');
  assert.equal(result.result, 'approved');
  assert.ok(repo.events.some((e) => e.eventType === 'StepCompleted'));
  assert.ok(repo.events.some((e) => e.eventType === 'WorkflowCompleted'));
});

test('processDecision: declined → completes with declined result', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);
  const executor = makeExecutor(repo, makeActorStore());

  const instance = await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });
  const result = await executor.processDecision(instance.id, 'manager-review', 'declined', 'mgr1', 'Overlaps with team holiday');

  assert.equal(result.status, 'completed');
  assert.equal(result.result, 'declined');
});

test('processDecision: wrong actor is rejected', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);
  const executor = makeExecutor(repo, makeActorStore());

  const instance = await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });
  await assert.rejects(
    () => executor.processDecision(instance.id, 'manager-review', 'approved', 'emp1'),
    (e: EngineError) => e.code === 'FORBIDDEN',
  );
});

test('processDecision: inactive instance is rejected', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);
  const executor = makeExecutor(repo, makeActorStore());

  const instance = await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });
  await executor.processDecision(instance.id, 'manager-review', 'approved', 'mgr1');

  await assert.rejects(
    () => executor.processDecision(instance.id, 'manager-review', 'approved', 'mgr1'),
    (e: EngineError) => e.code === 'INVALID_STATE',
  );
});

/* ─── Condition / skip ──────────────────────────────────────── */

test('step with false condition is skipped to onSkip', async () => {
  const repo = makeRepo();
  const def: WorkflowDefinition = {
    workflowId: 'leave-approval',
    version: 1,
    trigger: 'LeaveRequestSubmitted',
    steps: [
      {
        id: 'manager-review',
        type: 'approval',
        actor: { strategy: 'reports_to', of: '$.requester' },
        transitions: [{ on: 'approved', to: 'hr-confirm' }, { on: 'declined', to: 'end_declined' }],
      },
      {
        id: 'hr-confirm',
        type: 'approval',
        actor: { strategy: 'role', role: 'hr_ops', scope: '$.entityId' },
        condition: '$.request.workingDays > 5',
        onSkip: 'end_approved',
        transitions: [{ on: 'approved', to: 'end_approved' }, { on: 'declined', to: 'end_declined' }],
      },
      { id: 'end_approved', type: 'terminal', result: 'approved', transitions: [] },
      { id: 'end_declined', type: 'terminal', result: 'declined', transitions: [] },
    ],
  };
  await repo.saveDefinition(def);
  const executor = makeExecutor(repo, makeActorStore());

  // workingDays = 3 → hr-confirm condition (>5) is false → skip to end_approved
  const instance = await executor.startInstance('leave-approval', {
    requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 },
  });
  const result = await executor.processDecision(instance.id, 'manager-review', 'approved', 'mgr1');
  assert.equal(result.status, 'completed');
  assert.equal(result.result, 'approved');
});

/* ─── Automated step ────────────────────────────────────────── */

test('automated step executes and advances to next step', async () => {
  const repo = makeRepo();
  const def: WorkflowDefinition = {
    workflowId: 'leave-approval',
    version: 1,
    trigger: 'LeaveRequestSubmitted',
    steps: [
      {
        id: 'manager-review',
        type: 'approval',
        actor: { strategy: 'named', employeeId: 'mgr1' },
        transitions: [{ on: 'approved', to: 'notify' }],
      },
      {
        id: 'notify',
        type: 'automated',
        action: 'PublishEvent',
        params: { event: 'LeaveApproved' },
        transitions: [{ on: 'success', to: 'end_approved' }],
      },
      { id: 'end_approved', type: 'terminal', result: 'approved', transitions: [] },
    ],
  };
  await repo.saveDefinition(def);
  const executor = makeExecutor(repo, makeActorStore());

  const instance = await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });
  const result = await executor.processDecision(instance.id, 'manager-review', 'approved', 'mgr1');

  assert.equal(result.status, 'completed');
  assert.equal(result.result, 'approved');
});

/* ─── cancelInstance ────────────────────────────────────────── */

test('cancelInstance: cancels active instance', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);
  const executor = makeExecutor(repo, makeActorStore());

  const instance = await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });
  const cancelled = await executor.cancelInstance(instance.id, 'User cancelled');
  assert.equal(cancelled.status, 'cancelled');
});

test('cancelInstance: throws on already-completed instance', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);
  const executor = makeExecutor(repo, makeActorStore());

  const instance = await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });
  await executor.processDecision(instance.id, 'manager-review', 'approved', 'mgr1');

  await assert.rejects(
    () => executor.cancelInstance(instance.id, 'too late'),
    (e: EngineError) => e.code === 'INVALID_STATE',
  );
});

/* ─── Delegation ────────────────────────────────────────────── */

test('delegation: resolves to delegate instead of original actor', async () => {
  const repo = makeRepo();
  await repo.saveDefinition(SIMPLE_DEF);

  const delegation: Delegation = {
    fromEmployeeId: 'mgr1',
    toEmployeeId: 'hr1',
    validFrom: new Date(Date.now() - 3600000).toISOString(),
    validUntil: new Date(Date.now() + 3600000).toISOString(),
  };

  const actorStore = makeActorStore({
    getActiveDelegation: async (id) => id === 'mgr1' ? delegation : null,
  });

  const executor = makeExecutor(repo, actorStore);
  const instance = await executor.startInstance('leave-approval', { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } });

  const steps = await repo.getStepExecutions(instance.id);
  assert.equal(steps[0].actorId, 'hr1'); // delegated to hr1
});
