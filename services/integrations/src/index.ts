/**
 * Integrations service — port 3008.
 * Government portal adapters: GOSI, Mudad/WPS, Qiwa, Muqeem, CCHI.
 */
import Fastify from 'fastify';
import type {
  GovSubmission, DomainEvent, IntegrationsRepo, SubmissionFilter, SubmissionType,
} from './domain/types.js';
import { registerRoutes } from './routes/integration-routes.js';

// ── In-memory repository ───────────────────────────────────────────────────────

class InMemoryIntegrationsRepo implements IntegrationsRepo {
  private submissions: Map<string, GovSubmission> = new Map();
  private byIdempotency: Map<string, string> = new Map();   // key → id
  private outbox: DomainEvent[] = [];

  async findByIdempotencyKey(key: string): Promise<GovSubmission | null> {
    const id = this.byIdempotency.get(key);
    return id ? (this.submissions.get(id) ?? null) : null;
  }

  async save(submission: GovSubmission, event: DomainEvent): Promise<GovSubmission> {
    this.submissions.set(submission.id, submission);
    this.byIdempotency.set(submission.idempotencyKey, submission.id);
    this.outbox.push(event);
    console.log('[outbox]', event.eventType, submission.id);
    return submission;
  }

  async update(submission: GovSubmission, event: DomainEvent): Promise<GovSubmission> {
    this.submissions.set(submission.id, submission);
    this.outbox.push(event);
    console.log('[outbox]', event.eventType, submission.id, submission.referenceNumber ?? '');
    return submission;
  }

  async findById(id: string): Promise<GovSubmission | null> {
    return this.submissions.get(id) ?? null;
  }

  async list(filter: SubmissionFilter): Promise<{ items: GovSubmission[]; nextCursor: string | null }> {
    let all = [...this.submissions.values()];
    if (filter.system)     all = all.filter(s => s.system === filter.system);
    if (filter.status)     all = all.filter(s => s.status === filter.status);
    if (filter.employeeId) all = all.filter(s => s.employeeId === filter.employeeId);
    if (filter.entityId)   all = all.filter(s => s.entityId === filter.entityId);

    // Sort by createdAt desc
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const limit = filter.limit ?? 20;
    const startIdx = filter.cursor
      ? all.findIndex(s => s.id === filter.cursor) + 1
      : 0;
    const page = all.slice(startIdx, startIdx + limit);
    return {
      items: page,
      nextCursor: page.length === limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async findByEmployee(employeeId: string, type?: SubmissionType): Promise<GovSubmission[]> {
    let all = [...this.submissions.values()].filter(s => s.employeeId === employeeId);
    if (type) all = all.filter(s => s.type === type);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

// ── Seed data — representative confirmed submissions ──────────────────────────

function seedData(repo: InMemoryIntegrationsRepo): void {
  const now = new Date();
  const ts = (offsetDays: number) => {
    const d = new Date(now.getTime() - offsetDays * 86_400_000);
    return d.toISOString().replace('Z', '+03:00');
  };

  const seeded: GovSubmission[] = [
    // GOSI enrollments for the 3 employees matching the leave/people service seed IDs
    {
      id: 'gsub_001',
      system: 'gosi', type: 'gosi_enroll',
      entityId: 'ent_default', employeeId: 'emp_018f23',
      status: 'confirmed', idempotencyKey: 'seed_gosi_enroll_emp_018f23',
      payload: { nationality: 'SA', basicMinor: 1_200_000, hireDate: '2024-01-15' },
      referenceNumber: 'GOSI-ENR-018F23-SEED01',
      retryCount: 0,
      createdAt: ts(120), submittedAt: ts(120), confirmedAt: ts(120),
    },
    {
      id: 'gsub_002',
      system: 'gosi', type: 'gosi_enroll',
      entityId: 'ent_default', employeeId: 'emp_004a11',
      status: 'confirmed', idempotencyKey: 'seed_gosi_enroll_emp_004a11',
      payload: { nationality: 'PK', basicMinor: 800_000, hireDate: '2024-03-01' },
      referenceNumber: 'GOSI-ENR-004A11-SEED02',
      retryCount: 0,
      createdAt: ts(90), submittedAt: ts(90), confirmedAt: ts(90),
    },
    // Mudad WPS submission for April 2026 payroll
    {
      id: 'msub_001',
      system: 'mudad', type: 'mudad_wps_submit',
      entityId: 'ent_default', payrollRunId: 'pr_004',
      status: 'confirmed', idempotencyKey: 'seed_mudad_apr_2026',
      payload: { period: '2026-04', employeeCount: 246, totalNetMinor: 125_120_000 },
      referenceNumber: 'MUDAD-WPS-PR0004-SEED01',
      retryCount: 0,
      createdAt: ts(25), submittedAt: ts(25), confirmedAt: ts(25),
    },
    // Qiwa contract for emp_018f23
    {
      id: 'qsub_001',
      system: 'qiwa', type: 'qiwa_contract_register',
      entityId: 'ent_default', employeeId: 'emp_018f23',
      status: 'confirmed', idempotencyKey: 'seed_qiwa_emp_018f23',
      payload: { contractType: 'indefinite', startDate: '2024-01-15' },
      referenceNumber: 'QIWA-REG-018F23-SEED01',
      retryCount: 0,
      createdAt: ts(120), submittedAt: ts(120), confirmedAt: ts(120),
    },
    // CCHI enrollment for emp_004a11
    {
      id: 'csub_001',
      system: 'cchi', type: 'cchi_enroll',
      entityId: 'ent_default', employeeId: 'emp_004a11',
      enrollmentId: 'enr_001',
      status: 'confirmed', idempotencyKey: 'seed_cchi_emp_004a11',
      payload: { planCode: 'CCHI-001', dependents: [] },
      referenceNumber: 'CCHI-ENR-004A11-SEED01',
      retryCount: 0,
      createdAt: ts(90), submittedAt: ts(90), confirmedAt: ts(90),
    },
  ];

  for (const s of seeded) {
    (repo as any).submissions.set(s.id, s);
    (repo as any).byIdempotency.set(s.idempotencyKey, s.id);
  }
}

// ── Server bootstrap ──────────────────────────────────────────────────────────

const app = Fastify({ logger: true });
const repo = new InMemoryIntegrationsRepo();
seedData(repo);

registerRoutes(app, repo);

app.listen({ port: 3008, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  app.log.info('Integrations service listening on port 3008');
});
