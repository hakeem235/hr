import Fastify from 'fastify';
import { registerLetterRoutes } from './routes/letter-routes.js';
import { createWorkflowClient } from './wf-client.js';
import { createPeopleClient, createFallbackPeopleClient } from './people-client.js';
// ─── In-Memory Repo ───────────────────────────────────────────────────────────
class InMemoryLetterRepo {
    store = new Map();
    outbox = [];
    async findByIdempotencyKey(employeeId, key) {
        return [...this.store.values()].find((r) => r.employeeId === employeeId && r.idempotencyKey === key) ?? null;
    }
    async findById(id) {
        return this.store.get(id) ?? null;
    }
    async saveWithEvent(rec, event) {
        this.store.set(rec.id, rec);
        this.outbox.push(event);
        console.log(`[outbox] ${event.eventType} ${event.aggregateId}`);
    }
    async updateStatus(id, status, expectedVersion, event, extra) {
        const rec = this.store.get(id);
        if (!rec)
            throw new Error(`Not found: ${id}`);
        if (rec.version !== expectedVersion)
            throw new Error('Version mismatch');
        const updated = {
            ...rec,
            status,
            documentId: extra?.documentId ?? rec.documentId,
            version: rec.version + 1,
            updatedAt: new Date().toISOString(),
        };
        this.store.set(id, updated);
        this.outbox.push(event);
        console.log(`[outbox] ${event.eventType} ${event.aggregateId}`);
        return updated;
    }
    async listRequests(filter) {
        let all = [...this.store.values()]
            .filter((r) => !filter.employeeId || r.employeeId === filter.employeeId)
            .filter((r) => !filter.entityId || r.entityId === filter.entityId)
            .filter((r) => !filter.status || r.status === filter.status)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (filter.cursor) {
            const idx = all.findIndex((r) => r.id === filter.cursor);
            if (idx !== -1)
                all = all.slice(idx + 1);
        }
        const items = all.slice(0, filter.limit);
        return {
            items,
            nextCursor: all.length > filter.limit ? items[items.length - 1]?.id : undefined,
        };
    }
}
// ─── Seeded data ──────────────────────────────────────────────────────────────
const repo = new InMemoryLetterRepo();
const now = new Date().toISOString();
const seedEvent = (type, id) => ({
    eventId: `evt_seed_${id}`,
    eventType: type,
    entityId: 'ent_default',
    correlationId: 'seed',
    occurredAt: now,
    aggregateType: 'letter_request',
    aggregateId: id,
    payload: {},
});
// 3 seeded letter requests across different employees and types
const seedRecords = [
    {
        id: 'ltr_000001', entityId: 'ent_default', employeeId: 'emp_018f23',
        letterTypeId: 'salary_certificate', purpose: 'Bank account opening',
        language: 'bilingual', status: 'issued', documentId: 'doc_abc001',
        workflowInstanceId: 'wf_seed001', idempotencyKey: 'seed_ltr_000001',
        createdAt: '2026-04-10T09:00:00.000Z', updatedAt: '2026-04-10T11:00:00.000Z', version: 3,
    },
    {
        id: 'ltr_000002', entityId: 'ent_default', employeeId: 'emp_004a11',
        letterTypeId: 'noc', purpose: 'Travel visa application', recipientName: 'French Embassy',
        language: 'en', status: 'pending_approval',
        workflowInstanceId: 'wf_seed002', idempotencyKey: 'seed_ltr_000002',
        createdAt: '2026-05-18T08:30:00.000Z', updatedAt: '2026-05-18T08:30:00.000Z', version: 1,
    },
    {
        id: 'ltr_000003', entityId: 'ent_default', employeeId: 'emp_07d2f9',
        letterTypeId: 'employment_certificate', purpose: 'Rental contract',
        language: 'ar', status: 'approved',
        workflowInstanceId: 'wf_seed003', idempotencyKey: 'seed_ltr_000003',
        createdAt: '2026-05-17T10:00:00.000Z', updatedAt: '2026-05-17T14:00:00.000Z', version: 2,
    },
];
for (const rec of seedRecords) {
    await repo.saveWithEvent(rec, seedEvent('LetterRequested', rec.id));
}
// ─── Server ───────────────────────────────────────────────────────────────────
const WORKFLOW_ENGINE_URL = process.env.WORKFLOW_ENGINE_URL ?? 'http://localhost:3002';
const wf = createWorkflowClient(WORKFLOW_ENGINE_URL);
const app = Fastify({ logger: true });
app.get('/', async () => ({
    service: 'letters',
    version: '0.1.0',
    endpoints: [
        'GET  /api/v1/letter-types',
        'GET  /api/v1/letter-policies/:typeId',
        'GET  /api/v1/letter-requests',
        'POST /api/v1/letter-requests',
        'GET  /api/v1/letter-requests/:id',
        'POST /api/v1/letter-requests/:id/cancel',
        'POST /api/v1/letter-requests/:id/issue',
        'GET  /api/v1/health',
    ],
}));
const PEOPLE_SERVICE_URL = process.env.PEOPLE_SERVICE_URL ?? 'http://localhost:3003';
const ARABIC_FONT_PATH = process.env.ARABIC_FONT_PATH;
const people = createFallbackPeopleClient(createPeopleClient(PEOPLE_SERVICE_URL));
registerLetterRoutes(app, { repo, wf, people, arabicFontPath: ARABIC_FONT_PATH });
const port = Number(process.env.PORT ?? 3004);
app.listen({ port, host: '0.0.0.0' }, (err) => {
    if (err) {
        app.log.error(err);
        process.exit(1);
    }
});
