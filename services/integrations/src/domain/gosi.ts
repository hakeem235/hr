/**
 * GOSI (General Organization for Social Insurance) adapter.
 *
 * KSA rules (Art. 1 of GOSI regulations):
 *   Saudi nationals:  employee 9.75%  + employer 11.75% of basic salary
 *   Expatriates:      employee 0%     + employer 2.00%  (occupational hazard only)
 *
 * Arithmetic is integer basis-point — never floats.
 * All amounts are in halalas (1 SAR = 100 halalas).
 */
import type {
  GovSubmission, DomainEvent,
  GosiEnrollInput, GosiExitInput, GosiRecalcInput, GosiContributionPreview,
  IntegrationsRepo,
} from './types.js';

// ── Contribution rates ────────────────────────────────────────────────────────

const SAUDI_EMPLOYEE_BPS = 975;   //  9.75%
const SAUDI_EMPLOYER_BPS = 1175;  // 11.75%
const EXPAT_EMPLOYER_BPS = 200;   //  2.00%  (occupational hazard)

function applyBps(minor: number, bps: number): number {
  return Math.floor((minor * bps) / 10_000);
}

export function previewGosiContributions(
  nationality: string,
  basicMinor: number,
): GosiContributionPreview {
  const isSaudi = nationality === 'SA';
  const employeeMinor = isSaudi ? applyBps(basicMinor, SAUDI_EMPLOYEE_BPS) : 0;
  const employerMinor = isSaudi
    ? applyBps(basicMinor, SAUDI_EMPLOYER_BPS)
    : applyBps(basicMinor, EXPAT_EMPLOYER_BPS);
  return {
    nationality,
    basicMinor,
    employeeContributionMinor: employeeMinor,
    employerContributionMinor: employerMinor,
    totalMinor: employeeMinor + employerMinor,
  };
}

// ── GOSI ref number generator (stub — real impl calls GOSI API) ───────────────

function stubGosiRef(type: string, employeeId: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `GOSI-${type.toUpperCase().slice(0, 3)}-${employeeId.slice(-6).toUpperCase()}-${ts}`;
}

// ── ID generator ──────────────────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString().replace('Z', '+00:00');
}

// ── Enroll ────────────────────────────────────────────────────────────────────

export async function gosiEnroll(
  input: GosiEnrollInput,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  const contributions = previewGosiContributions(input.nationality, input.basicMinor);

  const submission: GovSubmission = {
    id: newId('gsub'),
    system: 'gosi',
    type: 'gosi_enroll',
    entityId: input.entityId,
    employeeId: input.employeeId,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    payload: {
      employeeId: input.employeeId,
      nationality: input.nationality,
      basicMinor: input.basicMinor,
      hireDate: input.hireDate,
      contributions,
    },
    retryCount: 0,
    createdAt: now(),
  };

  const event: DomainEvent = {
    eventId: newId('evt'),
    eventType: 'GosiEnrollmentInitiated',
    entityId: input.entityId,
    correlationId: input.idempotencyKey,
    occurredAt: now(),
    aggregateType: 'gov_submission',
    aggregateId: submission.id,
    payload: { submissionId: submission.id, employeeId: input.employeeId },
  };

  const saved = await repo.save(submission, event);

  // Stub: immediately confirm (real impl would be async via polling/webhook)
  return confirmSubmission(saved, stubGosiRef('enroll', input.employeeId), repo);
}

// ── Exit ──────────────────────────────────────────────────────────────────────

export async function gosiExit(
  input: GosiExitInput,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  const submission: GovSubmission = {
    id: newId('gsub'),
    system: 'gosi',
    type: 'gosi_exit',
    entityId: input.entityId,
    employeeId: input.employeeId,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    payload: {
      employeeId: input.employeeId,
      exitDate: input.exitDate,
      lastBasicMinor: input.lastBasicMinor,
    },
    retryCount: 0,
    createdAt: now(),
  };

  const event: DomainEvent = {
    eventId: newId('evt'),
    eventType: 'GosiExitInitiated',
    entityId: input.entityId,
    correlationId: input.idempotencyKey,
    occurredAt: now(),
    aggregateType: 'gov_submission',
    aggregateId: submission.id,
    payload: { submissionId: submission.id, employeeId: input.employeeId },
  };

  const saved = await repo.save(submission, event);
  return confirmSubmission(saved, stubGosiRef('exit', input.employeeId), repo);
}

// ── Recalculate ───────────────────────────────────────────────────────────────

export async function gosiRecalculate(
  input: GosiRecalcInput,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  const oldContributions = previewGosiContributions(input.nationality, input.oldBasicMinor);
  const newContributions = previewGosiContributions(input.nationality, input.newBasicMinor);
  const delta = {
    employeeContributionMinor: newContributions.employeeContributionMinor - oldContributions.employeeContributionMinor,
    employerContributionMinor: newContributions.employerContributionMinor - oldContributions.employerContributionMinor,
  };

  const submission: GovSubmission = {
    id: newId('gsub'),
    system: 'gosi',
    type: 'gosi_recalculate',
    entityId: input.entityId,
    employeeId: input.employeeId,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    payload: {
      employeeId: input.employeeId,
      nationality: input.nationality,
      oldBasicMinor: input.oldBasicMinor,
      newBasicMinor: input.newBasicMinor,
      effectiveDate: input.effectiveDate,
      oldContributions,
      newContributions,
      delta,
    },
    retryCount: 0,
    createdAt: now(),
  };

  const event: DomainEvent = {
    eventId: newId('evt'),
    eventType: 'GosiRecalcInitiated',
    entityId: input.entityId,
    correlationId: input.idempotencyKey,
    occurredAt: now(),
    aggregateType: 'gov_submission',
    aggregateId: submission.id,
    payload: { submissionId: submission.id, employeeId: input.employeeId, delta },
  };

  const saved = await repo.save(submission, event);
  return confirmSubmission(saved, stubGosiRef('recalc', input.employeeId), repo);
}

// ── Internal: confirm submission ──────────────────────────────────────────────

async function confirmSubmission(
  sub: GovSubmission,
  referenceNumber: string,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const ts = now();
  const confirmed: GovSubmission = {
    ...sub,
    status: 'confirmed',
    referenceNumber,
    submittedAt: ts,
    confirmedAt: ts,
  };
  const event: DomainEvent = {
    eventId: newId('evt'),
    eventType: sub.type === 'gosi_enroll' ? 'GosiEnrollmentConfirmed'
             : sub.type === 'gosi_exit'   ? 'GosiExitConfirmed'
             : 'GosiRecalcConfirmed',
    entityId: sub.entityId,
    correlationId: sub.idempotencyKey,
    occurredAt: ts,
    aggregateType: 'gov_submission',
    aggregateId: sub.id,
    payload: { submissionId: sub.id, referenceNumber },
  };
  return repo.update(confirmed, event);
}
