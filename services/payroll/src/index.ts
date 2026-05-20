/**
 * Payroll service — entry point.
 * Port 3007. In-memory repo seeded with 5 payroll runs (historical + current draft).
 */
import Fastify from 'fastify';
import type {
  PayrollRepo, PayrollRun, PayslipRecord, DomainEvent,
  RunFilter, PayslipStatus,
} from './domain/types.js';
import { registerPayrollRoutes } from './routes/payroll-routes.js';

// ── In-memory repository ──────────────────────────────────────────────────────

export class InMemoryPayrollRepo implements PayrollRepo {
  private runs    = new Map<string, PayrollRun>();
  private byKey   = new Map<string, PayrollRun>();
  private payslips= new Map<string, PayslipRecord>();
  private outbox  = new Map<string, DomainEvent>();

  async findRunByIdempotencyKey(key: string): Promise<PayrollRun | null> {
    return this.byKey.get(key) ?? null;
  }

  async saveRun(run: PayrollRun, event: DomainEvent): Promise<PayrollRun> {
    this.runs.set(run.id, run);
    this.byKey.set(run.idempotencyKey, run);
    this.outbox.set(event.eventId, event);
    return run;
  }

  async findRunById(id: string): Promise<PayrollRun | null> {
    return this.runs.get(id) ?? null;
  }

  async updateRun(run: PayrollRun, event: DomainEvent): Promise<PayrollRun> {
    this.runs.set(run.id, run);
    this.byKey.set(run.idempotencyKey, run);
    this.outbox.set(event.eventId, event);
    return run;
  }

  async listRuns(filter: RunFilter): Promise<{ items: PayrollRun[]; nextCursor: string | null }> {
    let items = [...this.runs.values()];
    if (filter.entityId) items = items.filter((r) => r.entityId === filter.entityId);
    if (filter.period)   items = items.filter((r) => r.period   === filter.period);
    if (filter.status)   items = items.filter((r) => r.status   === filter.status);

    items.sort((a, b) => b.period.localeCompare(a.period));

    const limit = filter.limit ?? 20;
    let start = 0;
    if (filter.cursor) {
      const idx = items.findIndex((r) => r.id === filter.cursor);
      if (idx !== -1) start = idx + 1;
    }
    const page = items.slice(start, start + limit);
    return { items: page, nextCursor: page.length === limit ? (page[page.length - 1]?.id ?? null) : null };
  }

  async savePayslips(slips: PayslipRecord[]): Promise<void> {
    for (const s of slips) this.payslips.set(s.id, s);
  }

  async findPayslipById(id: string): Promise<PayslipRecord | null> {
    return this.payslips.get(id) ?? null;
  }

  async listPayslipsByRun(runId: string): Promise<PayslipRecord[]> {
    return [...this.payslips.values()].filter((s) => s.payrollRunId === runId);
  }

  async updatePayslipStatus(runId: string, status: PayslipStatus): Promise<void> {
    for (const [id, slip] of this.payslips) {
      if (slip.payrollRunId === runId) {
        this.payslips.set(id, { ...slip, status });
      }
    }
  }

  async findEventsByCorrelationId(correlationId: string): Promise<DomainEvent[]> {
    return [...this.outbox.values()].filter((e) => e.correlationId === correlationId);
  }
}

// ── Seed data ─────────────────────────────────────────────────────────────────

function seedRepo(repo: InMemoryPayrollRepo): void {
  const ENTITY = 'ent_default';
  const PAID_RUNS: Array<{ id: string; period: string; headcount: number; gross: number; net: number; gosiEmp: number; gosiEr: number }> = [
    { id: 'pr_001', period: '2026-01', headcount: 238, gross: 142_800_000, net: 121_380_000, gosiEmp: 13_923_000, gosiEr: 16_779_000 },
    { id: 'pr_002', period: '2026-02', headcount: 241, gross: 144_600_000, net: 122_910_000, gosiEmp: 14_098_500, gosiEr: 16_998_500 },
    { id: 'pr_003', period: '2026-03', headcount: 244, gross: 146_400_000, net: 124_440_000, gosiEmp: 14_274_000, gosiEr: 17_214_000 },
    { id: 'pr_004', period: '2026-04', headcount: 246, gross: 147_200_000, net: 125_120_000, gosiEmp: 14_352_000, gosiEr: 17_306_000 },
  ];

  for (const r of PAID_RUNS) {
    const run: PayrollRun = {
      id: r.id, entityId: ENTITY, period: r.period,
      status: 'paid', headcount: r.headcount,
      grossMinor: r.gross, netMinor: r.net,
      gosiEmployeeMinor: r.gosiEmp, gosiEmployerMinor: r.gosiEr,
      version: 4, idempotencyKey: `seed_${r.id}`,
      createdAt: `${r.period}-18T08:00:00+03:00`,
      calculatedAt: `${r.period}-19T09:00:00+03:00`,
      approvedAt: `${r.period}-20T10:00:00+03:00`,
      paidAt: `${r.period}-25T10:00:00+03:00`,
    };
    // Bypass saveRun (no event needed for seed)
    (repo as unknown as { runs: Map<string, PayrollRun>; byKey: Map<string, PayrollRun> })
      ['runs'].set(run.id, run);
    (repo as unknown as { byKey: Map<string, PayrollRun> })
      ['byKey'].set(run.idempotencyKey, run);
  }

  // Current draft run
  const draft: PayrollRun = {
    id: 'pr_005', entityId: ENTITY, period: '2026-05',
    status: 'draft', headcount: 0,
    grossMinor: 0, netMinor: 0,
    gosiEmployeeMinor: 0, gosiEmployerMinor: 0,
    version: 1, idempotencyKey: 'seed_pr_005',
    createdAt: '2026-05-18T08:00:00+03:00',
  };
  (repo as unknown as { runs: Map<string, PayrollRun>; byKey: Map<string, PayrollRun> })
    ['runs'].set(draft.id, draft);
  (repo as unknown as { byKey: Map<string, PayrollRun> })
    ['byKey'].set(draft.idempotencyKey, draft);
}

// ── Server ────────────────────────────────────────────────────────────────────

const repo = new InMemoryPayrollRepo();
seedRepo(repo);

const app = Fastify({ logger: true });
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_, body, done) => {
  try { done(null, JSON.parse(body as string)); }
  catch (e) { done(e as Error); }
});

registerPayrollRoutes(app, repo);

app.listen({ port: 3007, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  app.log.info('Payroll service listening on port 3007');
});
