import { PeopleError } from './errors.js';
import { newId } from './events.js';
export async function createCompensation(input, repo) {
    const existing = await repo.findCompensationByIdempotencyKey(input.idempotencyKey);
    if (existing)
        return existing;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
        throw new PeopleError('VALIDATION', 'effectiveFrom must be YYYY-MM-DD', 'effectiveFrom');
    }
    if (input.basicMinor < 0) {
        throw new PeopleError('VALIDATION', 'basicMinor must be non-negative', 'basicMinor');
    }
    // Close any currently-open compensation record
    const current = await repo.getCurrentCompensation(input.employeeId);
    if (current && !current.effectiveTo) {
        const closed = { ...current, effectiveTo: input.effectiveFrom };
        await repo.saveCompensation(closed);
    }
    const rec = {
        id: newId('cmp'),
        employeeId: input.employeeId,
        basicMinor: input.basicMinor,
        housingMinor: input.housingMinor ?? 0,
        transportMinor: input.transportMinor ?? 0,
        otherMinor: input.otherMinor ?? 0,
        currency: input.currency ?? 'SAR',
        effectiveFrom: input.effectiveFrom,
        effectiveTo: undefined,
        idempotencyKey: input.idempotencyKey,
        createdAt: new Date().toISOString(),
    };
    await repo.saveCompensation(rec);
    return rec;
}
export async function getCurrentCompensation(employeeId, asOf, repo) {
    return repo.getCurrentCompensation(employeeId, asOf);
}
export async function listCompensation(employeeId, repo) {
    return repo.listCompensation(employeeId);
}
