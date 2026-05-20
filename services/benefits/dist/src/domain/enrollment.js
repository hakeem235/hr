import { BenefitError } from './errors.js';
import { newId, newEvent } from './events.js';
const CANCELLABLE = ['pending', 'active', 'suspended'];
export async function createEnrollment(input, repo, correlationId) {
    const existing = await repo.findEnrollmentByIdempotencyKey(input.idempotencyKey);
    if (existing)
        return existing;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
        throw new BenefitError('VALIDATION', 'effectiveFrom must be YYYY-MM-DD', 'effectiveFrom');
    }
    const plan = await repo.findPlanById(input.planId);
    if (!plan)
        throw new BenefitError('NOT_FOUND', `Benefit plan ${input.planId} not found`, 'planId');
    if (!plan.isActive)
        throw new BenefitError('INELIGIBLE', `Benefit plan ${input.planId} is not active`);
    // Prevent duplicate active enrollment in same plan
    const active = await repo.findActiveEnrollment(input.employeeId, input.planId);
    if (active) {
        throw new BenefitError('ALREADY_ENROLLED', `Employee already has an active enrollment in plan ${input.planId}`, 'planId', {
            existingEnrollmentId: active.id,
        });
    }
    const now = new Date().toISOString();
    const rec = {
        id: newId('enr'),
        entityId: input.entityId,
        employeeId: input.employeeId,
        planId: input.planId,
        status: 'pending',
        effectiveFrom: input.effectiveFrom,
        dependents: [],
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        updatedAt: now,
        version: 1,
    };
    await repo.saveWithEvent(rec, newEvent('EmployeeEnrolled', input.entityId, correlationId, rec.id, {
        enrollmentId: rec.id,
        employeeId: rec.employeeId,
        planId: rec.planId,
        category: plan.category,
        cchiProviderCode: plan.cchiProviderCode,
        effectiveFrom: rec.effectiveFrom,
    }));
    return rec;
}
export async function activateEnrollment(id, expectedVersion, repo, correlationId) {
    const rec = await repo.findEnrollmentById(id);
    if (!rec)
        throw new BenefitError('NOT_FOUND', `Enrollment ${id} not found`);
    if (rec.status !== 'pending')
        throw new BenefitError('INVALID_STATE', `Cannot activate from status '${rec.status}'`);
    if (rec.version !== expectedVersion)
        throw new BenefitError('CONFLICT', 'Version mismatch', undefined, { expected: expectedVersion, current: rec.version });
    return repo.updateStatus(id, 'active', undefined, expectedVersion, newEvent('EnrollmentActivated', rec.entityId, correlationId, id, {
        enrollmentId: id, employeeId: rec.employeeId, planId: rec.planId,
    }));
}
export async function cancelEnrollment(id, effectiveTo, expectedVersion, repo, correlationId) {
    const rec = await repo.findEnrollmentById(id);
    if (!rec)
        throw new BenefitError('NOT_FOUND', `Enrollment ${id} not found`);
    if (!CANCELLABLE.includes(rec.status)) {
        throw new BenefitError('INVALID_STATE', `Cannot cancel enrollment with status '${rec.status}'`, 'status', {
            current: rec.status,
            cancellable: CANCELLABLE,
        });
    }
    if (rec.version !== expectedVersion)
        throw new BenefitError('CONFLICT', 'Version mismatch', undefined, { expected: expectedVersion, current: rec.version });
    return repo.updateStatus(id, 'terminated', effectiveTo, expectedVersion, newEvent('EnrollmentCancelled', rec.entityId, correlationId, id, {
        enrollmentId: id,
        employeeId: rec.employeeId,
        planId: rec.planId,
        effectiveTo,
    }));
}
export async function addDependent(enrollmentId, input, repo) {
    const rec = await repo.findEnrollmentById(enrollmentId);
    if (!rec)
        throw new BenefitError('NOT_FOUND', `Enrollment ${enrollmentId} not found`);
    if (rec.status !== 'active' && rec.status !== 'pending') {
        throw new BenefitError('INVALID_STATE', `Cannot add dependents to an enrollment with status '${rec.status}'`);
    }
    const plan = await repo.findPlanById(rec.planId);
    if (!plan?.allowsDependents)
        throw new BenefitError('INELIGIBLE', 'This benefit plan does not allow dependents');
    if (plan.maxDependents > 0 && rec.dependents.length >= plan.maxDependents) {
        throw new BenefitError('INELIGIBLE', `Plan allows max ${plan.maxDependents} dependents`, 'dependents', {
            current: rec.dependents.length, max: plan.maxDependents,
        });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
        throw new BenefitError('VALIDATION', 'dateOfBirth must be YYYY-MM-DD', 'dateOfBirth');
    }
    const dependent = {
        id: newId('dep'),
        enrollmentId,
        ...input,
        addedAt: new Date().toISOString(),
    };
    return repo.addDependent(enrollmentId, dependent);
}
export async function removeDependent(enrollmentId, dependentId, repo) {
    const rec = await repo.findEnrollmentById(enrollmentId);
    if (!rec)
        throw new BenefitError('NOT_FOUND', `Enrollment ${enrollmentId} not found`);
    const exists = rec.dependents.some((d) => d.id === dependentId);
    if (!exists)
        throw new BenefitError('NOT_FOUND', `Dependent ${dependentId} not found in enrollment ${enrollmentId}`);
    return repo.removeDependent(enrollmentId, dependentId);
}
