/**
 * Workflow engine service entrypoint.
 * Wires the in-memory repo + seed definitions + Fastify HTTP layer.
 */
import Fastify from 'fastify';
import { WorkflowExecutor } from './domain/executor.js';
import { registerInstanceRoutes } from './routes/instance-routes.js';
import { SlaScheduler } from './domain/scheduler.js';
import { registerDefinitionRoutes } from './routes/definition-routes.js';
import { KSA_CALENDAR } from './domain/sla.js';
/* ─── In-memory repo ────────────────────────────────────────── */
class InMemoryEngineRepo {
    /** definitions[workflowId][version] */
    definitions = new Map();
    instances = new Map();
    steps = new Map(); // instanceId → steps
    outbox = [];
    listDefinitions() {
        const out = [];
        for (const versions of this.definitions.values()) {
            const latest = Math.max(...versions.keys());
            out.push(versions.get(latest));
        }
        return out;
    }
    async getDefinition(workflowId, version) {
        const versions = this.definitions.get(workflowId);
        if (!versions)
            return null;
        if (version !== undefined)
            return versions.get(version) ?? null;
        const latest = Math.max(...versions.keys());
        return versions.get(latest) ?? null;
    }
    async getLatestDefinition(workflowId) {
        return this.getDefinition(workflowId);
    }
    async saveDefinition(def) {
        if (!this.definitions.has(def.workflowId)) {
            this.definitions.set(def.workflowId, new Map());
        }
        this.definitions.get(def.workflowId).set(def.version, def);
    }
    async getInstance(id) {
        return this.instances.get(id) ?? null;
    }
    async saveInstance(instance) {
        this.instances.set(instance.id, instance);
    }
    async getStepExecutions(instanceId) {
        return this.steps.get(instanceId) ?? [];
    }
    async saveStepExecution(step) {
        const list = this.steps.get(step.instanceId) ?? [];
        list.push(step);
        this.steps.set(step.instanceId, list);
    }
    async updateStepExecution(step) {
        const list = this.steps.get(step.instanceId) ?? [];
        const idx = list.findIndex((s) => s.id === step.id);
        if (idx >= 0)
            list[idx] = step;
        else
            list.push(step);
        this.steps.set(step.instanceId, list);
    }
    async commitTransition(instance, step, event) {
        this.instances.set(instance.id, instance);
        const list = this.steps.get(step.instanceId) ?? [];
        const idx = list.findIndex((s) => s.id === step.id);
        if (idx >= 0)
            list[idx] = step;
        else
            list.push(step);
        this.steps.set(step.instanceId, list);
        this.outbox.push(event);
        console.log('[outbox]', event.eventType, event.aggregateId, event.payload);
    }
    async listPendingApprovals(actorId, limit = 50) {
        const results = [];
        for (const [instanceId, steps] of this.steps.entries()) {
            const instance = this.instances.get(instanceId);
            if (!instance || instance.status !== 'active')
                continue;
            for (const step of steps) {
                if (step.state !== 'active')
                    continue;
                if (actorId && step.actorId !== actorId)
                    continue;
                const def = await this.getDefinition(instance.workflowId, instance.definitionVersion);
                if (!def)
                    continue;
                const stepDef = def.steps.find((s) => s.id === step.stepId);
                if (!stepDef || stepDef.type !== 'approval')
                    continue;
                results.push({ instance, step, definition: def });
                if (results.length >= limit)
                    return results;
            }
        }
        return results;
    }
}
/* ─── In-memory org / actor store ──────────────────────────── */
class InMemoryActorStore {
    employees = [
        { employeeId: 'emp_018f23', managerId: 'emp_mgr01', role: 'employee', entityId: 'ent_default', isActive: true },
        { employeeId: 'emp_004a11', managerId: 'emp_mgr01', role: 'employee', entityId: 'ent_default', isActive: true },
        { employeeId: 'emp_0c3b77', managerId: 'emp_mgr02', role: 'employee', entityId: 'ent_default', isActive: true },
        { employeeId: 'emp_mgr01', managerId: 'emp_dir01', role: 'manager', entityId: 'ent_default', isActive: true },
        { employeeId: 'emp_mgr02', managerId: 'emp_dir01', role: 'manager', entityId: 'ent_default', isActive: true },
        { employeeId: 'emp_dir01', managerId: undefined, role: 'director', entityId: 'ent_default', isActive: true },
        { employeeId: 'emp_hr01', managerId: 'emp_dir01', role: 'hr_ops', entityId: 'ent_default', isActive: true },
        { employeeId: 'emp_hr02', managerId: 'emp_dir01', role: 'hr_ops', entityId: 'ent_default', isActive: true },
    ];
    delegations = [];
    async findEmployee(employeeId) {
        return this.employees.find((e) => e.employeeId === employeeId) ?? null;
    }
    async findManager(employeeId) {
        const emp = this.employees.find((e) => e.employeeId === employeeId);
        if (!emp?.managerId)
            return null;
        return this.employees.find((e) => e.employeeId === emp.managerId) ?? null;
    }
    async findByRole(role, entityId) {
        return this.employees.filter((e) => e.role === role && e.entityId === entityId && e.isActive);
    }
    async getActiveDelegation(employeeId) {
        const now = new Date().toISOString();
        return this.delegations.find((d) => d.fromEmployeeId === employeeId &&
            d.validFrom <= now &&
            d.validUntil >= now) ?? null;
    }
}
/* ─── Seed workflow definitions ─────────────────────────────── */
const LEAVE_APPROVAL_DEF = {
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
const LETTER_APPROVAL_DEF = {
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
const executor = new WorkflowExecutor(repo, actorStore, async (_entityId) => KSA_CALENDAR);
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
    if (err) {
        app.log.error(err);
        process.exit(1);
    }
});
