/**
 * Base envelope every domain event must include (event-schemas.md).
 * correlationId threads one user action across all services for tracing.
 */
export interface EventEnvelope {
  eventId: string;
  eventType: string;
  occurredAt: string;   // ISO 8601 with offset
  entityId: string;
  correlationId: string;
  aggregateType: string;
  aggregateId: string;
}
