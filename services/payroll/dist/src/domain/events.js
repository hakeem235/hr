let _seq = 0;
export const newId = (prefix) => `${prefix}_${(++_seq).toString(16).padStart(6, '0')}`;
export function newEvent(type, entityId, correlationId, aggregateId, payload) {
    return {
        eventId: newId('evt'),
        eventType: type,
        entityId,
        correlationId,
        occurredAt: new Date().toISOString(),
        aggregateType: 'payroll_run',
        aggregateId,
        payload,
    };
}
