/**
 * Integrations service — shared types.
 *
 * Each "submission" is one unit of work dispatched to a government portal.
 * The state machine is: pending → submitted → confirmed / failed.
 * Retries increment retryCount; after maxRetries the status becomes failed.
 */

// ── Status machine ─────────────────────────────────────────────────────────────

export type SubmissionStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

// ── Government systems ─────────────────────────────────────────────────────────

export type GovSystem = 'gosi' | 'mudad' | 'qiwa' | 'muqeem' | 'cchi';

// ── Submission types per system ────────────────────────────────────────────────

export type GosiSubmissionType = 'enroll' | 'exit' | 'recalculate';
export type MudadSubmissionType = 'wps_submit';
export type QiwaSubmissionType  = 'contract_register' | 'contract_terminate';
export type MuqeemSubmissionType = 'iqama_renew' | 'iqama_exit';
export type CchiSubmissionType  = 'enroll' | 'terminate';

export type SubmissionType =
  | `gosi_${GosiSubmissionType}`
  | `mudad_${MudadSubmissionType}`
  | `qiwa_${QiwaSubmissionType}`
  | `muqeem_${MuqeemSubmissionType}`
  | `cchi_${CchiSubmissionType}`;

// ── Core submission record ─────────────────────────────────────────────────────

export interface GovSubmission {
  id: string;
  system: GovSystem;
  type: SubmissionType;
  entityId: string;
  /** null for entity-level submissions (e.g. Mudad payroll run) */
  employeeId?: string;
  payrollRunId?: string;
  enrollmentId?: string;
  status: SubmissionStatus;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  /** Government portal reference / transaction ID */
  referenceNumber?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;    // ISO 8601 with offset
  submittedAt?: string;
  confirmedAt?: string;
}

// ── GOSI-specific ──────────────────────────────────────────────────────────────

export interface GosiEnrollInput {
  idempotencyKey: string;
  entityId: string;
  employeeId: string;
  nationality: string;         // 'SA' = Saudi national; other = expat
  basicMinor: number;          // monthly basic salary in halalas
  hireDate: string;            // ISO date
}

export interface GosiExitInput {
  idempotencyKey: string;
  entityId: string;
  employeeId: string;
  exitDate: string;            // ISO date
  lastBasicMinor: number;
}

export interface GosiRecalcInput {
  idempotencyKey: string;
  entityId: string;
  employeeId: string;
  nationality: string;
  oldBasicMinor: number;
  newBasicMinor: number;
  effectiveDate: string;
}

export interface GosiContributionPreview {
  nationality: string;
  basicMinor: number;
  employeeContributionMinor: number;  // 0 for expats
  employerContributionMinor: number;
  totalMinor: number;
}

// ── Mudad/WPS-specific ─────────────────────────────────────────────────────────

export interface WpsLine {
  employeeId: string;
  employeeIban: string;         // SA IBAN — stub uses generated IBAN
  netMinor: number;             // amount to transfer in halalas
  gosiDeductionMinor: number;
  currency: string;             // 'SAR'
}

export interface MudadSubmitInput {
  idempotencyKey: string;
  entityId: string;
  payrollRunId: string;
  period: string;               // 'YYYY-MM'
  lines: WpsLine[];
}

// ── Qiwa-specific ──────────────────────────────────────────────────────────────

export interface QiwaContractInput {
  idempotencyKey: string;
  entityId: string;
  employeeId: string;
  nationalId: string;           // Saudi NID or Iqama number
  position: string;
  startDate: string;
  contractType: 'indefinite' | 'fixed_term';
  contractEndDate?: string;     // required for fixed_term
}

export interface QiwaTerminateInput {
  idempotencyKey: string;
  entityId: string;
  employeeId: string;
  exitDate: string;
  reason: string;
}

// ── Muqeem-specific ────────────────────────────────────────────────────────────

export interface MuqeemIqamaInput {
  idempotencyKey: string;
  entityId: string;
  employeeId: string;
  iqamaNumber: string;
  passportNumber: string;
  expiryDate: string;           // current expiry
  action: 'renew' | 'exit';
}

// ── CCHI-specific ──────────────────────────────────────────────────────────────

export interface CchiEnrollInput {
  idempotencyKey: string;
  entityId: string;
  employeeId: string;
  enrollmentId: string;
  planCode: string;             // CCHI provider code (e.g. 'CCHI-001')
  memberId?: string;
  dependents?: Array<{ name: string; relation: string; dob: string }>;
}

// ── Domain events ──────────────────────────────────────────────────────────────

export interface DomainEvent {
  eventId: string;
  eventType: string;
  entityId: string;
  correlationId: string;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

// ── Repository interface ───────────────────────────────────────────────────────

export interface IntegrationsRepo {
  findByIdempotencyKey(key: string): Promise<GovSubmission | null>;
  save(submission: GovSubmission, event: DomainEvent): Promise<GovSubmission>;
  update(submission: GovSubmission, event: DomainEvent): Promise<GovSubmission>;
  findById(id: string): Promise<GovSubmission | null>;
  list(filter: SubmissionFilter): Promise<{ items: GovSubmission[]; nextCursor: string | null }>;
  findByEmployee(employeeId: string, type?: SubmissionType): Promise<GovSubmission[]>;
}

export interface SubmissionFilter {
  system?: GovSystem;
  status?: SubmissionStatus;
  employeeId?: string;
  entityId?: string;
  cursor?: string;
  limit?: number;
}
