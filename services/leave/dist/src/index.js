/**
 * Leave service entrypoint.
 * Wires the in-memory adapter (for local dev) to the route layer.
 * Replace InMemoryLeaveRepo with a real Postgres adapter when the DB is ready.
 */
import Fastify from 'fastify';
import { createWorkflowClient } from './wf-client.js';
import { registerLeaveRoutes } from './routes/leave-routes.js';
import { newId, } from './domain/create-request.js';
import { LeaveError } from './domain/working-days.js';
/* ─── In-memory store ───────────────────────────────────────── */
class InMemoryLeaveRepo {
    store = new Map();
    outbox = [];
    /* Seed some records so the console has data on first load */
    constructor() {
        const now = new Date().toISOString();
        const seed = [
            {
                entityId: 'ent_default', employeeId: 'emp_018f23', leaveTypeId: 'annual',
                startDate: '2026-05-25', endDate: '2026-05-29', workingDays: 5,
                reason: 'Family trip', status: 'pending_approval', version: 1,
                idempotencyKey: 'seed-1', createdAt: now, updatedAt: now,
                workflowInstanceId: 'wf_000001',
            },
            {
                entityId: 'ent_default', employeeId: 'emp_004a11', leaveTypeId: 'sick',
                startDate: '2026-05-19', endDate: '2026-05-20', workingDays: 2,
                status: 'approved', version: 2,
                idempotencyKey: 'seed-2', createdAt: now, updatedAt: now,
                workflowInstanceId: 'wf_000002',
            },
            {
                entityId: 'ent_default', employeeId: 'emp_0c3b77', leaveTypeId: 'emergency',
                startDate: '2026-05-21', endDate: '2026-05-21', workingDays: 1,
                reason: 'Family emergency', status: 'pending_approval', version: 1,
                idempotencyKey: 'seed-3', createdAt: now, updatedAt: now,
                workflowInstanceId: 'wf_000003',
            },
            {
                entityId: 'ent_default', employeeId: 'emp_07d2f9', leaveTypeId: 'annual',
                startDate: '2026-04-01', endDate: '2026-04-10', workingDays: 8,
                status: 'taken', version: 4,
                idempotencyKey: 'seed-4', createdAt: now, updatedAt: now,
                workflowInstanceId: 'wf_000004',
            },
            {
                entityId: 'ent_default', employeeId: 'emp_012e44', leaveTypeId: 'annual',
                startDate: '2026-06-01', endDate: '2026-06-05', workingDays: 5,
                reason: 'Summer vacation', status: 'declined', version: 3,
                idempotencyKey: 'seed-5', createdAt: now, updatedAt: now,
                workflowInstanceId: 'wf_000005',
            },
        ];
        for (const s of seed) {
            const id = newId('lv');
            this.store.set(id, { ...s, id });
        }
    }
    async findByIdempotencyKey(employeeId, key) {
        for (const r of this.store.values()) {
            if (r.employeeId === employeeId && r.idempotencyKey === key)
                return r;
        }
        return null;
    }
    async findById(id) {
        return this.store.get(id) ?? null;
    }
    async getBalance(_employeeId, leaveTypeId, _year) {
        /* Stub balances per type — replace with real DB query */
        const defaults = {
            annual: { accruedDays: 21, usedDays: 6, carriedDays: 0 },
            sick: { accruedDays: 10, usedDays: 2, carriedDays: 0 },
            emergency: { accruedDays: 5, usedDays: 0, carriedDays: 0 },
            maternity: { accruedDays: 70, usedDays: 0, carriedDays: 0 },
            paternity: { accruedDays: 3, usedDays: 0, carriedDays: 0 },
            hajj: { accruedDays: 10, usedDays: 0, carriedDays: 0 },
            unpaid: { accruedDays: 999, usedDays: 0, carriedDays: 0 },
        };
        return defaults[leaveTypeId] ?? { accruedDays: 0, usedDays: 0, carriedDays: 0 };
    }
    async hasOverlap(employeeId, start, endDate, excludeId) {
        for (const r of this.store.values()) {
            if (r.id === excludeId)
                continue;
            if (r.employeeId !== employeeId)
                continue;
            if (['cancelled', 'declined'].includes(r.status))
                continue;
            /* Overlap: not (end < start || start > end) */
            if (!(endDate < r.startDate || start > r.endDate))
                return true;
        }
        return false;
    }
    async saveWithEvent(rec, event) {
        this.store.set(rec.id, rec);
        this.outbox.push(event);
        console.log('[outbox]', event.eventType, event.aggregateId);
    }
    async updateStatus(id, status, expectedVersion, event) {
        const rec = this.store.get(id);
        if (!rec)
            throw new LeaveError('NOT_FOUND', `Leave request ${id} not found`);
        if (rec.version !== expectedVersion) {
            throw new LeaveError('CONFLICT', 'Resource has been modified — refresh and retry', undefined, {
                current: rec.version,
                expected: expectedVersion,
            });
        }
        const updated = {
            ...rec,
            status,
            updatedAt: new Date().toISOString(),
            version: rec.version + 1,
        };
        this.store.set(id, updated);
        this.outbox.push(event);
        console.log('[outbox]', event.eventType, event.aggregateId);
        return updated;
    }
    async listRequests(filter) {
        let all = [...this.store.values()];
        if (filter.employeeId)
            all = all.filter((r) => r.employeeId === filter.employeeId);
        if (filter.entityId)
            all = all.filter((r) => r.entityId === filter.entityId);
        if (filter.status)
            all = all.filter((r) => r.status === filter.status);
        /* Sort by createdAt descending */
        all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        /* Cursor-based pagination: cursor = last seen id */
        if (filter.cursor) {
            const idx = all.findIndex((r) => r.id === filter.cursor);
            if (idx !== -1)
                all = all.slice(idx + 1);
        }
        const items = all.slice(0, filter.limit);
        const nextCursor = all.length > filter.limit ? items[items.length - 1]?.id : undefined;
        return { items, nextCursor };
    }
}
/* ─── App bootstrap ─────────────────────────────────────────── */
const repo = new InMemoryLeaveRepo();
const WORKFLOW_ENGINE_URL = process.env.WORKFLOW_ENGINE_URL ?? 'http://localhost:3002';
const wf = createWorkflowClient(WORKFLOW_ENGINE_URL);
console.log(`[leave] Workflow client → ${WORKFLOW_ENGINE_URL}`);
async function calendarFor(_entityId) {
    /* KSA default: Sun–Thu work week, no holidays loaded yet */
    return { workWeek: [0, 1, 2, 3, 4], holidays: new Set() };
}
const app = Fastify({ logger: true });
app.get('/', async () => ({
    service: 'leave',
    version: '0.1.0',
    endpoints: [
        'GET  /api/v1/health',
        'GET  /api/v1/leave-types',
        'GET  /api/v1/leave-policies/:typeId',
        'GET  /api/v1/leave-balances',
        'GET  /api/v1/leave-requests',
        'POST /api/v1/leave-requests',
        'GET  /api/v1/leave-requests/:id',
        'POST /api/v1/leave-requests/:id/cancel',
        'GET  /api/v1/leave-requests/:id/conflicts',
    ],
}));
registerLeaveRoutes(app, { repo, wf, calendarFor });
const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' }, (err) => {
    if (err) {
        app.log.error(err);
        process.exit(1);
    }
});
