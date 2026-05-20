/**
 * Workflow engine service entrypoint.
 * Wires the in-memory repo + seed definitions + Fastify HTTP layer.
 */
import Fastify from 'fastify';
import { WorkflowExecutor, type EngineRepo } from './domain/executor.js';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  StepExecution,
  DomainEvent,
} from './domain/types.js';
import { registerInstanceRoutes } from './routes/instance-routes.js';
import { SlaScheduler } from './domain/scheduler.js';
import { registerDefinitionRoutes } from './routes/definition-routes.js';
import type { ActorStore, OrgNode, Delegation } from './domain/actor-resolver.js';
import type { WorkingCalendar } from './domain/sla.js';
import { KSA_CALENDAR } from './domain/sla.js';

/* ─── In-memory repo ────────────────────────────────────────── */

class InMemoryEngineRepo implements EngineRepo {
  /** definitions[workflowId][version] */
  private definitions = new Map<string, Map<number, WorkflowDefinition>>();
  private instances   = new Map<string, WorkflowInstance>();
  private steps       = new Map<string, StepExecution[]>();  // instanceId → steps
  private outbox: DomainEvent[] = [];

  listDefinitions(): WorkflowDefinition[] {
    const out: WorkflowDefinition[] = [];
    for (const versions of this.definitions.values()) {
      const latest = Math.max(...versions.keys());
      out.push(versions.get(latest)!);
    }
    return out;
  }

  async getDefinition(workflowId: string, version?: number): Promise<WorkflowDefinition | null> {
    const versions = this.definitions.get(workflowId);
    if (!versions) return null;
    if (version !== undefined) return versions.get(version) ?? null;
    const latest = Math.max(...versions.keys());
    return versions.get(latest) ?? null;
  }

  async getLatestDefinition(workflowId: string): Promise<WorkflowDefinition | null> {
    return this.getDefinition(workflowId);
  }

  async saveDefinition(def: WorkflowDefinition): Promise<void> {
    if (!this.definitions.has(def.workflowId)) {
      this.definitions.set(def.workflowId, new Map());
    }
    this.definitions.get(def.workflowId)!.set(def.version, def);
  }

  async getInstance(id: string): Promise<WorkflowInstance | null> {
    return this.instances.get(id) ?? null;
  }

  async saveInstance(instance: WorkflowInstance): Promise<void> {
    this.instances.set(instance.id, instance);
  }

  async getStepExecutions(instanceId: string): Promise<StepExecution[]> {
    return this.steps.get(instanceId) ?? [];
  }

  async saveStepExecution(step: StepExecution): Promise<void> {
    const list = this.steps.get(step.instanceId) ?? [];
    list.push(step);
    this.steps.set(step.instanceId, list);
  }

  async updateStepExecution(step: StepExecution): Promise<void> {
    const list = this.steps.get(step.instanceId) ?? [];
    const idx = list.findIndex((s) => s.id === step.id);
    if (idx >= 0) list[idx] = step;
    else list.push(step);
    this.steps.set(step.instanceId, list);
  }

  async commitTransition(
    instance: WorkflowInstance,
    step: StepExecution,
    event: DomainEvent,
  ): Promise<void> {
    this.instances.set(instance.id, instance);
    const list = this.steps.get(step.instanceId) ?? [];
    const idx = list.findIndex((s) => s.id === step.id);
    if (idx >= 0) list[idx] = step; else list.push(step);
    this.steps.set(step.instanceId, list);
    this.outbox.push(event);
    console.log('[outbox]', event.eventType, event.aggregateId, event.payload);
  }

  async listInstances(filter: { status?: string; limit?: number; cursor?: string } = {}): Promise<{ items: WorkflowInstance[]; steps: Record<string, StepExecution[]>; nextCursor: string | null }> {
    const limit = filter.limit ?? 50;
    let all = [...this.instances.values()];
    if (filter.status) all = all.filter((i) => i.status === filter.status);
    all.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    if (filter.cursor) {
      const idx = all.findIndex((i) => i.id === filter.cursor);
      if (idx !== -1) all = all.slice(idx + 1);
    }

    const page = all.slice(0, limit);
    const nextCursor = all.length > limit ? page[page.length - 1].id : null;
    const steps: Record<string, StepExecution[]> = {};
    for (const inst of page) {
      steps[inst.id] = this.steps.get(inst.id) ?? [];
    }
    return { items: page, steps, nextCursor };
  }

  async listPendingApprovals(actorId?: string, limit = 50): Promise<Array<{
    instance: WorkflowInstance;
    step: StepExecution;
    definition: WorkflowDefinition;
  }>> {
    const results = [];
    for (const [instanceId, steps] of this.steps.entries()) {
      const instance = this.instances.get(instanceId);
      if (!instance || instance.status !== 'active') continue;

      for (const step of steps) {
        if (step.state !== 'active') continue;
        if (actorId && step.actorId !== actorId) continue;

        const def = await this.getDefinition(instance.workflowId, instance.definitionVersion);
        if (!def) continue;

        const stepDef = def.steps.find((s) => s.id === step.stepId);
        if (!stepDef || stepDef.type !== 'approval') continue;

        results.push({ instance, step, definition: def });
        if (results.length >= limit) return results;
      }
    }
    return results;
  }
}

/* ─── In-memory org / actor store ──────────────────────────── */

class InMemoryActorStore implements ActorStore {
  private employees: OrgNode[] = [
    { employeeId: 'emp_018f23', managerId: 'emp_mgr01', role: 'employee',  entityId: 'ent_default', isActive: true },
    { employeeId: 'emp_004a11', managerId: 'emp_mgr01', role: 'employee',  entityId: 'ent_default', isActive: true },
    { employeeId: 'emp_0c3b77', managerId: 'emp_mgr02', role: 'employee',  entityId: 'ent_default', isActive: true },
    { employeeId: 'emp_mgr01', managerId: 'emp_dir01',  role: 'manager',   entityId: 'ent_default', isActive: true },
    { employeeId: 'emp_mgr02', managerId: 'emp_dir01',  role: 'manager',   entityId: 'ent_default', isActive: true },
    { employeeId: 'emp_dir01', managerId: undefined,    role: 'director',  entityId: 'ent_default', isActive: true },
    { employeeId: 'emp_hr01',  managerId: 'emp_dir01',  role: 'hr_ops',    entityId: 'ent_default', isActive: true },
    { employeeId: 'emp_hr02',  managerId: 'emp_dir01',  role: 'hr_ops',    entityId: 'ent_default', isActive: true },
  ];

  private delegations: Delegation[] = [];

  async findEmployee(employeeId: string): Promise<OrgNode | null> {
    return this.employees.find((e) => e.employeeId === employeeId) ?? null;
  }

  async findManager(employeeId: string): Promise<OrgNode | null> {
    const emp = this.employees.find((e) => e.employeeId === employeeId);
    if (!emp?.managerId) return null;
    return this.employees.find((e) => e.employeeId === emp.managerId) ?? null;
  }

  async findByRole(role: string, entityId: string): Promise<OrgNode[]> {
    return this.employees.filter(
      (e) => e.role === role && e.entityId === entityId && e.isActive,
    );
  }

  async getActiveDelegation(employeeId: string): Promise<Delegation | null> {
    const now = new Date().toISOString();
    return this.delegations.find(
      (d) =>
        d.fromEmployeeId === employeeId &&
        d.validFrom <= now &&
        d.validUntil >= now,
    ) ?? null;
  }
}

/* ─── Seed workflow definitions ─────────────────────────────── */

const LEAVE_APPROVAL_DEF: WorkflowDefinition = {
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
      maxEscalations: 2,
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
      sla: { duration: 'PT4H', businessHours: true },
      onTimeout: 'auto-approve',
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
    { id: 'end_approved', type: 'terminal', result: 'approved', transitions: [] },
    { id: 'end_declined', type: 'terminal', result: 'declined', transitions: [] },
  ],
};

const LETTER_APPROVAL_DEF: WorkflowDefinition = {
  workflowId: 'letter-approval',
  version: 1,
  trigger: 'LetterRequested',
  steps: [
    {
      id: 'hr-review',
      type: 'approval',
      actor: { strategy: 'role', role: 'hr_ops', scope: '$.entityId' },
      sla: { duration: 'PT4H', businessHours: true },
      onTimeout: 'auto-approve',
      transitions: [
        { on: 'approved', to: 'generate-letter' },
        { on: 'declined', to: 'end_declined' },
      ],
    },
    {
      id: 'generate-letter',
      type: 'automated',
      action: 'PublishEvent',
      params: { event: 'LetterIssued' },
      transitions: [{ on: 'success', to: 'end_approved' }],
    },
    { id: 'end_approved', type: 'terminal', result: 'approved', transitions: [] },
    { id: 'end_declined', type: 'terminal', result: 'declined', transitions: [] },
  ],
};

/* ─── Bootstrap ─────────────────────────────────────────────── */

const repo = new InMemoryEngineRepo();
const actorStore = new InMemoryActorStore();

// Seed definitions
await repo.saveDefinition(LEAVE_APPROVAL_DEF);
await repo.saveDefinition(LETTER_APPROVAL_DEF);

// Seed completed instances for history view
const seedCompleted = async () => {
  const d = (offset: number) => new Date(Date.now() + offset).toISOString().replace('Z', '+00:00');

  const i1: WorkflowInstance = {
    id: 'wf_hist_001', workflowId: 'leave-approval', definitionVersion: 1,
    status: 'completed', result: 'approved', currentStepIds: [],
    context: { employeeId: 'emp_018f23', entityId: 'ent_default', leaveType: 'annual', days: 5 },
    createdAt: d(-3 * 86400_000), updatedAt: d(-2 * 86400_000 - 3600_000),
    completedAt: d(-2 * 86400_000 - 3600_000),
  };
  const s1: StepExecution = {
    id: 'step_hist_001', instanceId: 'wf_hist_001', stepId: 'manager-review',
    state: 'done', actorId: 'emp_mgr01', escalationCount: 0,
    activatedAt: d(-3 * 86400_000 + 1000),
    decidedAt: d(-2 * 86400_000 - 3600_000),
    decision: 'approved',
    slaDueAt: d(-2 * 86400_000),
  };

  const i2: WorkflowInstance = {
    id: 'wf_hist_002', workflowId: 'leave-approval', definitionVersion: 1,
    status: 'completed', result: 'declined', currentStepIds: [],
    context: { employeeId: 'emp_004a11', entityId: 'ent_default', leaveType: 'annual', days: 10 },
    createdAt: d(-5 * 86400_000), updatedAt: d(-5 * 86400_000 + 4 * 3600_000),
    completedAt: d(-5 * 86400_000 + 4 * 3600_000),
  };
  const s2: StepExecution = {
    id: 'step_hist_002', instanceId: 'wf_hist_002', stepId: 'manager-review',
    state: 'done', actorId: 'emp_mgr01', escalationCount: 0,
    activatedAt: d(-5 * 86400_000 + 1000),
    decidedAt: d(-5 * 86400_000 + 4 * 3600_000),
    decision: 'declined', note: 'Peak period — please reschedule.',
    slaDueAt: d(-3 * 86400_000),
  };

  const i3: WorkflowInstance = {
    id: 'wf_hist_003', workflowId: 'letter-approval', definitionVersion: 1,
    status: 'completed', result: 'approved', currentStepIds: [],
    context: { employeeId: 'emp_0c3b77', entityId: 'ent_default', letterType: 'employment_verification' },
    createdAt: d(-7 * 86400_000), updatedAt: d(-7 * 86400_000 + 2 * 3600_000),
    completedAt: d(-7 * 86400_000 + 2 * 3600_000),
  };
  const s3: StepExecution = {
    id: 'step_hist_003', instanceId: 'wf_hist_003', stepId: 'hr-review',
    state: 'done', actorId: 'emp_hr01', escalationCount: 0,
    activatedAt: d(-7 * 86400_000 + 500),
    decidedAt: d(-7 * 86400_000 + 2 * 3600_000),
    decision: 'approved',
    slaDueAt: d(-6 * 86400_000),
  };

  const i4: WorkflowInstance = {
    id: 'wf_hist_004', workflowId: 'leave-approval', definitionVersion: 1,
    status: 'cancelled', currentStepIds: [],
    context: { employeeId: 'emp_004a11', entityId: 'ent_default', leaveType: 'emergency', days: 2 },
    createdAt: d(-10 * 86400_000), updatedAt: d(-9 * 86400_000),
    completedAt: d(-9 * 86400_000),
  };
  const s4: StepExecution = {
    id: 'step_hist_004', instanceId: 'wf_hist_004', stepId: 'manager-review',
    state: 'skipped', actorId: 'emp_mgr01', escalationCount: 0,
    activatedAt: d(-10 * 86400_000 + 500),
    slaDueAt: d(-8 * 86400_000),
  };

  await repo.saveInstance(i1); await repo.saveStepExecution(s1);
  await repo.saveInstance(i2); await repo.saveStepExecution(s2);
  await repo.saveInstance(i3); await repo.saveStepExecution(s3);
  await repo.saveInstance(i4); await repo.saveStepExecution(s4);
};
await seedCompleted();

const executor = new WorkflowExecutor(
  repo,
  actorStore,
  async (_entityId: string): Promise<WorkingCalendar> => KSA_CALENDAR,
);

const SLA_POLL_INTERVAL = Number(process.env.SLA_POLL_INTERVAL_MS ?? 60_000);
const scheduler = new SlaScheduler(repo, executor, { intervalMs: SLA_POLL_INTERVAL });
scheduler.start();

const app = Fastify({ logger: true });

app.get('/', async () => ({
  service: 'workflow-engine',
  version: '0.1.0',
  definitions: ['leave-approval', 'letter-approval'],
  endpoints: [
    'GET  /api/v1/workflow-definitions',
    'GET  /api/v1/workflow-definitions/:workflowId',
    'POST /api/v1/workflow-definitions',
    'DELETE /api/v1/workflow-definitions/:workflowId',
    'GET  /api/v1/workflow-instances/:id',
    'POST /api/v1/workflow-instances',
    'POST /api/v1/workflow-instances/:id/steps/:stepId/decision',
    'POST /api/v1/workflow-instances/:id/cancel',
    'GET  /api/v1/approvals',
    'GET  /api/v1/health',
  ],
}));

app.get('/api/v1/health', async () => ({ status: 'ok', service: 'workflow-engine' }));

registerDefinitionRoutes(app, repo);
registerInstanceRoutes(app, executor);

const port = Number(process.env.PORT ?? 3002);
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
