/**
 * Workflow execution engine (workflow-engine.md §3).
 *
 * Responsibilities:
 *   - Start a new instance for a trigger event
 *   - Activate the first step
 *   - Process decisions on approval steps
 *   - Execute automated steps immediately
 *   - Evaluate branch conditions
 *   - Fan-out/join parallel steps
 *   - Advance the state machine until it reaches a blocking or terminal step
 *   - Emit domain events on every transition
 */
import { randomUUID } from 'node:crypto';
import { EngineError } from './types.js';
import { evaluateCondition, resolvePath } from './context.js';
import { computeSlaDueAt } from './sla.js';
import { resolveActor } from './actor-resolver.js';
/* ─── Helpers ────────────────────────────────────────────────── */
function newId(prefix) {
    return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
function makeEvent(type, instance, payload) {
    return {
        eventId: randomUUID(),
        eventType: type,
        entityId: instance.context.entityId ?? 'unknown',
        correlationId: instance.context.correlationId ?? randomUUID(),
        occurredAt: new Date().toISOString(),
        aggregateType: 'workflow_instance',
        aggregateId: instance.id,
        payload,
    };
}
function getStep(def, stepId) {
    const step = def.steps.find((s) => s.id === stepId);
    if (!step)
        throw new EngineError('STEP_NOT_FOUND', `Step "${stepId}" not found in definition "${def.workflowId}" v${def.version}`);
    return step;
}
function nextStepId(stepDef, event) {
    const t = stepDef.transitions.find((tr) => tr.on === event);
    return t?.to ?? null;
}
/* ─── Engine class ───────────────────────────────────────────── */
export class WorkflowExecutor {
    repo;
    actorStore;
    calendarFor;
    constructor(repo, actorStore, calendarFor) {
        this.repo = repo;
        this.actorStore = actorStore;
        this.calendarFor = calendarFor;
    }
    /* ── Start a new instance ──────────────────────────────────── */
    async startInstance(workflowId, context) {
        const def = await this.repo.getLatestDefinition(workflowId);
        if (!def)
            throw new EngineError('DEFINITION_NOT_FOUND', `No workflow definition found for "${workflowId}"`);
        if (def.deletedAt)
            throw new EngineError('DEFINITION_DELETED', `Workflow "${workflowId}" has been deleted`);
        const now = new Date().toISOString();
        const instance = {
            id: newId('wf'),
            workflowId: def.workflowId,
            definitionVersion: def.version,
            status: 'active',
            context,
            currentStepIds: [],
            createdAt: now,
            updatedAt: now,
        };
        await this.repo.saveInstance(instance);
        // Activate the first step (index 0 in definition)
        const firstStep = def.steps[0];
        if (!firstStep)
            throw new EngineError('EMPTY_DEFINITION', `Workflow "${workflowId}" has no steps`);
        await this.activateStep(instance, def, firstStep);
        return (await this.repo.getInstance(instance.id));
    }
    /* ── Activate a step ───────────────────────────────────────── */
    async activateStep(instance, def, stepDef) {
        // Condition check — skip if false
        if ('condition' in stepDef && stepDef.condition) {
            const passes = evaluateCondition(stepDef.condition, instance.context);
            if (!passes) {
                const skipTarget = stepDef.onSkip;
                if (skipTarget) {
                    const skipStep = getStep(def, skipTarget);
                    return this.activateStep(instance, def, skipStep);
                }
                // No onSkip — find first transition and follow it
                const firstTransition = stepDef.transitions[0];
                if (firstTransition) {
                    const next = getStep(def, firstTransition.to);
                    return this.activateStep(instance, def, next);
                }
                return;
            }
        }
        switch (stepDef.type) {
            case 'approval':
                return this.activateApproval(instance, def, stepDef);
            case 'automated':
                return this.executeAutomated(instance, def, stepDef);
            case 'branch':
                return this.executeBranch(instance, def, stepDef);
            case 'parallel':
                return this.executeParallel(instance, def, stepDef);
            case 'terminal':
                return this.completeInstance(instance, stepDef.result);
            case 'wait':
                return this.activateWait(instance, def, stepDef);
        }
    }
    async activateApproval(instance, def, stepDef) {
        const entityId = instance.context.entityId;
        const cal = await this.calendarFor(entityId);
        // Resolve actor at activation time, not workflow start
        let actorId;
        try {
            actorId = await resolveActor(stepDef.actor, instance.context, this.actorStore);
        }
        catch {
            // Actor resolution failed — log but don't block (notify HR)
            actorId = undefined;
        }
        let slaDueAt;
        if (stepDef.sla) {
            slaDueAt = computeSlaDueAt(new Date(), stepDef.sla.duration, stepDef.sla.businessHours, cal);
        }
        const stepExec = {
            id: newId('step'),
            instanceId: instance.id,
            stepId: stepDef.id,
            actorId,
            state: 'active',
            slaDueAt,
            activatedAt: new Date().toISOString(),
            escalationCount: 0,
        };
        const updated = {
            ...instance,
            currentStepIds: [...instance.currentStepIds.filter((id) => id !== stepDef.id), stepDef.id],
            updatedAt: new Date().toISOString(),
        };
        const event = makeEvent('StepActivated', instance, {
            stepId: stepDef.id,
            actorId,
            slaDueAt,
        });
        await this.repo.commitTransition(updated, stepExec, event);
    }
    async executeAutomated(instance, def, stepDef) {
        const stepExec = {
            id: newId('step'),
            instanceId: instance.id,
            stepId: stepDef.id,
            state: 'active',
            activatedAt: new Date().toISOString(),
            escalationCount: 0,
        };
        await this.repo.saveStepExecution(stepExec);
        // Execute the action
        let success = true;
        try {
            await this.runAction(stepDef.action, stepDef.params, instance);
        }
        catch {
            success = false;
        }
        const transitionEvent = success ? 'success' : 'failure';
        const nextId = nextStepId(stepDef, transitionEvent);
        const completed = {
            ...stepExec,
            state: success ? 'done' : 'failed',
            decidedAt: new Date().toISOString(),
        };
        const updatedInstance = {
            ...instance,
            currentStepIds: instance.currentStepIds.filter((id) => id !== stepDef.id),
            updatedAt: new Date().toISOString(),
        };
        const event = makeEvent('StepCompleted', instance, {
            stepId: stepDef.id,
            outcome: transitionEvent,
        });
        await this.repo.commitTransition(updatedInstance, completed, event);
        if (nextId) {
            const next = getStep(def, nextId);
            const refreshed = (await this.repo.getInstance(instance.id));
            await this.activateStep(refreshed, def, next);
        }
    }
    async executeBranch(instance, def, stepDef) {
        const stepExec = {
            id: newId('step'),
            instanceId: instance.id,
            stepId: stepDef.id,
            state: 'active',
            activatedAt: new Date().toISOString(),
            escalationCount: 0,
        };
        await this.repo.saveStepExecution(stepExec);
        // Find first matching branch
        let nextId = null;
        for (const branch of stepDef.branches) {
            if (evaluateCondition(branch.condition, instance.context)) {
                nextId = branch.to;
                break;
            }
        }
        // Fallback to first transition if no branch matched
        if (!nextId)
            nextId = stepDef.transitions[0]?.to ?? null;
        const done = { ...stepExec, state: 'done', decidedAt: new Date().toISOString() };
        const event = makeEvent('StepCompleted', instance, { stepId: stepDef.id, branch: nextId });
        await this.repo.commitTransition(instance, done, event);
        if (nextId) {
            const next = getStep(def, nextId);
            const refreshed = (await this.repo.getInstance(instance.id));
            await this.activateStep(refreshed, def, next);
        }
    }
    async executeParallel(instance, def, stepDef) {
        // Activate all branch steps simultaneously
        for (const branchStepId of stepDef.branches) {
            const branchStep = getStep(def, branchStepId);
            const refreshed = (await this.repo.getInstance(instance.id));
            await this.activateStep(refreshed, def, branchStep);
        }
    }
    async activateWait(instance, _def, stepDef) {
        const slaDueAt = stepDef.until
            ? (resolvePath(stepDef.until, instance.context) ?? stepDef.until)
            : undefined;
        const stepExec = {
            id: newId('step'),
            instanceId: instance.id,
            stepId: stepDef.id,
            state: 'active',
            slaDueAt,
            activatedAt: new Date().toISOString(),
            escalationCount: 0,
        };
        const updated = {
            ...instance,
            currentStepIds: [...instance.currentStepIds, stepDef.id],
            updatedAt: new Date().toISOString(),
        };
        const event = makeEvent('StepActivated', instance, {
            stepId: stepDef.id,
            waitUntil: slaDueAt,
            signal: stepDef.signal,
        });
        await this.repo.commitTransition(updated, stepExec, event);
    }
    /* ── Process a decision ────────────────────────────────────── */
    async processDecision(instanceId, stepId, decision, actorId, note) {
        const instance = await this.repo.getInstance(instanceId);
        if (!instance)
            throw new EngineError('NOT_FOUND', `Workflow instance "${instanceId}" not found`);
        if (instance.status !== 'active') {
            throw new EngineError('INVALID_STATE', `Instance "${instanceId}" is not active (status: ${instance.status})`);
        }
        if (!instance.currentStepIds.includes(stepId)) {
            throw new EngineError('INVALID_STEP', `Step "${stepId}" is not currently active on instance "${instanceId}"`);
        }
        const def = await this.repo.getDefinition(instance.workflowId, instance.definitionVersion);
        if (!def)
            throw new EngineError('DEFINITION_NOT_FOUND', `Definition not found for "${instance.workflowId}" v${instance.definitionVersion}`);
        const stepDef = getStep(def, stepId);
        if (stepDef.type !== 'approval') {
            throw new EngineError('INVALID_STEP_TYPE', `Step "${stepId}" is not an approval step`);
        }
        // Find the active StepExecution
        const executions = await this.repo.getStepExecutions(instanceId);
        const stepExec = executions.find((e) => e.stepId === stepId && e.state === 'active');
        if (!stepExec)
            throw new EngineError('STEP_NOT_ACTIVE', `No active execution found for step "${stepId}"`);
        // Validate actor — only the assigned actor (or delegate) may decide
        if (stepExec.actorId && stepExec.actorId !== actorId) {
            throw new EngineError('FORBIDDEN', `Actor "${actorId}" is not authorised to decide step "${stepId}"`);
        }
        const now = new Date().toISOString();
        const completedExec = {
            ...stepExec,
            state: 'done',
            decision,
            note,
            decidedAt: now,
        };
        const nextId = nextStepId(stepDef, decision);
        const updatedInstance = {
            ...instance,
            currentStepIds: instance.currentStepIds.filter((id) => id !== stepId),
            updatedAt: now,
        };
        const event = makeEvent('StepCompleted', instance, {
            stepId,
            decision,
            actorId,
            note,
        });
        await this.repo.commitTransition(updatedInstance, completedExec, event);
        // Advance to next step
        if (nextId) {
            const next = getStep(def, nextId);
            const refreshed = (await this.repo.getInstance(instanceId));
            await this.activateStep(refreshed, def, next);
        }
        return (await this.repo.getInstance(instanceId));
    }
    /* ── Escalate an SLA-breached step ─────────────────────────── */
    async escalateStep(instanceId, stepId) {
        const instance = await this.repo.getInstance(instanceId);
        if (!instance || instance.status !== 'active')
            return;
        const def = await this.repo.getDefinition(instance.workflowId, instance.definitionVersion);
        if (!def)
            return;
        const stepDef = getStep(def, stepId);
        if (stepDef.type !== 'approval')
            return;
        const executions = await this.repo.getStepExecutions(instanceId);
        const stepExec = executions.find((e) => e.stepId === stepId && e.state === 'active');
        if (!stepExec)
            return;
        const maxEscalations = stepDef.maxEscalations ?? 3;
        if (stepExec.escalationCount >= maxEscalations) {
            // Cap reached — fail the step
            const failed = { ...stepExec, state: 'failed' };
            const event = makeEvent('StepFailed', instance, { stepId, reason: 'escalation_cap_reached' });
            await this.repo.commitTransition(instance, failed, event);
            return;
        }
        if (stepDef.onTimeout === 'auto-approve') {
            await this.processDecision(instanceId, stepId, 'approved', 'system', 'Auto-approved on SLA breach');
            return;
        }
        if (stepDef.escalateTo) {
            const newActor = await resolveActor(stepDef.escalateTo, instance.context, this.actorStore);
            const cal = await this.calendarFor(instance.context.entityId);
            const slaDueAt = stepDef.sla
                ? computeSlaDueAt(new Date(), stepDef.sla.duration, stepDef.sla.businessHours, cal)
                : undefined;
            const escalated = {
                ...stepExec,
                state: 'escalated',
                actorId: newActor,
                slaDueAt,
                escalationCount: stepExec.escalationCount + 1,
            };
            const event = makeEvent('StepEscalated', instance, { stepId, fromActor: stepExec.actorId, toActor: newActor });
            await this.repo.commitTransition(instance, escalated, event);
        }
    }
    /* ── Cancel an instance ─────────────────────────────────────── */
    async cancelInstance(instanceId, reason) {
        const instance = await this.repo.getInstance(instanceId);
        if (!instance)
            throw new EngineError('NOT_FOUND', `Workflow instance "${instanceId}" not found`);
        if (instance.status !== 'active') {
            throw new EngineError('INVALID_STATE', `Cannot cancel instance in status "${instance.status}"`);
        }
        const now = new Date().toISOString();
        const cancelled = {
            ...instance,
            status: 'cancelled',
            updatedAt: now,
            completedAt: now,
        };
        // Mark all active steps as failed
        const executions = await this.repo.getStepExecutions(instanceId);
        for (const exec of executions.filter((e) => e.state === 'active')) {
            const failed = { ...exec, state: 'failed', decidedAt: now };
            const event = makeEvent('WorkflowCancelled', instance, { stepId: exec.stepId, reason });
            await this.repo.commitTransition(cancelled, failed, event);
        }
        // If no active steps, just save the cancelled instance
        if (!executions.some((e) => e.state === 'active')) {
            await this.repo.saveInstance(cancelled);
        }
        return cancelled;
    }
    /* ── Private helpers ────────────────────────────────────────── */
    async completeInstance(instance, result) {
        const now = new Date().toISOString();
        const completed = {
            ...instance,
            status: 'completed',
            result,
            currentStepIds: [],
            updatedAt: now,
            completedAt: now,
        };
        await this.repo.saveInstance(completed);
        const event = makeEvent('WorkflowCompleted', instance, { result, workflowId: instance.workflowId });
        // Use a dummy step for the event commit (no active step at terminal)
        const dummyStep = {
            id: newId('step'),
            instanceId: instance.id,
            stepId: '__terminal__',
            state: 'done',
            escalationCount: 0,
        };
        await this.repo.commitTransition(completed, dummyStep, event);
    }
    async runAction(action, params, instance) {
        switch (action) {
            case 'PublishEvent':
                // In production: publish to Kafka/NATS
                console.log('[engine:action]', action, params.event, instance.id);
                break;
            case 'SendNotification':
                console.log('[engine:action]', action, params, instance.id);
                break;
            default:
                console.warn('[engine:action] Unknown action:', action);
        }
    }
}
