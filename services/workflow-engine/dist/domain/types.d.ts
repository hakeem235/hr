/**
 * Core types for the workflow engine (workflow-engine.md §2–3).
 * All step types, instance model, actor strategies, and events live here.
 */
export type StepType = 'approval' | 'automated' | 'wait' | 'branch' | 'parallel' | 'terminal';
export interface ActorSpec {
    strategy: 'reports_to' | 'role' | 'named' | 'dynamic';
    /** For reports_to/dynamic: context path, e.g. "$.requester" */
    of?: string;
    /** For role strategy */
    role?: string;
    /** For role strategy: scope path, e.g. "$.requester.entity" */
    scope?: string;
    /** For named strategy */
    employeeId?: string;
}
export interface SlaSpec {
    /** ISO 8601 duration, e.g. "PT8H", "P1D" */
    duration: string;
    businessHours: boolean;
}
export interface Transition {
    on: string;
    to: string;
}
interface BaseStep {
    id: string;
    transitions: Transition[];
    /** JSONPath condition — if false, step is skipped (goes to onSkip) */
    condition?: string;
    onSkip?: string;
}
export interface ApprovalStepDef extends BaseStep {
    type: 'approval';
    actor: ActorSpec;
    sla?: SlaSpec;
    onTimeout?: 'escalate' | 'auto-approve' | 'notify-only';
    escalateTo?: ActorSpec;
    /** Max escalation chain depth before giving up */
    maxEscalations?: number;
}
export interface AutomatedStepDef extends BaseStep {
    type: 'automated';
    action: string;
    params: Record<string, unknown>;
}
export interface WaitStepDef extends BaseStep {
    type: 'wait';
    /** ISO 8601 date or context path to a date */
    until?: string;
    /** External signal name to wait for */
    signal?: string;
}
export interface BranchStepDef extends BaseStep {
    type: 'branch';
    /** Each branch: { condition, to } — first matching wins */
    branches: Array<{
        condition: string;
        to: string;
    }>;
}
export interface ParallelStepDef extends BaseStep {
    type: 'parallel';
    branches: string[];
    joinOn: 'all' | 'any';
}
export interface TerminalStepDef {
    id: string;
    type: 'terminal';
    result: string;
    transitions: [];
}
export type StepDefinition = ApprovalStepDef | AutomatedStepDef | WaitStepDef | BranchStepDef | ParallelStepDef | TerminalStepDef;
export interface WorkflowDefinition {
    workflowId: string;
    version: number;
    /** Domain event that triggers a new instance */
    trigger: string;
    steps: StepDefinition[];
    deletedAt?: string;
}
export type InstanceStatus = 'active' | 'completed' | 'cancelled' | 'failed';
export interface WorkflowInstance {
    id: string;
    workflowId: string;
    /** Pinned at creation — finishes on this version (workflow-engine.md §3) */
    definitionVersion: number;
    status: InstanceStatus;
    /** Set when status = completed/failed */
    result?: string;
    /** Runtime context — available as $ in conditions and actor resolution */
    context: Record<string, unknown>;
    /** Currently active step ids (>1 during parallel fan-out) */
    currentStepIds: string[];
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
}
export type StepState = 'pending' | 'active' | 'done' | 'skipped' | 'failed' | 'escalated';
export interface StepExecution {
    id: string;
    instanceId: string;
    /** References StepDefinition.id within the pinned definition */
    stepId: string;
    /** Resolved actor employee id */
    actorId?: string;
    state: StepState;
    decision?: 'approved' | 'declined';
    note?: string;
    slaDueAt?: string;
    activatedAt?: string;
    decidedAt?: string;
    /** How many times this step has been escalated */
    escalationCount: number;
}
export interface DomainEvent {
    eventId: string;
    eventType: string;
    entityId: string;
    correlationId: string;
    occurredAt: string;
    aggregateType: 'workflow_instance';
    aggregateId: string;
    payload: Record<string, unknown>;
}
export declare class EngineError extends Error {
    code: string;
    details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, details?: Record<string, unknown> | undefined);
}
export {};
