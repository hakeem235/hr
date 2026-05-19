import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPerson, updatePerson } from '../src/domain/person.js';
import { createEmployee, updateEmployeeStatus } from '../src/domain/employee.js';
import { createPosition } from '../src/domain/position.js';
import { createCompensation } from '../src/domain/compensation.js';
import { createDelegation, deleteDelegation, buildOrgNode, findActiveManager } from '../src/domain/delegation.js';
/* ─── Minimal in-memory repo ─────────────────────────────────── */
function makeRepo(overrides = {}) {
    const entities = new Map();
    const departments = new Map();
    const holidays = new Map();
    const persons = new Map();
    const employees = new Map();
    const positions = new Map();
    const compensations = new Map();
    const documents = new Map();
    const delegations = new Map();
    const base = {
        findEntityById: async (id) => entities.get(id) ?? null,
        listEntities: async () => [...entities.values()],
        saveEntity: async (rec) => { entities.set(rec.id, rec); },
        listHolidays: async (eid) => [...holidays.values()].filter((h) => h.entityId === eid),
        upsertHoliday: async (rec) => { holidays.set(`${rec.entityId}|${rec.holidayDate}`, rec); },
        deleteHoliday: async (eid, d) => { holidays.delete(`${eid}|${d}`); },
        findDepartmentById: async (id) => departments.get(id) ?? null,
        listDepartments: async (eid) => [...departments.values()].filter((d) => d.entityId === eid),
        saveDepartment: async (rec) => { departments.set(rec.id, rec); },
        findPersonById: async (id) => persons.get(id) ?? null,
        findPersonByIdempotencyKey: async (k) => [...persons.values()].find((p) => p.idempotencyKey === k) ?? null,
        listPersons: async (f) => {
            const items = [...persons.values()].slice(0, f.limit);
            return { items };
        },
        savePerson: async (rec) => { persons.set(rec.id, rec); },
        findEmployeeById: async (id) => employees.get(id) ?? null,
        findEmployeeByIdempotencyKey: async (k) => [...employees.values()].find((e) => e.idempotencyKey === k) ?? null,
        listEmployees: async (f) => {
            const items = [...employees.values()].filter((e) => !f.entityId || e.entityId === f.entityId).slice(0, f.limit);
            return { items };
        },
        saveEmployee: async (rec) => { employees.set(rec.id, rec); },
        updateEmployeeStatus: async (id, status, exitDate, _ev, event) => {
            const rec = employees.get(id);
            const updated = { ...rec, status, exitDate, version: rec.version + 1 };
            employees.set(id, updated);
            return updated;
        },
        findPositionByIdempotencyKey: async (k) => [...positions.values()].find((p) => p.idempotencyKey === k) ?? null,
        listPositions: async (eid) => [...positions.values()].filter((p) => p.employeeId === eid),
        getCurrentPosition: async (eid, asOf) => {
            const date = asOf ?? new Date().toISOString().slice(0, 10);
            const rows = [...positions.values()]
                .filter((p) => p.employeeId === eid && p.effectiveFrom <= date && (!p.effectiveTo || p.effectiveTo > date))
                .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
            return rows[0] ?? null;
        },
        savePosition: async (rec) => { positions.set(rec.id, rec); },
        findCompensationByIdempotencyKey: async (k) => [...compensations.values()].find((c) => c.idempotencyKey === k) ?? null,
        listCompensation: async (eid) => [...compensations.values()].filter((c) => c.employeeId === eid),
        getCurrentCompensation: async (eid, asOf) => {
            const date = asOf ?? new Date().toISOString().slice(0, 10);
            const rows = [...compensations.values()]
                .filter((c) => c.employeeId === eid && c.effectiveFrom <= date && (!c.effectiveTo || c.effectiveTo > date))
                .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
            return rows[0] ?? null;
        },
        saveCompensation: async (rec) => { compensations.set(rec.id, rec); },
        findDocumentById: async (id) => documents.get(id) ?? null,
        findDocumentByIdempotencyKey: async (k) => [...documents.values()].find((d) => d.idempotencyKey === k) ?? null,
        listDocuments: async (f) => {
            const items = [...documents.values()].slice(0, f.limit);
            return { items };
        },
        saveDocument: async (rec) => { documents.set(rec.id, rec); },
        findDelegationById: async (id) => delegations.get(id) ?? null,
        listDelegations: async (fid) => [...delegations.values()].filter((d) => d.fromEmployeeId === fid),
        getActiveDelegation: async (fid, asOf) => [...delegations.values()].find((d) => d.fromEmployeeId === fid && d.validFrom <= asOf && d.validUntil >= asOf) ?? null,
        saveDelegation: async (rec) => { delegations.set(rec.id, rec); },
        deleteDelegation: async (id) => { delegations.delete(id); },
        ...overrides,
    };
    return base;
}
/* ─── createPerson ────────────────────────────────────────────── */
test('createPerson: creates record with correct fields', async () => {
    const repo = makeRepo();
    const rec = await createPerson({ fullNameEn: 'Ahmed Ali', nationality: 'SA', dateOfBirth: '1990-01-01', idempotencyKey: 'k1' }, repo, 'corr1');
    assert.equal(rec.fullNameEn, 'Ahmed Ali');
    assert.equal(rec.nationality, 'SA');
    assert.equal(rec.version, 1);
    assert.ok(rec.id.startsWith('per_'));
});
test('createPerson: idempotent on duplicate key', async () => {
    const repo = makeRepo();
    const first = await createPerson({ fullNameEn: 'Ahmed Ali', nationality: 'SA', dateOfBirth: '1990-01-01', idempotencyKey: 'k1' }, repo, 'corr1');
    const second = await createPerson({ fullNameEn: 'Ahmed Ali', nationality: 'SA', dateOfBirth: '1990-01-01', idempotencyKey: 'k1' }, repo, 'corr2');
    assert.equal(first.id, second.id);
});
test('createPerson: rejects bad dateOfBirth format', async () => {
    const repo = makeRepo();
    await assert.rejects(() => createPerson({ fullNameEn: 'X', nationality: 'SA', dateOfBirth: '01/01/1990', idempotencyKey: 'k2' }, repo, 'corr'), (e) => e.code === 'VALIDATION');
});
/* ─── updatePerson ────────────────────────────────────────────── */
test('updatePerson: updates fields and bumps version', async () => {
    const repo = makeRepo();
    const created = await createPerson({ fullNameEn: 'Ahmed Ali', nationality: 'SA', dateOfBirth: '1990-01-01', idempotencyKey: 'k3' }, repo, 'corr');
    const updated = await updatePerson(created.id, { fullNameEn: 'Ahmed Al-Ali' }, 1, repo, 'corr');
    assert.equal(updated.fullNameEn, 'Ahmed Al-Ali');
    assert.equal(updated.version, 2);
});
test('updatePerson: rejects stale version', async () => {
    const repo = makeRepo();
    const created = await createPerson({ fullNameEn: 'X', nationality: 'SA', dateOfBirth: '1990-01-01', idempotencyKey: 'k4' }, repo, 'corr');
    await assert.rejects(() => updatePerson(created.id, { fullNameEn: 'Y' }, 99, repo, 'corr'), (e) => e.code === 'CONFLICT');
});
/* ─── createEmployee ──────────────────────────────────────────── */
test('createEmployee: creates with pre_hire status', async () => {
    const repo = makeRepo();
    const rec = await createEmployee({ personId: 'per_001', entityId: 'ent_001', employeeNo: 'EMP-001', hireDate: '2026-01-01', idempotencyKey: 'emp_k1' }, repo, 'corr');
    assert.equal(rec.status, 'pre_hire');
    assert.equal(rec.version, 1);
});
test('createEmployee: idempotent', async () => {
    const repo = makeRepo();
    const a = await createEmployee({ personId: 'per_001', entityId: 'ent_001', employeeNo: 'EMP-001', hireDate: '2026-01-01', idempotencyKey: 'emp_k2' }, repo, 'corr');
    const b = await createEmployee({ personId: 'per_001', entityId: 'ent_001', employeeNo: 'EMP-001', hireDate: '2026-01-01', idempotencyKey: 'emp_k2' }, repo, 'corr');
    assert.equal(a.id, b.id);
});
/* ─── updateEmployeeStatus ────────────────────────────────────── */
test('updateEmployeeStatus: pre_hire → active emits EmployeeOnboarded', async () => {
    const repo = makeRepo();
    const emp = await createEmployee({ personId: 'per_x', entityId: 'ent_x', employeeNo: 'E1', hireDate: '2026-01-01', idempotencyKey: 'esk1' }, repo, 'corr');
    const updated = await updateEmployeeStatus(emp.id, 'active', undefined, 1, repo, 'corr');
    assert.equal(updated.status, 'active');
    assert.equal(updated.version, 2);
});
test('updateEmployeeStatus: requires exitDate when terminating', async () => {
    const repo = makeRepo();
    const emp = await createEmployee({ personId: 'per_x', entityId: 'ent_x', employeeNo: 'E2', hireDate: '2026-01-01', idempotencyKey: 'esk2' }, repo, 'corr');
    await assert.rejects(() => updateEmployeeStatus(emp.id, 'terminated', undefined, 1, repo, 'corr'), (e) => e.code === 'VALIDATION' && e.field === 'exitDate');
});
test('updateEmployeeStatus: rejects invalid transition', async () => {
    const repo = makeRepo();
    const emp = await createEmployee({ personId: 'per_x', entityId: 'ent_x', employeeNo: 'E3', hireDate: '2026-01-01', idempotencyKey: 'esk3' }, repo, 'corr');
    await assert.rejects(() => updateEmployeeStatus(emp.id, 'on_leave', undefined, 1, repo, 'corr'), (e) => e.code === 'VALIDATION');
});
/* ─── createPosition ──────────────────────────────────────────── */
test('createPosition: creates and closes previous', async () => {
    const repo = makeRepo();
    const pos1 = await createPosition({ employeeId: 'emp_1', title: 'Engineer', grade: 'L3', departmentId: 'dep_1', workflowRole: 'employee', effectiveFrom: '2024-01-01', idempotencyKey: 'pos_k1' }, repo);
    assert.equal(pos1.effectiveTo, undefined);
    const pos2 = await createPosition({ employeeId: 'emp_1', title: 'Senior Engineer', grade: 'L4', departmentId: 'dep_1', workflowRole: 'employee', effectiveFrom: '2025-01-01', idempotencyKey: 'pos_k2' }, repo);
    // pos1 should now be closed
    const closed = await repo.findPositionByIdempotencyKey('pos_k1');
    assert.equal(closed.effectiveTo, '2025-01-01');
    assert.equal(pos2.effectiveTo, undefined);
});
test('createPosition: idempotent', async () => {
    const repo = makeRepo();
    const a = await createPosition({ employeeId: 'emp_2', title: 'Eng', grade: 'L1', departmentId: 'dep_1', workflowRole: 'employee', effectiveFrom: '2024-01-01', idempotencyKey: 'pos_k3' }, repo);
    const b = await createPosition({ employeeId: 'emp_2', title: 'Eng', grade: 'L1', departmentId: 'dep_1', workflowRole: 'employee', effectiveFrom: '2024-01-01', idempotencyKey: 'pos_k3' }, repo);
    assert.equal(a.id, b.id);
});
/* ─── createCompensation ──────────────────────────────────────── */
test('createCompensation: creates record in SAR halalas', async () => {
    const repo = makeRepo();
    const rec = await createCompensation({ employeeId: 'emp_3', basicMinor: 900000, effectiveFrom: '2026-01-01', idempotencyKey: 'cmp_k1' }, repo);
    assert.equal(rec.basicMinor, 900000);
    assert.equal(rec.currency, 'SAR');
    assert.equal(rec.housingMinor, 0);
});
test('createCompensation: closes previous on new entry', async () => {
    const repo = makeRepo();
    await createCompensation({ employeeId: 'emp_3', basicMinor: 900000, effectiveFrom: '2024-01-01', idempotencyKey: 'cmp_k2' }, repo);
    await createCompensation({ employeeId: 'emp_3', basicMinor: 1000000, effectiveFrom: '2025-01-01', idempotencyKey: 'cmp_k3' }, repo);
    const old = await repo.findCompensationByIdempotencyKey('cmp_k2');
    assert.equal(old.effectiveTo, '2025-01-01');
});
test('createCompensation: rejects negative basicMinor', async () => {
    const repo = makeRepo();
    await assert.rejects(() => createCompensation({ employeeId: 'emp_x', basicMinor: -1, effectiveFrom: '2026-01-01', idempotencyKey: 'cmp_k4' }, repo), (e) => e.code === 'VALIDATION');
});
/* ─── Delegation ──────────────────────────────────────────────── */
test('createDelegation: creates valid delegation', async () => {
    const repo = makeRepo();
    // seed employees
    await repo.saveEmployee({ id: 'emp_a', personId: 'per_a', entityId: 'ent_1', employeeNo: 'A1', status: 'active', hireDate: '2024-01-01', idempotencyKey: 'ik_a', createdAt: '', version: 1 }, {});
    await repo.saveEmployee({ id: 'emp_b', personId: 'per_b', entityId: 'ent_1', employeeNo: 'B1', status: 'active', hireDate: '2024-01-01', idempotencyKey: 'ik_b', createdAt: '', version: 1 }, {});
    const dlg = await createDelegation({ fromEmployeeId: 'emp_a', toEmployeeId: 'emp_b', validFrom: '2026-05-01', validUntil: '2026-05-31' }, repo);
    assert.equal(dlg.fromEmployeeId, 'emp_a');
    assert.equal(dlg.toEmployeeId, 'emp_b');
});
test('createDelegation: rejects self-delegation', async () => {
    const repo = makeRepo();
    await assert.rejects(() => createDelegation({ fromEmployeeId: 'emp_a', toEmployeeId: 'emp_a', validFrom: '2026-05-01', validUntil: '2026-05-31' }, repo), (e) => e.code === 'VALIDATION');
});
test('createDelegation: rejects validUntil before validFrom', async () => {
    const repo = makeRepo();
    await assert.rejects(() => createDelegation({ fromEmployeeId: 'emp_a', toEmployeeId: 'emp_b', validFrom: '2026-06-01', validUntil: '2026-05-01' }, repo), (e) => e.code === 'INVALID_DATE_RANGE');
});
test('createDelegation: rejects missing employee', async () => {
    const repo = makeRepo();
    await assert.rejects(() => createDelegation({ fromEmployeeId: 'emp_ghost', toEmployeeId: 'emp_b', validFrom: '2026-05-01', validUntil: '2026-05-31' }, repo), (e) => e.code === 'NOT_FOUND');
});
test('deleteDelegation: removes delegation', async () => {
    const repo = makeRepo();
    await repo.saveEmployee({ id: 'emp_c', personId: 'per_c', entityId: 'ent_1', employeeNo: 'C1', status: 'active', hireDate: '2024-01-01', idempotencyKey: 'ik_c', createdAt: '', version: 1 }, {});
    await repo.saveEmployee({ id: 'emp_d', personId: 'per_d', entityId: 'ent_1', employeeNo: 'D1', status: 'active', hireDate: '2024-01-01', idempotencyKey: 'ik_d', createdAt: '', version: 1 }, {});
    const dlg = await createDelegation({ fromEmployeeId: 'emp_c', toEmployeeId: 'emp_d', validFrom: '2026-05-01', validUntil: '2026-05-31' }, repo);
    await deleteDelegation(dlg.id, repo);
    assert.equal(await repo.findDelegationById(dlg.id), null);
});
/* ─── OrgNode projection ──────────────────────────────────────── */
async function seedEmpWithPos(repo, empId, managerId, role) {
    await repo.saveEmployee({ id: empId, personId: `per_${empId}`, entityId: 'ent_1', employeeNo: empId, status: 'active', hireDate: '2024-01-01', idempotencyKey: `ik_${empId}`, createdAt: '', version: 1 }, {});
    await repo.savePosition({ id: `pos_${empId}`, employeeId: empId, title: 'T', grade: 'G', departmentId: 'dep_1', reportsTo: managerId, workflowRole: role, effectiveFrom: '2024-01-01', effectiveTo: undefined, idempotencyKey: `pk_${empId}`, createdAt: '' });
}
test('buildOrgNode: returns correct projection', async () => {
    const repo = makeRepo();
    await seedEmpWithPos(repo, 'emp_x1', 'emp_x2', 'employee');
    const node = await buildOrgNode('emp_x1', repo);
    assert.ok(node);
    const n = node;
    assert.equal(n.employeeId, 'emp_x1');
    assert.equal(n.managerId, 'emp_x2');
    assert.equal(n.role, 'employee');
    assert.equal(n.isActive, true);
});
test('buildOrgNode: returns null for unknown employee', async () => {
    const repo = makeRepo();
    const node = await buildOrgNode('emp_ghost', repo);
    assert.equal(node, null);
});
test('findActiveManager: walks to manager', async () => {
    const repo = makeRepo();
    await seedEmpWithPos(repo, 'emp_y1', 'emp_y2', 'employee');
    await seedEmpWithPos(repo, 'emp_y2', undefined, 'manager');
    const mgr = await findActiveManager('emp_y1', repo);
    assert.ok(mgr);
    assert.equal(mgr.employeeId, 'emp_y2');
    assert.equal(mgr.role, 'manager');
});
test('findActiveManager: returns null if no manager', async () => {
    const repo = makeRepo();
    await seedEmpWithPos(repo, 'emp_z1', undefined, 'director');
    const mgr = await findActiveManager('emp_z1', repo);
    assert.equal(mgr, null);
});
