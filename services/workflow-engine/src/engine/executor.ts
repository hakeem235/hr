/**
 * Workflow executor — the heart of the config-driven state machine.
 *
 * Key invariants (workflow-engine.md §3–6):
 * - Instances pin their definition version at creation.
 * - Every transition emits a domain event.
 * - Actors are resolved at step activation, not workflow start.
 * - Cancellation paths must exist from any non-terminal state.
 * - Definitions soft-delete only; instances keep running on their pinned ver.
 */

import type {
  WorkflowDefinition,
  WorkflowInstance,
  StepDefinition,
  StepExecution,
  ApprovalStep,
  WorkflowEngineDeps,
} from './types.js';
import { evaluateCondition } from './context.js';

export class WorkflowError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

function now(): string {
  return new Date().toISOString();
}

let _seq = 0;
export function newInstanceId(): string {
  return `wf_${Date.now().toString(36)}_${(++_seq).toString(36).padStart(4, '0')}`;
}

function stepDef(def: WorkflowDefinition, stepId: string): StepDefinition {
  const s = def.steps.find((s) => s.id === stepId);
  if (!s) throw new WorkflowError('STEP_NOT_FOUND', `Step '${stepId}' not in definition`);
  return s;
}

function transition(step: StepDefinition, on: string): string {
  if (step.type === 'terminal') throw new WorkflowError('TERMINAL', 'Already terminal');
  const t = step.transitions.find((t) => t.on === on);
  if (!t) throw new WorkflowError('NO_TRANSITION', `No transition '${on}' on step '${step.id}'`);
  return t.to;
}

// ---------------------------------------------------------------------------
// Start a new instance
// ---------------------------------------------------------------------------

export async function startWorkflow(
  trigger: string,
  context: Record<string, unknown>,
  entityId: string,
  correlationId: string,
  deps: WorkflowEngineDeps,
): Promise<WorkflowInstance> {
  const def = await deps.definitions.findByTrigger(trigger);
  if (!def) throw new WorkflowError('NO_DEFINITION', `No workflow for trigger '${trigger}'`);

  const firstStep = def.steps[0];
  if (!firstStep) throw new WorkflowError('EMPTY_DEFINITION', 'Workflow has no steps');

  const instance: WorkflowInstance = {
    id: newInstanceId(),
    workflowId: def.workflowId,
    version: def.version,
    trigger,
    context,
    status: 'running',
    currentStepId: firstStep.id,
    steps: [],
    entityId,
    correlationId,
    startedAt: now(),
    completedAt: null,
  };

  await deps.instances.save(instance);
  await activateStep(instance, firstStep, def, deps);
  return instance;
}

// ---------------------------------------------------------------------------
// Record a decision on the active approval step
// ---------------------------------------------------------------------------

export async function recordDecision(
  instanceId: string,
  stepId: string,
  decision: string,
  note: string | undefined,
  actorEmployeeId: string,
  deps: WorkflowEngineDeps,
): Promise<WorkflowInstance> {
  const instance = await deps.instances.findByIdOrThrow(instanceId);
  if (instance.status !== 'running') {
    throw new WorkflowError('INSTANCE_NOT_RUNNING', `Instance ${instanceId} is ${instance.status}`);
  }
  if (instance.currentStepId !== stepId) {
    throw new WorkflowError(
      'WRONG_STEP',
      `Active step is '${instance.currentStepId}', not '${stepId}'`,
    );
  }

  const def = await deps.definitions.findById(instance.workflowId, instance.version);
  if (!def) throw new WorkflowError('DEF_NOT_FOUND', 'Pinned definition version not found');

  const sdef = stepDef(def, stepId) as ApprovalStep;
  if (sdef.type !== 'approval') {
    throw new WorkflowError('NOT_APPROVAL', `Step '${stepId}' is not an approval step`);
  }
  if (decision === 'declined' && !note) {
    throw new WorkflowError('NOTE_REQUIRED', 'Note is required when declining');
  }

  const stepExec = instance.steps.find((s) => s.stepId === stepId);
  if (!stepExec || stepExec.state !== 'active') {
    throw new WorkflowError('STEP_NOT_ACTIVE', `Step '${stepId}' is not active`);
  }

  stepExec.state = 'done';
  stepExec.decision = decision;
  stepExec.note = note ?? null;
  stepExec.decidedAt = now();

  await deps.events.publish({
    eventType: 'StepCompleted',
    occurredAt: now(),
    entityId: instance.entityId,
    correlationId: instance.correlationId,
    aggregateType: 'workflow_instance',
    aggregateId: instance.id,
    payload: { instanceId: instance.id, stepId, decision, note },
  });

  const nextStepId = transition(sdef, decision);
  instance.currentStepId = nextStepId;

  const nextDef = stepDef(def, nextStepId);
  await activateStep(instance, nextDef, def, deps);
  return instance;
}

// ---------------------------------------------------------------------------
// Cancel — valid from any non-terminal state (workflow-engine.md §6)
// ---------------------------------------------------------------------------

export async function cancelWorkflow(
  instanceId: string,
  reason: string,
  deps: WorkflowEngineDeps,
): Promise<WorkflowInstance> {
  const instance = await deps.instances.findByIdOrThrow(instanceId);
  if (instance.status !== 'running') {
    throw new WorkflowError('INSTANCE_NOT_RUNNING', `Instance ${instanceId} is ${instance.status}`);
  }

  // Mark active step as skipped
  const active = instance.steps.find((s) => s.state === 'active');
  if (active) {
    active.state = 'skipped';
    active.decidedAt = now();
  }

  instance.status = 'cancelled';
  instance.currentStepId = null;
  instance.completedAt = now();

  await deps.events.publish({
    eventType: 'WorkflowCompleted',
    occurredAt: now(),
    entityId: instance.entityId,
    correlationId: instance.correlationId,
    aggregateType: 'workflow_instance',
    aggregateId: instance.id,
    payload: {
      instanceId: instance.id,
      workflowId: instance.workflowId,
      version: instance.version,
      result: 'cancelled',
      reason,
    },
  });

  await deps.instances.save(instance);
  return instance;
}

// ---------------------------------------------------------------------------
// Internal: activate a step (resolve actor, compute SLA, emit StepActivated)
// ---------------------------------------------------------------------------

async function activateStep(
  instance: WorkflowInstance,
  step: StepDefinition,
  def: WorkflowDefinition,
  deps: WorkflowEngineDeps,
): Promise<void> {
  if (step.type === 'terminal') {
    await completeWorkflow(instance, step.result, def, deps);
    return;
  }

  if (step.type === 'branch') {
    const branch = step.transitions.find((t) =>
      evaluateCondition(t.on, instance.context),
    ) ?? step.transitions[step.transitions.length - 1];
    instance.currentStepId = branch.to;
    const next = stepDef(def, branch.to);
    await activateStep(instance, next, def, deps);
    return;
  }

  if (step.type === 'automated') {
    const exec: StepExecution = {
      stepId: step.id,
      state: 'active',
      actorEmployeeId: null,
      decision: null,
      note: null,
      slaDueAt: null,
      activatedAt: now(),
      decidedAt: null,
    };
    instance.steps.push(exec);

    // Automated steps execute synchronously in the in-process model.
    // In production this dispatches to the action handler.
    exec.state = 'done';
    exec.decision = 'success';
    exec.decidedAt = now();

    const nextStepId = transition(step, 'success');
    instance.currentStepId = nextStepId;
    await deps.instances.save(instance);
    await activateStep(instance, stepDef(def, nextStepId), def, deps);
    return;
  }

  if (step.type === 'approval') {
    // Skip step when condition evaluates false (workflow-engine.md §2 onSkip)
    if (step.condition && !evaluateCondition(step.condition, instance.context)) {
      const exec: StepExecution = {
        stepId: step.id,
        state: 'skipped',
        actorEmployeeId: null,
        decision: null,
        note: null,
        slaDueAt: null,
        activatedAt: now(),
        decidedAt: now(),
      };
      instance.steps.push(exec);
      const skipTo = step.onSkip ?? step.transitions[0].to;
      instance.currentStepId = skipTo;
      await deps.instances.save(instance);
      await activateStep(instance, stepDef(def, skipTo), def, deps);
      return;
    }

    const actorId = await deps.actors.resolve(step.actor, instance.context);

    let slaDueAt: string | null = null;
    if (step.sla) {
      slaDueAt = await deps.sla.dueAt(
        now(),
        step.sla.duration,
        step.sla.businessHours,
        instance.entityId,
      );
    }

    const exec: StepExecution = {
      stepId: step.id,
      state: 'active',
      actorEmployeeId: actorId,
      decision: null,
      note: null,
      slaDueAt,
      activatedAt: now(),
      decidedAt: null,
    };
    instance.steps.push(exec);

    await deps.events.publish({
      eventType: 'StepActivated',
      occurredAt: now(),
      entityId: instance.entityId,
      correlationId: instance.correlationId,
      aggregateType: 'workflow_instance',
      aggregateId: instance.id,
      payload: {
        instanceId: instance.id,
        stepId: step.id,
        actorId,
        slaDueAt,
      },
    });

    await deps.instances.save(instance);
    return;
  }

  // parallel / wait — record as active; resolved by external signals
  const exec: StepExecution = {
    stepId: step.id,
    state: 'active',
    actorEmployeeId: null,
    decision: null,
    note: null,
    slaDueAt: null,
    activatedAt: now(),
    decidedAt: null,
  };
  instance.steps.push(exec);
  await deps.instances.save(instance);
}

async function completeWorkflow(
  instance: WorkflowInstance,
  result: string,
  _def: WorkflowDefinition,
  deps: WorkflowEngineDeps,
): Promise<void> {
  instance.status = 'completed';
  instance.completedAt = now();
  instance.currentStepId = null;

  await deps.events.publish({
    eventType: 'WorkflowCompleted',
    occurredAt: now(),
    entityId: instance.entityId,
    correlationId: instance.correlationId,
    aggregateType: 'workflow_instance',
    aggregateId: instance.id,
    payload: {
      instanceId: instance.id,
      workflowId: instance.workflowId,
      version: instance.version,
      result,
    },
  });

  await deps.instances.save(instance);
}
