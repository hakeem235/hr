/**
 * Core types for the payroll service.
 *
 * Money rule: ALL monetary amounts are in minor units (halalas, 1 SAR = 100 halalas).
 * Never store or compute floats for money. Use Math.floor for division.
 */

// ── Payroll run ───────────────────────────────────────────────────────────────

export type PayrollRunStatus =
  | 'draft'
  | 'calculating'
  | 'pending_approval'
  | 'approved'
  | 'processing_wps'
  | 'paid'
  | 'cancelled';

export interface PayrollRun {
  id: string;
  entityId: string;
  period: string;                  // 'YYYY-MM'
  status: PayrollRunStatus;
  headcount: number;               // number of active employees in run
  grossMinor: number;              // sum of all gross pay
  netMinor: number;                // sum of all net pay
  gosiEmployeeMinor: number;       // total employee GOSI deductions
  gosiEmployerMinor: number;       // total employer GOSI contributions
  version: number;
  idempotencyKey: string;
  createdAt: string;               // ISO 8601 with offset
  calculatedAt?: string;
  approvedAt?: string;
  paidAt?: string;
}

// ── Payslip ───────────────────────────────────────────────────────────────────

export type PayslipStatus = 'draft' | 'approved' | 'paid';

export interface PayslipRecord {
  id: string;
  payrollRunId: string;
  entityId: string;
  employeeId: string;
  period: string;
  nationality: string;             // 'SA' = Saudi; anything else = expat
  basicMinor: number;
  housingMinor: number;
  transportMinor: number;
  otherAllowancesMinor: number;
  grossMinor: number;              // basic + housing + transport + other
  gosiDeductionEmployeeMinor: number;   // employee pays (Saudi: 9.75% × basic; expat: 0)
  gosiContributionEmployerMinor: number;// employer pays (Saudi: 11.75% × basic; expat: 2% × basic)
  otherDeductionsMinor: number;
  netMinor: number;                // gross − GOSI employee − otherDeductions
  status: PayslipStatus;
  version: number;
  createdAt: string;
}

// ── GOSI ──────────────────────────────────────────────────────────────────────

export interface GosiContribution {
  employeeId: string;
  basicMinor: number;
  nationality: string;
  isSaudi: boolean;
  /** Employee share (annuity): 9.75 % × basic for Saudis, 0 for expats */
  employeeDeductionMinor: number;
  /** Employer share: 11.75 % × basic for Saudis, 2 % × basic for expats */
  employerContributionMinor: number;
  /** Total GOSI cost to employer = employer share */
  totalContributionMinor: number;
}

// ── Employee input for a payroll run ─────────────────────────────────────────

export interface EmployeePayInput {
  employeeId: string;
  entityId: string;
  nationality: string;
  basicMinor: number;
  housingMinor: number;
  transportMinor: number;
  otherAllowancesMinor: number;
  otherDeductionsMinor: number;
}

// ── Repo interface ────────────────────────────────────────────────────────────

export interface RunFilter {
  entityId?: string;
  period?: string;
  status?: PayrollRunStatus;
  cursor?: string;
  limit?: number;
}

export interface PayrollRepo {
  // runs
  findRunByIdempotencyKey(key: string): Promise<PayrollRun | null>;
  saveRun(run: PayrollRun, event: DomainEvent): Promise<PayrollRun>;
  findRunById(id: string): Promise<PayrollRun | null>;
  updateRun(run: PayrollRun, event: DomainEvent): Promise<PayrollRun>;
  listRuns(filter: RunFilter): Promise<{ items: PayrollRun[]; nextCursor: string | null }>;
  // payslips
  savePayslips(slips: PayslipRecord[]): Promise<void>;
  findPayslipById(id: string): Promise<PayslipRecord | null>;
  listPayslipsByRun(runId: string): Promise<PayslipRecord[]>;
  updatePayslipStatus(runId: string, status: PayslipStatus): Promise<void>;
  // outbox
  findEventsByCorrelationId(correlationId: string): Promise<DomainEvent[]>;
}

// ── Domain event ──────────────────────────────────────────────────────────────

export interface DomainEvent {
  eventId: string;
  eventType: string;
  entityId: string;
  correlationId: string;
  occurredAt: string;
  aggregateType: 'payroll_run';
  aggregateId: string;
  payload: Record<string, unknown>;
}
