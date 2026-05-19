import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startWorkflow,
  recordDecision,
  cancelWorkflow,
  WorkflowError,
} from '../src/engine/executor.js';
import type { WorkflowDefinition, WorkflowEngineDeps } from '../src/engine/types.js';
import {
  InMemoryDefinitionRepo,
  InMemoryInstanceRepo,
  InMemoryCalendarRepo,
  InMemoryOrgRepo,
  InMemoryEventPublisher,
} from '../src/db/in-memory.js';
import { createActorResolver } from '../src/engine/actor-resolver.js';
import { createSlaCalculator } from '../src/engine/sla.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const leaveApprovalDef: WorkflowDefinition = {
  workflowId: 'leave-approval',
  version: 1,
  trigger: 'LeaveRequestSubmitted',
  steps: [
    {
      id: 'manager-review',
      type: 'approval',
      actor: { strategy: 'reports_to', of: '$.requester' },
      sla: { duration: 'PT8H', businessHours: true },
      onTimeout: 'escalate',
      escalateTo: { strategy: 'reports_to', of: '$.step.actor' },
      transitions: [
        { on: 'approved', to: 'hr-confirm' },
        { on: 'declined', to: 'end_declined' },
      ],
    },
    {
      id: 'hr-confirm',
      type: 'approval',
      actor: { strategy: 'role', role: 'hr_ops', scope: '$.entityId' },
      condition: '$.request.workingDays > 5',
      onSkip: 'calendar-update',
      transitions: [
        { on: 'approved', to: 'calendar-update' },
        { on: 'declined', to: 'end_declined' },
      ],
    },
    {
      id: 'calendar-update',
      type: 'automated',
      action: 'PublishEvent',
      params: { event: 'LeaveApproved' },
      transitions: [{ on: 'success', to: 'end_approved' }],
    },
    { id: 'end_approved', type: 'terminal', result: 'approved' },
    { id: 'end_declined', type: 'terminal', result: 'declined' },
  ],
};

function makeDeps(overrides?: Partial<WorkflowEngineDeps>): {
  deps: WorkflowEngineDeps;
  definitions: InMemoryDefinitionRepo;
  instances: InMemoryInstanceRepo;
  org: InMemoryOrgRepo;
  publisher: InMemoryEventPublisher;
} {
  const definitions = new InMemoryDefinitionRepo();
  const instances = new InMemoryInstanceRepo();
  const calRepo = new InMemoryCalendarRepo();
  const org = new InMemoryOrgRepo();
  const publisher = new InMemoryEventPublisher();

  const deps: WorkflowEngineDeps = {
    definitions,
    instances,
    actors: createActorResolver(org),
    sla: createSlaCalculator(calRepo),
    events: publisher,
    ...overrides,
  };
  return { deps, definitions, instances, org, publisher };
}

// ---------------------------------------------------------------------------
// startWorkflow
// ---------------------------------------------------------------------------

test('startWorkflow fails when no definition matches trigger', async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    () => startWorkflow('Unknown', {}, 'ent1', 'corr1', deps),
    (e: any) => e.code === 'NO_DEFINITION',
  );
});

test('startWorkflow activates first approval step and resolves actor', async () => {
  const { deps, definitions, instances, org, publisher } = makeDeps();
  await definitions.save(leaveApprovalDef);
  org.setManager('emp1', 'mgr1');

  const inst = await startWorkflow(
    'LeaveRequestSubmitted',
    { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } },
    'ent1',
    'corr1',
    deps,
  );

  assert.equal(inst.status, 'running');
  assert.equal(inst.currentStepId, 'manager-review');
  assert.equal(inst.steps.length, 1);
  assert.equal(inst.steps[0].state, 'active');
  assert.equal(inst.steps[0].actorEmployeeId, 'mgr1');
  assert.equal(inst.steps[0].slaDueAt != null, true);

  const stepActivated = publisher.events.find((e) => e.eventType === 'StepActivated');
  assert.ok(stepActivated, 'StepActivated event emitted');

  // Instance persisted
  const persisted = await instances.findById(inst.id);
  assert.ok(persisted);
});

test('startWorkflow uses delegate when manager has active delegation', async () => {
  const { deps, definitions, org } = makeDeps();
  await definitions.save(leaveApprovalDef);
  org.setManager('emp1', 'mgr1');
  org.setDelegate('mgr1', 'delegate1');

  const inst = await startWorkflow(
    'LeaveRequestSubmitted',
    { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } },
    'ent1',
    'corr1',
    deps,
  );

  assert.equal(inst.steps[0].actorEmployeeId, 'delegate1');
});

// ---------------------------------------------------------------------------
// recordDecision — happy path
// ---------------------------------------------------------------------------

test('recordDecision approved advances to hr-confirm when workingDays > 5', async () => {
  const { deps, definitions, instances, org, publisher } = makeDeps();
  await definitions.save(leaveApprovalDef);
  org.setManager('emp1', 'mgr1');
  org.setRoleMembers('hr_ops', 'ent1', ['hr1']);

  const inst = await startWorkflow(
    'LeaveRequestSubmitted',
    { requester: 'emp1', entityId: 'ent1', request: { workingDays: 6 } },
    'ent1',
    'corr1',
    deps,
  );

  const updated = await recordDecision(
    inst.id, 'manager-review', 'approved', undefined, 'mgr1', deps,
  );

  assert.equal(updated.currentStepId, 'hr-confirm');
  const hrStep = updated.steps.find((s) => s.stepId === 'hr-confirm');
  assert.ok(hrStep);
  assert.equal(hrStep.state, 'active');
  assert.equal(hrStep.actorEmployeeId, 'hr1');

  const completed = publisher.events.find((e) => e.eventType === 'StepCompleted');
  assert.ok(completed);
});

test('recordDecision approved skips hr-confirm when workingDays <= 5', async () => {
  const { deps, definitions, org, publisher } = makeDeps();
  await definitions.save(leaveApprovalDef);
  org.setManager('emp1', 'mgr1');

  const inst = await startWorkflow(
    'LeaveRequestSubmitted',
    { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } },
    'ent1',
    'corr1',
    deps,
  );

  // Manager approves → hr-confirm condition is false (3 <= 5) → skip to end_approved via calendar-update
  const updated = await recordDecision(
    inst.id, 'manager-review', 'approved', undefined, 'mgr1', deps,
  );

  // automated step runs synchronously → workflow completes
  assert.equal(updated.status, 'completed');
  const completed = publisher.events.find((e) => e.eventType === 'WorkflowCompleted');
  assert.ok(completed);
  assert.equal((completed!.payload as any).result, 'approved');
});

test('recordDecision declined ends workflow with declined result', async () => {
  const { deps, definitions, org, publisher } = makeDeps();
  await definitions.save(leaveApprovalDef);
  org.setManager('emp1', 'mgr1');

  const inst = await startWorkflow(
    'LeaveRequestSubmitted',
    { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } },
    'ent1',
    'corr1',
    deps,
  );

  const updated = await recordDecision(
    inst.id, 'manager-review', 'declined', 'Not enough balance', 'mgr1', deps,
  );

  assert.equal(updated.status, 'completed');
  const wfCompleted = publisher.events.find((e) => e.eventType === 'WorkflowCompleted');
  assert.equal((wfCompleted!.payload as any).result, 'declined');
});

test('recordDecision declined without note throws NOTE_REQUIRED', async () => {
  const { deps, definitions, org } = makeDeps();
  await definitions.save(leaveApprovalDef);
  org.setManager('emp1', 'mgr1');

  const inst = await startWorkflow(
    'LeaveRequestSubmitted',
    { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } },
    'ent1',
    'corr1',
    deps,
  );

  await assert.rejects(
    () => recordDecision(inst.id, 'manager-review', 'declined', undefined, 'mgr1', deps),
    (e: any) => e.code === 'NOTE_REQUIRED',
  );
});

test('recordDecision on non-running instance throws INSTANCE_NOT_RUNNING', async () => {
  const { deps, definitions, org } = makeDeps();
  await definitions.save(leaveApprovalDef);
  org.setManager('emp1', 'mgr1');

  const inst = await startWorkflow(
    'LeaveRequestSubmitted',
    { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } },
    'ent1',
    'corr1',
    deps,
  );

  await cancelWorkflow(inst.id, 'test', deps);

  await assert.rejects(
    () => recordDecision(inst.id, 'manager-review', 'approved', undefined, 'mgr1', deps),
    (e: any) => e.code === 'INSTANCE_NOT_RUNNING',
  );
});

// ---------------------------------------------------------------------------
// cancelWorkflow
// ---------------------------------------------------------------------------

test('cancelWorkflow marks instance cancelled from any state', async () => {
  const { deps, definitions, org, publisher } = makeDeps();
  await definitions.save(leaveApprovalDef);
  org.setManager('emp1', 'mgr1');

  const inst = await startWorkflow(
    'LeaveRequestSubmitted',
    { requester: 'emp1', entityId: 'ent1', request: { workingDays: 3 } },
    'ent1',
    'corr1',
    deps,
  );

  const cancelled = await cancelWorkflow(inst.id, 'Employee withdrew request', deps);
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(cancelled.completedAt);

  const wfCompleted = publisher.events.find((e) => e.eventType === 'WorkflowCompleted');
  assert.equal((wfCompleted!.payload as any).result, 'cancelled');
});

// ---------------------------------------------------------------------------
// SLA calculator
// ---------------------------------------------------------------------------

test('sla calculator adds calendar hours skipping weekends', async () => {
  const calRepo = new InMemoryCalendarRepo();
  const { createSlaCalculator } = await import('../src/engine/sla.js');
  const sla = createSlaCalculator(calRepo);

  // Friday 2026-03-13 17:00 UTC; KSA cal skips Fri/Sat
  const from = '2026-03-13T17:00:00.000Z';
  const due = await sla.dueAt(from, 'PT8H', true, 'ent1');
  const dueDate = new Date(due);
  // Should land on Sunday 2026-03-15 at ~17:00
  assert.equal(dueDate.getUTCDay(), 0, 'should land on a Sunday (KSA work day)');
});
