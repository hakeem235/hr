/**
 * HR Letter request domain.
 * Mirrors leave/create-request.ts conventions exactly (CLAUDE.md §12).
 * The module owns its data; it delegates approval to the workflow engine.
 */
import { LetterError } from './errors.js';
// ─── Helpers ──────────────────────────────────────────────────────────────────
let _id = 0;
export const newId = (prefix) => `${prefix}_${(++_id).toString(16).padStart(6, '0')}`;
export function newEvent(type, entityId, correlationId, aggregateId, payload) {
    return {
        eventId: newId('evt'),
        eventType: type,
        entityId,
        correlationId,
        occurredAt: new Date().toISOString(),
        aggregateType: 'letter_request',
        aggregateId,
        payload,
    };
}
// ─── Create ───────────────────────────────────────────────────────────────────
export async function createLetterRequest(input, repo, wf, correlationId) {
    const existing = await repo.findByIdempotencyKey(input.employeeId, input.idempotencyKey);
    if (existing)
        return existing;
    if (!input.purpose.trim()) {
        throw new LetterError('POLICY_VIOLATION', 'purpose is required', 'purpose');
    }
    const wfInstanceId = await wf.start('LetterRequested', {
        requester: input.employeeId,
        entityId: input.entityId,
        request: { ...input },
    }).catch((err) => {
        throw new LetterError('WORKFLOW_UNAVAILABLE', `Could not start approval workflow: ${err instanceof Error ? err.message : String(err)}`);
    });
    const now = new Date().toISOString();
    const rec = {
        id: newId('ltr'),
        entityId: input.entityId,
        employeeId: input.employeeId,
        letterTypeId: input.letterTypeId,
        purpose: input.purpose.trim(),
        recipientName: input.recipientName?.trim(),
        language: input.language,
        status: 'pending_approval',
        workflowInstanceId: wfInstanceId,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        updatedAt: now,
        version: 1,
    };
    await repo.saveWithEvent(rec, newEvent('LetterRequested', input.entityId, correlationId, rec.id, {
        requestId: rec.id,
        employeeId: rec.employeeId,
        letterTypeId: rec.letterTypeId,
        purpose: rec.purpose,
        language: rec.language,
    }));
    return rec;
}
// ─── Cancel ───────────────────────────────────────────────────────────────────
const CANCELLABLE = ['pending_approval', 'approved'];
export async function cancelLetterRequest(id, requesterId, expectedVersion, repo, correlationId) {
    const rec = await repo.findById(id);
    if (!rec)
        throw new LetterError('NOT_FOUND', `Letter request ${id} not found`);
    if (rec.employeeId !== requesterId)
        throw new LetterError('FORBIDDEN', 'Only the requester may cancel');
    if (!CANCELLABLE.includes(rec.status)) {
        throw new LetterError('INVALID_STATE', `Cannot cancel a request with status '${rec.status}'`, 'status', {
            current: rec.status,
            cancellable: CANCELLABLE,
        });
    }
    if (rec.version !== expectedVersion) {
        throw new LetterError('CONFLICT', 'Version mismatch', undefined, {
            expected: expectedVersion,
            current: rec.version,
        });
    }
    return repo.updateStatus(id, 'cancelled', expectedVersion, newEvent('LetterCancelled', rec.entityId, correlationId, id, {
        requestId: id,
        employeeId: rec.employeeId,
        letterTypeId: rec.letterTypeId,
    }));
}
// ─── Mark issued (called when workflow emits LetterIssued) ────────────────────
export async function markLetterIssued(id, documentId, expectedVersion, repo, correlationId) {
    const rec = await repo.findById(id);
    if (!rec)
        throw new LetterError('NOT_FOUND', `Letter request ${id} not found`);
    if (rec.status !== 'approved' && rec.status !== 'generating') {
        throw new LetterError('INVALID_STATE', `Cannot issue a letter with status '${rec.status}'`);
    }
    if (rec.version !== expectedVersion) {
        throw new LetterError('CONFLICT', 'Version mismatch', undefined, {
            expected: expectedVersion, current: rec.version,
        });
    }
    return repo.updateStatus(id, 'issued', expectedVersion, newEvent('LetterIssued', rec.entityId, correlationId, id, {
        requestId: id,
        employeeId: rec.employeeId,
        documentId,
    }), { documentId });
}
