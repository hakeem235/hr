import type { WorkflowDefinition, WorkflowInstance, StepExecution, DomainEvent } from './types.js';
import type { WorkingCalendar } from './sla.js';
import type { ActorStore } from './actor-resolver.js';
export interface EngineRepo {
    getDefinition(workflowId: string, version?: number): Promise<WorkflowDefinition | null>;
    getLatestDefinition(workflowId: string): Promise<WorkflowDefinition | null>;
    saveDefinition(def: WorkflowDefinition): Promise<void>;
    getInstance(id: string): Promise<WorkflowInstance | null>;
    saveInstance(instance: WorkflowInstance): Promise<void>;
    getStepExecutions(instanceId: string): Promise<StepExecution[]>;
    saveStepExecution(step: StepExecution): Promise<void>;
    updateStepExecution(step: StepExecution): Promise<void>;
    /** Write instance + step + event in one transaction (outbox pattern) */
    commitTransition(instance: WorkflowInstance, step: StepExecution, event: DomainEvent): Promise<void>;
    listPendingApprovals(actorId?: string, limit?: number): Promise<Array<{
        instance: WorkflowInstance;
        step: StepExecution;
        definition: WorkflowDefinition;
    }>>;
}
export declare class WorkflowExecutor {
    private repo;
    private actorStore;
    private calendarFor;
    constructor(repo: EngineRepo, actorStore: ActorStore, calendarFor: (entityId: string) => Promise<WorkingCalendar>);
    startInstance(workflowId: string, context: Record<string, unknown>): Promise<WorkflowInstance>;
    private activateStep;
    private activateApproval;
    private executeAutomated;
    private executeBranch;
    private executeParallel;
    private activateWait;
    processDecision(instanceId: string, stepId: string, decision: 'approved' | 'declined', actorId: string, note?: string): Promise<WorkflowInstance>;
    escalateStep(instanceId: string, stepId: string): Promise<void>;
    cancelInstance(instanceId: string, reason: string): Promise<WorkflowInstance>;
    private completeInstance;
    private runAction;
}
