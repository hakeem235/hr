import Fastify from 'fastify';
import type {
  BenefitRepo, BenefitPlan, EnrollmentRecord, Dependent,
  EnrollmentStatus, DomainEvent, EnrollmentFilter,
} from './domain/types.js';
import { DEFAULT_PLANS } from './domain/plans.js';
import { registerBenefitRoutes } from './routes/benefit-routes.js';
import { newId } from './domain/events.js';

// ─── In-Memory Repo ───────────────────────────────────────────────────────────

class InMemoryBenefitRepo implements BenefitRepo {
  private plans       = new Map<string, BenefitPlan>();
  private enrollments = new Map<string, EnrollmentRecord>();
  private outbox: DomainEvent[] = [];

  private log(event: DomainEvent) {
    console.log(`[outbox] ${event.eventType} ${event.aggregateId}`);
    this.outbox.push(event);
  }

  async findPlanById(id: string)  { return this.plans.get(id) ?? null; }
  async listPlans(entityId: string) {
    return [...this.plans.values()].filter((p) => p.entityId === entityId || p.entityId === 'ent_default');
  }
  async savePlan(plan: BenefitPlan, event: DomainEvent) {
    this.plans.set(plan.id, plan);
    this.log(event);
  }

  async findEnrollmentById(id: string)              { return this.enrollments.get(id) ?? null; }
  async findEnrollmentByIdempotencyKey(key: string) { return [...this.enrollments.values()].find((e) => e.idempotencyKey === key) ?? null; }
  async findActiveEnrollment(employeeId: string, planId: string) {
    return [...this.enrollments.values()].find(
      (e) => e.employeeId === employeeId && e.planId === planId && (e.status === 'active' || e.status === 'pending'),
    ) ?? null;
  }

  async listEnrollments(filter: EnrollmentFilter) {
    let all = [...this.enrollments.values()]
      .filter((e) => !filter.employeeId || e.employeeId === filter.employeeId)
      .filter((e) => !filter.entityId   || e.entityId   === filter.entityId)
      .filter((e) => !filter.planId     || e.planId     === filter.planId)
      .filter((e) => !filter.status     || e.status     === filter.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filter.cursor) {
      const idx = all.findIndex((e) => e.id === filter.cursor);
      if (idx !== -1) all = all.slice(idx + 1);
    }
    const items = all.slice(0, filter.limit);
    return { items, nextCursor: all.length > filter.limit ? items[items.length - 1]?.id : undefined };
  }

  async saveWithEvent(rec: EnrollmentRecord, event: DomainEvent) {
    this.enrollments.set(rec.id, rec);
    this.log(event);
  }

  async updateStatus(id: string, status: EnrollmentStatus, effectiveTo: string | undefined, _expectedVersion: number, event: DomainEvent) {
    const rec = this.enrollments.get(id)!;
    const updated: EnrollmentRecord = {
      ...rec, status, effectiveTo: effectiveTo ?? rec.effectiveTo,
      version: rec.version + 1, updatedAt: new Date().toISOString(),
    };
    this.enrollments.set(id, updated);
    this.log(event);
    return updated;
  }

  async addDependent(enrollmentId: string, dependent: Dependent) {
    const rec = this.enrollments.get(enrollmentId)!;
    const updated: EnrollmentRecord = {
      ...rec,
      dependents: [...rec.dependents, dependent],
      version: rec.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.enrollments.set(enrollmentId, updated);
    return updated;
  }

  async removeDependent(enrollmentId: string, dependentId: string) {
    const rec = this.enrollments.get(enrollmentId)!;
    const updated: EnrollmentRecord = {
      ...rec,
      dependents: rec.dependents.filter((d) => d.id !== dependentId),
      version: rec.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.enrollments.set(enrollmentId, updated);
    return updated;
  }
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

const repo = new InMemoryBenefitRepo();
const SEED_EVENT = (type: string, id: string): DomainEvent => ({
  eventId: `evt_seed_${id}`, eventType: type, entityId: 'ent_default',
  correlationId: 'seed', occurredAt: new Date().toISOString(),
  aggregateType: 'plan', aggregateId: id, payload: {},
});

// Seed all default plans
for (const plan of DEFAULT_PLANS) {
  await repo.savePlan(plan, SEED_EVENT('BenefitPlanCreated', plan.id));
}

// Seed 3 enrollments (matching people/leave employee IDs)
const NOW = new Date().toISOString();
const seedEnrollments: EnrollmentRecord[] = [
  {
    id: 'enr_000001', entityId: 'ent_default', employeeId: 'emp_018f23',
    planId: 'plan_med_basic', status: 'active',
    effectiveFrom: '2024-01-01', dependents: [],
    idempotencyKey: 'seed_enr_000001', createdAt: NOW, updatedAt: NOW, version: 2,
  },
  {
    id: 'enr_000002', entityId: 'ent_default', employeeId: 'emp_mgr01',
    planId: 'plan_med_enhanced', status: 'active',
    effectiveFrom: '2024-01-01',
    dependents: [{
      id: 'dep_000001', enrollmentId: 'enr_000002',
      nameEn: 'Layla Al-Ghamdi', relationship: 'spouse',
      dateOfBirth: '1987-06-20', addedAt: NOW,
    }],
    idempotencyKey: 'seed_enr_000002', createdAt: NOW, updatedAt: NOW, version: 3,
  },
  {
    id: 'enr_000003', entityId: 'ent_default', employeeId: 'emp_018f23',
    planId: 'plan_mobile', status: 'active',
    effectiveFrom: '2024-01-01', dependents: [],
    idempotencyKey: 'seed_enr_000003', createdAt: NOW, updatedAt: NOW, version: 2,
  },
];

for (const enr of seedEnrollments) {
  await repo.saveWithEvent(enr, SEED_EVENT('EmployeeEnrolled', enr.id));
}

// ─── Server ───────────────────────────────────────────────────────────────────

const app = Fastify({ logger: true });

app.get('/', async () => ({
  service: 'benefits',
  version: '0.1.0',
  endpoints: [
    'GET  /api/v1/benefit-plans',
    'GET  /api/v1/benefit-plans/:id',
    'GET  /api/v1/enrollments',
    'POST /api/v1/enrollments',
    'GET  /api/v1/enrollments/:id',
    'POST /api/v1/enrollments/:id/activate',
    'POST /api/v1/enrollments/:id/cancel',
    'POST /api/v1/enrollments/:id/dependents',
    'DELETE /api/v1/enrollments/:id/dependents/:depId',
    'POST /api/v1/eosb/calculate',
    'GET  /api/v1/health',
  ],
}));

registerBenefitRoutes(app, repo);

const port = Number(process.env.PORT ?? 3006);
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
