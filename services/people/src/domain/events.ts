/**
 * Shared event helpers — newId and newEvent factory.
 * Mirror of leave service pattern.
 */
import type { DomainEvent } from './types.js';

let _id = 0;
export const newId = (prefix: string): string =>
  `${prefix}_${(++_id).toString(16).padStart(6, '0')}`;

export function newEvent(
  type: string,
  entityId: string,
  correlationId: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): DomainEvent {
  return {
    eventId: newId('evt'),
    eventType: type,
    entityId,
    correlationId,
    occurredAt: new Date().toISOString(),
    aggregateType,
    aggregateId,
    payload,
  };
}
