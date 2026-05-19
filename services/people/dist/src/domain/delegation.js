import { PeopleError } from './errors.js';
import { newId } from './events.js';
export async function createDelegation(input, repo) {
    if (input.fromEmployeeId === input.toEmployeeId) {
        throw new PeopleError('VALIDATION', 'Cannot delegate to yourself', 'toEmployeeId');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validFrom)) {
        throw new PeopleError('VALIDATION', 'validFrom must be YYYY-MM-DD', 'validFrom');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) {
        throw new PeopleError('VALIDATION', 'validUntil must be YYYY-MM-DD', 'validUntil');
    }
    if (input.validUntil < input.validFrom) {
        throw new PeopleError('INVALID_DATE_RANGE', 'validUntil must be >= validFrom', 'validUntil');
    }
    // Verify both employees exist
    const from = await repo.findEmployeeById(input.fromEmployeeId);
    if (!from)
        throw new PeopleError('NOT_FOUND', `Employee ${input.fromEmployeeId} not found`, 'fromEmployeeId');
    const to = await repo.findEmployeeById(input.toEmployeeId);
    if (!to)
        throw new PeopleError('NOT_FOUND', `Employee ${input.toEmployeeId} not found`, 'toEmployeeId');
    const rec = {
        id: newId('dlg'),
        fromEmployeeId: input.fromEmployeeId,
        toEmployeeId: input.toEmployeeId,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        createdAt: new Date().toISOString(),
    };
    await repo.saveDelegation(rec);
    return rec;
}
export async function deleteDelegation(id, repo) {
    const existing = await repo.findDelegationById(id);
    if (!existing)
        throw new PeopleError('NOT_FOUND', `Delegation ${id} not found`);
    await repo.deleteDelegation(id);
}
// ─── OrgNode projection ───────────────────────────────────────────────────────
/**
 * Build the OrgNode projection that the workflow engine's ActorStore reads.
 * Joins employee + current position to produce the flat view.
 */
export async function buildOrgNode(employeeId, repo, asOf) {
    const employee = await repo.findEmployeeById(employeeId);
    if (!employee)
        return null;
    const position = await repo.getCurrentPosition(employeeId, asOf);
    return {
        employeeId: employee.id,
        managerId: position?.reportsTo,
        role: position?.workflowRole ?? 'employee',
        entityId: employee.entityId,
        departmentId: position?.departmentId,
        isActive: employee.status === 'active',
    };
}
/**
 * Walk up from employeeId to find the nearest active manager.
 * Returns the manager's OrgNode or null if no active manager in chain.
 */
export async function findActiveManager(employeeId, repo, asOf) {
    const node = await buildOrgNode(employeeId, repo, asOf);
    if (!node?.managerId)
        return null;
    const managerNode = await buildOrgNode(node.managerId, repo, asOf);
    return managerNode;
}
/**
 * Find all active employees with the given workflowRole in an entity.
 */
export async function findByRole(role, entityId, repo, asOf) {
    const { items } = await repo.listEmployees({ entityId, limit: 1000 });
    const nodes = [];
    for (const emp of items) {
        const position = await repo.getCurrentPosition(emp.id, asOf);
        if (position?.workflowRole === role) {
            nodes.push({
                employeeId: emp.id,
                managerId: position.reportsTo,
                role: position.workflowRole,
                entityId: emp.entityId,
                departmentId: position.departmentId,
                isActive: emp.status === 'active',
            });
        }
    }
    return nodes;
}
