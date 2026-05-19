import { PeopleError } from './errors.js';
import { newId } from './events.js';
export async function createPosition(input, repo) {
    const existing = await repo.findPositionByIdempotencyKey(input.idempotencyKey);
    if (existing)
        return existing;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
        throw new PeopleError('VALIDATION', 'effectiveFrom must be YYYY-MM-DD', 'effectiveFrom');
    }
    // Close any currently-open position for this employee
    const current = await repo.getCurrentPosition(input.employeeId);
    if (current && !current.effectiveTo) {
        // Close the previous position one day before the new one starts
        const closed = { ...current, effectiveTo: input.effectiveFrom };
        await repo.savePosition(closed);
    }
    const rec = {
        id: newId('pos'),
        employeeId: input.employeeId,
        title: input.title,
        grade: input.grade,
        departmentId: input.departmentId,
        reportsTo: input.reportsTo,
        workflowRole: input.workflowRole,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: undefined,
        idempotencyKey: input.idempotencyKey,
        createdAt: new Date().toISOString(),
    };
    await repo.savePosition(rec);
    return rec;
}
export async function getCurrentPosition(employeeId, asOf, repo) {
    return repo.getCurrentPosition(employeeId, asOf);
}
export async function listPositions(employeeId, repo) {
    return repo.listPositions(employeeId);
}
