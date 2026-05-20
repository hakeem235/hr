import type { DomainEvent } from './types.js';
export declare const newId: (prefix: string) => string;
export declare function newEvent(type: string, entityId: string, correlationId: string, aggregateId: string, payload: Record<string, unknown>): DomainEvent;
