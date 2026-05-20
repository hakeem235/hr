/**
 * Qiwa, Muqeem, and CCHI adapters.
 *
 * Qiwa:   Saudi employment contract registration (required for all hires).
 * Muqeem: Iqama (residence permit) management for expat employees.
 * CCHI:   Council of Cooperative Health Insurance — medical insurance compliance.
 *
 * All three follow the same stub pattern as GOSI/Mudad: model the submission
 * lifecycle and confirm immediately. Real API calls are wired in /services/integrations
 * when provider credentials are available (CLAUDE.md §14).
 */
import type {
  GovSubmission, DomainEvent, IntegrationsRepo,
  QiwaContractInput, QiwaTerminateInput,
  MuqeemIqamaInput, CchiEnrollInput,
} from './types.js';

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString().replace('Z', '+00:00');
}

function stubRef(system: string, id: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `${system.toUpperCase()}-${id.slice(-6).toUpperCase()}-${ts}`;
}

async function submitAndConfirm(
  submission: GovSubmission,
  eventType: string,
  confirmEventType: string,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const event: DomainEvent = {
    eventId: newId('evt'),
    eventType,
    entityId: submission.entityId,
    correlationId: submission.idempotencyKey,
    occurredAt: now(),
    aggregateType: 'gov_submission',
    aggregateId: submission.id,
    payload: { submissionId: submission.id },
  };
  const saved = await repo.save(submission, event);

  const ts = now();
  const refSuffix = submission.employeeId ?? submission.enrollmentId ?? 'unk';
  const confirmed: GovSubmission = {
    ...saved,
    status: 'confirmed',
    referenceNumber: stubRef(submission.system, refSuffix),
    submittedAt: ts,
    confirmedAt: ts,
  };
  const confirmEvent: DomainEvent = {
    eventId: newId('evt'),
    eventType: confirmEventType,
    entityId: submission.entityId,
    correlationId: submission.idempotencyKey,
    occurredAt: ts,
    aggregateType: 'gov_submission',
    aggregateId: saved.id,
    payload: { submissionId: saved.id, referenceNumber: confirmed.referenceNumber },
  };
  return repo.update(confirmed, confirmEvent);
}

// ── Qiwa — contract registration ──────────────────────────────────────────────

export async function qiwaRegisterContract(
  input: QiwaContractInput,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  const submission: GovSubmission = {
    id: newId('qsub'),
    system: 'qiwa',
    type: 'qiwa_contract_register',
    entityId: input.entityId,
    employeeId: input.employeeId,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    payload: {
      employeeId: input.employeeId,
      nationalId: input.nationalId,
      position: input.position,
      startDate: input.startDate,
      contractType: input.contractType,
      contractEndDate: input.contractEndDate,
    },
    retryCount: 0,
    createdAt: now(),
  };

  return submitAndConfirm(submission, 'QiwaContractRegistrationInitiated', 'QiwaContractRegistered', repo);
}

export async function qiwaTerminateContract(
  input: QiwaTerminateInput,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  const submission: GovSubmission = {
    id: newId('qsub'),
    system: 'qiwa',
    type: 'qiwa_contract_terminate',
    entityId: input.entityId,
    employeeId: input.employeeId,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    payload: { employeeId: input.employeeId, exitDate: input.exitDate, reason: input.reason },
    retryCount: 0,
    createdAt: now(),
  };

  return submitAndConfirm(submission, 'QiwaContractTerminationInitiated', 'QiwaContractTerminated', repo);
}

// ── Muqeem — iqama processing ──────────────────────────────────────────────────

export async function muqeemProcessIqama(
  input: MuqeemIqamaInput,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  const submission: GovSubmission = {
    id: newId('mqsub'),
    system: 'muqeem',
    type: input.action === 'renew' ? 'muqeem_iqama_renew' : 'muqeem_iqama_exit',
    entityId: input.entityId,
    employeeId: input.employeeId,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    payload: {
      employeeId: input.employeeId,
      iqamaNumber: input.iqamaNumber,
      passportNumber: input.passportNumber,
      expiryDate: input.expiryDate,
      action: input.action,
    },
    retryCount: 0,
    createdAt: now(),
  };

  const initEvent   = input.action === 'renew' ? 'MuqeemIqamaRenewalInitiated'   : 'MuqeemIqamaExitInitiated';
  const confirmEvent = input.action === 'renew' ? 'MuqeemIqamaRenewalConfirmed'   : 'MuqeemIqamaExitConfirmed';
  return submitAndConfirm(submission, initEvent, confirmEvent, repo);
}

// ── CCHI — medical insurance enrollment ───────────────────────────────────────

export async function cchiEnroll(
  input: CchiEnrollInput,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  const submission: GovSubmission = {
    id: newId('csub'),
    system: 'cchi',
    type: 'cchi_enroll',
    entityId: input.entityId,
    employeeId: input.employeeId,
    enrollmentId: input.enrollmentId,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    payload: {
      employeeId: input.employeeId,
      enrollmentId: input.enrollmentId,
      planCode: input.planCode,
      memberId: input.memberId,
      dependents: input.dependents ?? [],
    },
    retryCount: 0,
    createdAt: now(),
  };

  return submitAndConfirm(submission, 'CchiEnrollmentInitiated', 'CchiEnrollmentConfirmed', repo);
}

export async function cchiTerminate(
  input: Omit<CchiEnrollInput, 'dependents' | 'memberId'>,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  const submission: GovSubmission = {
    id: newId('csub'),
    system: 'cchi',
    type: 'cchi_terminate',
    entityId: input.entityId,
    employeeId: input.employeeId,
    enrollmentId: input.enrollmentId,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    payload: { employeeId: input.employeeId, enrollmentId: input.enrollmentId, planCode: input.planCode },
    retryCount: 0,
    createdAt: now(),
  };

  return submitAndConfirm(submission, 'CchiTerminationInitiated', 'CchiTerminationConfirmed', repo);
}
