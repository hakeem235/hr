/**
 * Workflow Sagas — domain types.
 *
 * Models the same concepts as Temporal:
 *   - Workflow   : orchestrates activities; deterministic; state is event-sourced
 *   - Activity   : a side-effectful operation; retried independently
 *   - Compensation: the "undo" of an activity; run in reverse order on failure
 *
 * Migration path to real Temporal: replace SagaRunner with a Temporal Worker,
 * each ActivityDef becomes a Temporal @activity function, each saga becomes a
 * Temporal @workflow function. The SagaInstance maps to Temporal workflow history.
 */

// ── Saga names ─────────────────────────────────────────────────────────────────

export type SagaName = 'onboarding' | 'offboarding';

// ── Status machine ─────────────────────────────────────────────────────────────

export type SagaStatus =
  | 'running'        // executing activities
  | 'completed'      // all activities succeeded
  | 'compensating'   // a failure was detected; running compensations in reverse
  | 'compensated'    // compensation finished; saga rolled back
  | 'failed';        // compensation itself failed (manual intervention needed)

export type ActivityState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated'
  | 'skipped';        // activity was not reached before a failure

// ── Activity execution record ──────────────────────────────────────────────────

export interface ActivityExecution {
  name: string;
  state: ActivityState;
  attempt: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  compensatedAt?: string;
}

// ── Saga instance ──────────────────────────────────────────────────────────────

export interface SagaInstance {
  id: string;
  sagaName: SagaName;
  entityId: string;
  employeeId: string;
  correlationId: string;
  idempotencyKey: string;
  status: SagaStatus;
  /** Shared context passed to every activity; enriched as activities complete */
  context: Record<string, unknown>;
  activities: ActivityExecution[];
  currentActivityIndex: number;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

// ── Activity definition ────────────────────────────────────────────────────────

export interface ActivityContext {
  /** Base URLs for each downstream service */
  services: {
    people:       string;
    integrations: string;
    benefits:     string;
    notifications: string;
    payroll:      string;
  };
  correlationId: string;
}

export interface ActivityDef {
  name: string;
  /** Execute the activity. Return value is merged into saga context. */
  execute(
    saga: SagaInstance,
    ctx: ActivityContext,
  ): Promise<Record<string, unknown>>;
  /** Undo the activity. Called during compensation (reverse order). */
  compensate?(
    saga: SagaInstance,
    activityOutput: Record<string, unknown>,
    ctx: ActivityContext,
  ): Promise<void>;
  maxRetries: number;
  /** Label shown in status API */
  description: string;
}

// ── Saga definition ────────────────────────────────────────────────────────────

export interface SagaDef {
  name: SagaName;
  description: string;
  activities: ActivityDef[];
}

// ── Repository ─────────────────────────────────────────────────────────────────

export interface SagaRepo {
  findByIdempotencyKey(key: string): Promise<SagaInstance | null>;
  save(saga: SagaInstance): Promise<SagaInstance>;
  update(saga: SagaInstance): Promise<SagaInstance>;
  findById(id: string): Promise<SagaInstance | null>;
  list(filter: SagaFilter): Promise<{ items: SagaInstance[]; nextCursor: string | null }>;
}

export interface SagaFilter {
  sagaName?: SagaName;
  employeeId?: string;
  entityId?: string;
  status?: SagaStatus;
  cursor?: string;
  limit?: number;
}

// ── Domain events ──────────────────────────────────────────────────────────────

export interface DomainEvent {
  eventId: string;
  eventType: string;
  entityId: string;
  correlationId: string;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}
