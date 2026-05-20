let _id = 0;
export const newId = (prefix) => `${prefix}_${(++_id).toString(16).padStart(6, '0')}`;
export function newEvent(type, entityId, correlationId, aggregateId, payload) {
    return {
        eventId: newId('evt'),
        eventType: type,
        entityId,
        correlationId,
        occurredAt: new Date().toISOString(),
        aggregateType: 'enrollment',
        aggregateId,
        payload,
    };
}
