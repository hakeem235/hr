/**
 * /services/people — Employee master / HRIS core
 * Port: 3003 (leave=3001, workflow-engine=3002)
 *
 * In-memory repo with seeded data matching:
 *   - workflow engine actor IDs (emp_018f23, emp_004a11, emp_0c3b77,
 *     emp_mgr01, emp_mgr02, emp_dir01, emp_hr01, emp_hr02)
 *   - leave service employee IDs (emp_07d2f9, emp_012e44)
 */
import Fastify from 'fastify';
import { registerEntityRoutes } from './routes/entity-routes.js';
import { registerDepartmentRoutes } from './routes/department-routes.js';
import { registerPersonRoutes } from './routes/person-routes.js';
import { registerEmployeeRoutes } from './routes/employee-routes.js';
import { registerDocumentRoutes } from './routes/document-routes.js';
import { registerDelegationRoutes } from './routes/delegation-routes.js';
import { registerOrgRoutes } from './routes/org-routes.js';
// ─── In-Memory Repo ───────────────────────────────────────────────────────────
class InMemoryPeopleRepo {
    entities = new Map();
    holidays = new Map(); // key: entityId|date
    departments = new Map();
    persons = new Map();
    employees = new Map();
    positions = new Map();
    compensations = new Map();
    documents = new Map();
    delegations = new Map();
    outbox = [];
    log(event) {
        console.log(`[outbox] ${event.eventType} ${event.aggregateId}`);
        this.outbox.push(event);
    }
    // ── Entity ──────────────────────────────────────────────────────────────────
    async findEntityById(id) { return this.entities.get(id) ?? null; }
    async listEntities() { return [...this.entities.values()]; }
    async saveEntity(rec, event) {
        this.entities.set(rec.id, rec);
        this.log(event);
    }
    // ── Holiday ─────────────────────────────────────────────────────────────────
    async listHolidays(entityId) {
        return [...this.holidays.values()].filter((h) => h.entityId === entityId);
    }
    async upsertHoliday(rec) {
        this.holidays.set(`${rec.entityId}|${rec.holidayDate}`, rec);
    }
    async deleteHoliday(entityId, holidayDate) {
        this.holidays.delete(`${entityId}|${holidayDate}`);
    }
    // ── Department ──────────────────────────────────────────────────────────────
    async findDepartmentById(id) { return this.departments.get(id) ?? null; }
    async listDepartments(entityId) { return [...this.departments.values()].filter((d) => d.entityId === entityId); }
    async saveDepartment(rec, event) {
        this.departments.set(rec.id, rec);
        this.log(event);
    }
    // ── Person ───────────────────────────────────────────────────────────────────
    async findPersonById(id) { return this.persons.get(id) ?? null; }
    async findPersonByIdempotencyKey(key) { return [...this.persons.values()].find((p) => p.idempotencyKey === key) ?? null; }
    async listPersons(filter) {
        let all = [...this.persons.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (filter.cursor) {
            const idx = all.findIndex((p) => p.id === filter.cursor);
            if (idx !== -1)
                all = all.slice(idx + 1);
        }
        const items = all.slice(0, filter.limit);
        return { items, nextCursor: all.length > filter.limit ? items[items.length - 1]?.id : undefined };
    }
    async savePerson(rec, event) {
        this.persons.set(rec.id, rec);
        this.log(event);
    }
    // ── Employee ─────────────────────────────────────────────────────────────────
    async findEmployeeById(id) { return this.employees.get(id) ?? null; }
    async findEmployeeByIdempotencyKey(key) { return [...this.employees.values()].find((e) => e.idempotencyKey === key) ?? null; }
    async listEmployees(filter) {
        let all = [...this.employees.values()]
            .filter((e) => !filter.entityId || e.entityId === filter.entityId)
            .filter((e) => !filter.status || e.status === filter.status)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        // role filter — requires position lookup
        if (filter.role) {
            const withRole = [];
            for (const emp of all) {
                const pos = await this.getCurrentPosition(emp.id);
                if (pos?.workflowRole === filter.role)
                    withRole.push(emp);
            }
            all = withRole;
        }
        if (filter.cursor) {
            const idx = all.findIndex((e) => e.id === filter.cursor);
            if (idx !== -1)
                all = all.slice(idx + 1);
        }
        const items = all.slice(0, filter.limit);
        return { items, nextCursor: all.length > filter.limit ? items[items.length - 1]?.id : undefined };
    }
    async saveEmployee(rec, event) {
        this.employees.set(rec.id, rec);
        this.log(event);
    }
    async updateEmployeeStatus(id, status, exitDate, _expectedVersion, event) {
        const rec = this.employees.get(id);
        const updated = { ...rec, status, exitDate, version: rec.version + 1 };
        this.employees.set(id, updated);
        this.log(event);
        return updated;
    }
    // ── Position ─────────────────────────────────────────────────────────────────
    async findPositionByIdempotencyKey(key) { return [...this.positions.values()].find((p) => p.idempotencyKey === key) ?? null; }
    async listPositions(employeeId) { return [...this.positions.values()].filter((p) => p.employeeId === employeeId).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)); }
    async getCurrentPosition(employeeId, asOf) {
        const date = asOf ?? new Date().toISOString().slice(0, 10);
        const rows = [...this.positions.values()]
            .filter((p) => p.employeeId === employeeId && p.effectiveFrom <= date && (!p.effectiveTo || p.effectiveTo > date))
            .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
        return rows[0] ?? null;
    }
    async savePosition(rec) { this.positions.set(rec.id, rec); }
    // ── Compensation ─────────────────────────────────────────────────────────────
    async findCompensationByIdempotencyKey(key) { return [...this.compensations.values()].find((c) => c.idempotencyKey === key) ?? null; }
    async listCompensation(employeeId) { return [...this.compensations.values()].filter((c) => c.employeeId === employeeId).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)); }
    async getCurrentCompensation(employeeId, asOf) {
        const date = asOf ?? new Date().toISOString().slice(0, 10);
        const rows = [...this.compensations.values()]
            .filter((c) => c.employeeId === employeeId && c.effectiveFrom <= date && (!c.effectiveTo || c.effectiveTo > date))
            .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
        return rows[0] ?? null;
    }
    async saveCompensation(rec) { this.compensations.set(rec.id, rec); }
    // ── Document ─────────────────────────────────────────────────────────────────
    async findDocumentById(id) { return this.documents.get(id) ?? null; }
    async findDocumentByIdempotencyKey(key) { return [...this.documents.values()].find((d) => d.idempotencyKey === key) ?? null; }
    async listDocuments(filter) {
        let all = [...this.documents.values()]
            .filter((d) => !filter.employeeId || d.employeeId === filter.employeeId)
            .filter((d) => !filter.entityId || d.entityId === filter.entityId)
            .filter((d) => !filter.docType || d.docType === filter.docType)
            .filter((d) => !filter.expiringBefore || (d.expiresOn && d.expiresOn < filter.expiringBefore))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (filter.cursor) {
            const idx = all.findIndex((d) => d.id === filter.cursor);
            if (idx !== -1)
                all = all.slice(idx + 1);
        }
        const items = all.slice(0, filter.limit);
        return { items, nextCursor: all.length > filter.limit ? items[items.length - 1]?.id : undefined };
    }
    async saveDocument(rec, event) {
        this.documents.set(rec.id, rec);
        this.log(event);
    }
    // ── Delegation ───────────────────────────────────────────────────────────────
    async findDelegationById(id) { return this.delegations.get(id) ?? null; }
    async listDelegations(fromEmployeeId) { return [...this.delegations.values()].filter((d) => d.fromEmployeeId === fromEmployeeId); }
    async getActiveDelegation(fromEmployeeId, asOf) {
        return [...this.delegations.values()].find((d) => d.fromEmployeeId === fromEmployeeId && d.validFrom <= asOf && d.validUntil >= asOf) ?? null;
    }
    async saveDelegation(rec) { this.delegations.set(rec.id, rec); }
    async deleteDelegation(id) { this.delegations.delete(id); }
}
// ─── Seed data ────────────────────────────────────────────────────────────────
const repo = new InMemoryPeopleRepo();
const NOW = '2026-01-01T00:00:00.000Z';
const SEED_EVENT = (type, id) => ({
    eventId: `evt_seed_${id}`,
    eventType: type,
    entityId: 'ent_default',
    correlationId: 'seed',
    occurredAt: NOW,
    aggregateType: 'seed',
    aggregateId: id,
    payload: {},
});
// Entity
await repo.saveEntity({
    id: 'ent_default',
    legalName: 'HR Platform Demo Entity',
    country: 'SA',
    workWeek: [0, 1, 2, 3, 4],
    createdAt: NOW,
    version: 1,
}, SEED_EVENT('EntityCreated', 'ent_default'));
// Department
await repo.saveDepartment({
    id: 'dep_engineering',
    entityId: 'ent_default',
    name: 'Engineering',
    createdAt: NOW,
    version: 1,
}, SEED_EVENT('DepartmentCreated', 'dep_engineering'));
await repo.saveDepartment({
    id: 'dep_hr',
    entityId: 'ent_default',
    name: 'Human Resources',
    createdAt: NOW,
    version: 1,
}, SEED_EVENT('DepartmentCreated', 'dep_hr'));
// ─── Persons (one per employee for demo) ─────────────────────────────────────
const seedPersons = [
    { id: 'per_018f23', fullNameEn: 'Ahmed Al-Rashidi', nationality: 'SA', dateOfBirth: '1990-03-15', idempotencyKey: 'seed_per_018f23', createdAt: NOW, version: 1 },
    { id: 'per_004a11', fullNameEn: 'Fatimah Al-Zahrani', nationality: 'SA', dateOfBirth: '1992-07-22', idempotencyKey: 'seed_per_004a11', createdAt: NOW, version: 1 },
    { id: 'per_0c3b77', fullNameEn: 'Khalid Al-Otaibi', nationality: 'SA', dateOfBirth: '1988-11-05', idempotencyKey: 'seed_per_0c3b77', createdAt: NOW, version: 1 },
    { id: 'per_mgr01', fullNameEn: 'Sara Al-Ghamdi', nationality: 'SA', dateOfBirth: '1985-04-10', idempotencyKey: 'seed_per_mgr01', createdAt: NOW, version: 1 },
    { id: 'per_mgr02', fullNameEn: 'Omar Al-Shehri', nationality: 'SA', dateOfBirth: '1983-09-18', idempotencyKey: 'seed_per_mgr02', createdAt: NOW, version: 1 },
    { id: 'per_dir01', fullNameEn: 'Nora Al-Qahtani', nationality: 'SA', dateOfBirth: '1980-01-25', idempotencyKey: 'seed_per_dir01', createdAt: NOW, version: 1 },
    { id: 'per_hr01', fullNameEn: 'Reem Al-Dossari', nationality: 'SA', dateOfBirth: '1991-06-12', idempotencyKey: 'seed_per_hr01', createdAt: NOW, version: 1 },
    { id: 'per_hr02', fullNameEn: 'Tariq Al-Malki', nationality: 'SA', dateOfBirth: '1989-02-28', idempotencyKey: 'seed_per_hr02', createdAt: NOW, version: 1 },
    // leave service employees
    { id: 'per_07d2f9', fullNameEn: 'Walid Al-Harbi', nationality: 'SA', dateOfBirth: '1993-08-09', idempotencyKey: 'seed_per_07d2f9', createdAt: NOW, version: 1 },
    { id: 'per_012e44', fullNameEn: 'Mona Al-Anazi', nationality: 'SA', dateOfBirth: '1995-12-17', idempotencyKey: 'seed_per_012e44', createdAt: NOW, version: 1 },
];
for (const p of seedPersons) {
    await repo.savePerson(p, SEED_EVENT('PersonCreated', p.id));
}
const seedEmployees = [
    { id: 'emp_018f23', personId: 'per_018f23', employeeNo: 'EMP-0001', status: 'active' },
    { id: 'emp_004a11', personId: 'per_004a11', employeeNo: 'EMP-0002', status: 'active' },
    { id: 'emp_0c3b77', personId: 'per_0c3b77', employeeNo: 'EMP-0003', status: 'active' },
    { id: 'emp_mgr01', personId: 'per_mgr01', employeeNo: 'MGR-0001', status: 'active' },
    { id: 'emp_mgr02', personId: 'per_mgr02', employeeNo: 'MGR-0002', status: 'active' },
    { id: 'emp_dir01', personId: 'per_dir01', employeeNo: 'DIR-0001', status: 'active' },
    { id: 'emp_hr01', personId: 'per_hr01', employeeNo: 'HR-0001', status: 'active' },
    { id: 'emp_hr02', personId: 'per_hr02', employeeNo: 'HR-0002', status: 'active' },
    { id: 'emp_07d2f9', personId: 'per_07d2f9', employeeNo: 'EMP-0009', status: 'active' },
    { id: 'emp_012e44', personId: 'per_012e44', employeeNo: 'EMP-0010', status: 'active' },
];
for (const e of seedEmployees) {
    const rec = {
        id: e.id,
        personId: e.personId,
        entityId: 'ent_default',
        employeeNo: e.employeeNo,
        status: e.status,
        hireDate: '2024-01-01',
        idempotencyKey: `seed_${e.id}`,
        createdAt: NOW,
        version: 1,
    };
    await repo.saveEmployee(rec, SEED_EVENT('EmployeeOnboarded', e.id));
}
const seedPositions = [
    { id: 'pos_018f23', employeeId: 'emp_018f23', title: 'Software Engineer', grade: 'L3', departmentId: 'dep_engineering', reportsTo: 'emp_mgr01', workflowRole: 'employee' },
    { id: 'pos_004a11', employeeId: 'emp_004a11', title: 'Software Engineer', grade: 'L3', departmentId: 'dep_engineering', reportsTo: 'emp_mgr01', workflowRole: 'employee' },
    { id: 'pos_0c3b77', employeeId: 'emp_0c3b77', title: 'Software Engineer', grade: 'L3', departmentId: 'dep_engineering', reportsTo: 'emp_mgr02', workflowRole: 'employee' },
    { id: 'pos_mgr01', employeeId: 'emp_mgr01', title: 'Engineering Manager', grade: 'M1', departmentId: 'dep_engineering', reportsTo: 'emp_dir01', workflowRole: 'manager' },
    { id: 'pos_mgr02', employeeId: 'emp_mgr02', title: 'Engineering Manager', grade: 'M1', departmentId: 'dep_engineering', reportsTo: 'emp_dir01', workflowRole: 'manager' },
    { id: 'pos_dir01', employeeId: 'emp_dir01', title: 'Director of Engineering', grade: 'D1', departmentId: 'dep_engineering', workflowRole: 'director' },
    { id: 'pos_hr01', employeeId: 'emp_hr01', title: 'HR Operations Specialist', grade: 'L4', departmentId: 'dep_hr', reportsTo: 'emp_dir01', workflowRole: 'hr_ops' },
    { id: 'pos_hr02', employeeId: 'emp_hr02', title: 'HR Operations Specialist', grade: 'L4', departmentId: 'dep_hr', reportsTo: 'emp_dir01', workflowRole: 'hr_ops' },
    { id: 'pos_07d2f9', employeeId: 'emp_07d2f9', title: 'Product Manager', grade: 'L4', departmentId: 'dep_engineering', reportsTo: 'emp_mgr01', workflowRole: 'employee' },
    { id: 'pos_012e44', employeeId: 'emp_012e44', title: 'UX Designer', grade: 'L3', departmentId: 'dep_engineering', reportsTo: 'emp_mgr01', workflowRole: 'employee' },
];
for (const p of seedPositions) {
    await repo.savePosition({
        ...p,
        effectiveFrom: '2024-01-01',
        effectiveTo: undefined,
        idempotencyKey: `seed_${p.id}`,
        createdAt: NOW,
    });
}
// ─── Server ───────────────────────────────────────────────────────────────────
const app = Fastify({ logger: true });
app.get('/', async () => ({
    service: 'people',
    version: '0.1.0',
    endpoints: [
        'GET  /api/v1/entities',
        'POST /api/v1/entities',
        'GET  /api/v1/entities/:id',
        'PATCH /api/v1/entities/:id',
        'POST /api/v1/entities/:id/holidays',
        'GET  /api/v1/entities/:id/holidays',
        'DELETE /api/v1/entities/:id/holidays/:date',
        'GET  /api/v1/departments',
        'POST /api/v1/departments',
        'GET  /api/v1/departments/:id',
        'PATCH /api/v1/departments/:id',
        'GET  /api/v1/persons',
        'POST /api/v1/persons',
        'GET  /api/v1/persons/:id',
        'PATCH /api/v1/persons/:id',
        'GET  /api/v1/employees',
        'POST /api/v1/employees',
        'GET  /api/v1/employees/:id',
        'POST /api/v1/employees/:id/status',
        'POST /api/v1/employees/:id/positions',
        'GET  /api/v1/employees/:id/positions',
        'GET  /api/v1/employees/:id/positions/current',
        'POST /api/v1/employees/:id/compensation',
        'GET  /api/v1/employees/:id/compensation',
        'GET  /api/v1/employees/:id/compensation/current',
        'GET  /api/v1/employees/:id/org-node',
        'GET  /api/v1/employees/:id/manager',
        'GET  /api/v1/employees/:id/delegation',
        'GET  /api/v1/documents',
        'POST /api/v1/documents',
        'GET  /api/v1/documents/:id',
        'GET  /api/v1/delegations',
        'POST /api/v1/delegations',
        'DELETE /api/v1/delegations/:id',
        'GET  /api/v1/health',
    ],
}));
app.get('/api/v1/health', async () => ({ status: 'ok', service: 'people' }));
registerEntityRoutes(app, repo);
registerDepartmentRoutes(app, repo);
registerPersonRoutes(app, repo);
registerEmployeeRoutes(app, repo);
registerDocumentRoutes(app, repo);
registerDelegationRoutes(app, repo);
registerOrgRoutes(app, repo);
const port = Number(process.env.PORT ?? 3003);
app.listen({ port, host: '0.0.0.0' }, (err) => {
    if (err) {
        app.log.error(err);
        process.exit(1);
    }
});
