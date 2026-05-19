/**
 * Workflow definition types. Definitions are versioned JSON stored in the DB
 * and edited via the visual builder — no deploy needed (workflow-engine.md §2).
 */

// ---------------------------------------------------------------------------
// Working calendar — shared with leave domain's working-day math
// ---------------------------------------------------------------------------

export interface WorkingCalendar {
  /** 0=Sun … 6=Sat. KSA default: [0,1,2,3,4] */
  workWeek: number[];
  /** ISO date strings 'YYYY-MM-DD' that are holidays for this entity */
  holidays: Set<string>;
}

// ---------------------------------------------------------------------------
// Actor resolution strategies (workflow-engine.md §4)
// ---------------------------------------------------------------------------

export type ActorStrategy =
  | { strategy: 'reports_to'; of: string }        // e.g. "$.requester"
  | { strategy: 'role'; role: string; scope: string }
  | { strategy: 'named'; employeeId: string }
  | { strategy: 'dynamic'; contextPath: string };

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

export interface ApprovalStep {
  id: string;
  type: 'approval';
  actor: ActorStrategy;
  sla?: { duration: string; businessHours: boolean };
  onTimeout?: 'escalate' | 'auto-approve' | 'notify-only';
  escalateTo?: ActorStrategy;
  condition?: string;
  onSkip?: string;
  transitions: Array<{ on: string; to: string }>;
}

export interface AutomatedStep {
  id: string;
  type: 'automated';
  action: string;
  params?: Record<string, unknown>;
  transitions: Array<{ on: string; to: string }>;
}

export interface WaitStep {
  id: string;
  type: 'wait';
  until: string;
  transitions: Array<{ on: string; to: string }>;
}

export interface BranchStep {
  id: string;
  type: 'branch';
  condition: string;
  transitions: Array<{ on: string; to: string }>;
}

export interface ParallelStep {
  id: string;
  type: 'parallel';
  branches: string[];
  joinOn: 'all' | 'any';
  transitions: Array<{ on: string; to: string }>;
}

export interface TerminalStep {
  id: string;
  type: 'terminal';
  result: string;
}

export type StepDefinition =
  | ApprovalStep
  | AutomatedStep
  | WaitStep
  | BranchStep
  | ParallelStep
  | TerminalStep;

// ---------------------------------------------------------------------------
// Workflow definition — versioned, stored, HR-editable
// ---------------------------------------------------------------------------

export interface WorkflowDefinition {
  workflowId: string;
  version: number;
  trigger: string;
  steps: StepDefinition[];
  deletedAt?: string;
}

// ---------------------------------------------------------------------------
// Instance — runtime execution of one definition version
// ---------------------------------------------------------------------------

export type StepState =
  | 'pending'
  | 'active'
  | 'done'
  | 'skipped'
  | 'failed'
  | 'escalated';

export interface StepExecution {
  stepId: string;
  state: StepState;
  actorEmployeeId: string | null;
  decision: string | null;
  note: string | null;
  slaDueAt: string | null;
  activatedAt: string | null;
  decidedAt: string | null;
}

export type InstanceStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export interface WorkflowInstance {
  id: string;
  workflowId: string;
  version: number;        // pinned at creation (workflow-engine.md §3)
  trigger: string;
  context: Record<string, unknown>;
  status: InstanceStatus;
  currentStepId: string | null;
  steps: StepExecution[];
  entityId: string;
  correlationId: string;
  startedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Port interfaces — infra-free engine core
// ---------------------------------------------------------------------------

export interface DefinitionRepo {
  findByTrigger(trigger: string): Promise<WorkflowDefinition | null>;
  findById(workflowId: string, version?: number): Promise<WorkflowDefinition | null>;
  save(def: WorkflowDefinition): Promise<void>;
}

export interface InstanceRepo {
  save(instance: WorkflowInstance): Promise<void>;
  findById(id: string): Promise<WorkflowInstance | null>;
  findByIdOrThrow(id: string): Promise<WorkflowInstance>;
}

export interface ActorResolver {
  resolve(
    strategy: ActorStrategy,
    context: Record<string, unknown>,
  ): Promise<string | null>;
}

export interface SlaCalculator {
  /** Returns ISO 8601 due-at timestamp for the given ISO 8601 duration. */
  dueAt(
    from: string,
    isoDuration: string,
    businessHours: boolean,
    entityId: string,
  ): Promise<string>;
}

export interface EventPublisher {
  publish(event: Record<string, unknown>): Promise<void>;
}

export interface WorkflowEngineDeps {
  definitions: DefinitionRepo;
  instances: InstanceRepo;
  actors: ActorResolver;
  sla: SlaCalculator;
  events: EventPublisher;
}
