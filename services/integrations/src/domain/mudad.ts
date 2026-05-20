/**
 * Mudad / WPS (Wage Protection System) adapter.
 *
 * Mudad is the KSA portal for WPS compliance. Payroll runs must be submitted
 * before the salary payment deadline (typically 7th of the month).
 *
 * WPS file format (simplified): one JSON record per employee with IBAN,
 * net amount, and deduction breakdown.
 */
import type {
  GovSubmission, DomainEvent, IntegrationsRepo, MudadSubmitInput,
} from './types.js';

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString().replace('Z', '+00:00');
}

function stubMudadRef(payrollRunId: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `MUDAD-WPS-${payrollRunId.slice(-6).toUpperCase()}-${ts}`;
}

/** Validates that all WPS lines have valid IBAN and positive amounts. */
export function validateWpsLines(lines: MudadSubmitInput['lines']): string | null {
  if (lines.length === 0) return 'WPS submission must have at least one employee line';
  for (const line of lines) {
    if (!line.employeeIban.match(/^SA\d{22}$/)) {
      return `Invalid IBAN for employee ${line.employeeId}: ${line.employeeIban}`;
    }
    if (line.netMinor <= 0) {
      return `Net pay must be positive for employee ${line.employeeId}`;
    }
  }
  return null;
}

export async function mudadSubmitWps(
  input: MudadSubmitInput,
  repo: IntegrationsRepo,
): Promise<GovSubmission> {
  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  const validationError = validateWpsLines(input.lines);
  if (validationError) {
    throw new Error(validationError);
  }

  const totalNetMinor = input.lines.reduce((s, l) => s + l.netMinor, 0);
  const totalGosiMinor = input.lines.reduce((s, l) => s + l.gosiDeductionMinor, 0);

  const submission: GovSubmission = {
    id: newId('msub'),
    system: 'mudad',
    type: 'mudad_wps_submit',
    entityId: input.entityId,
    payrollRunId: input.payrollRunId,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    payload: {
      payrollRunId: input.payrollRunId,
      period: input.period,
      employeeCount: input.lines.length,
      totalNetMinor,
      totalGosiMinor,
      lines: input.lines,
    },
    retryCount: 0,
    createdAt: now(),
  };

  const event: DomainEvent = {
    eventId: newId('evt'),
    eventType: 'WpsSubmissionInitiated',
    entityId: input.entityId,
    correlationId: input.idempotencyKey,
    occurredAt: now(),
    aggregateType: 'gov_submission',
    aggregateId: submission.id,
    payload: {
      submissionId: submission.id,
      payrollRunId: input.payrollRunId,
      period: input.period,
      employeeCount: input.lines.length,
      totalNetMinor,
    },
  };

  const saved = await repo.save(submission, event);

  // Stub: confirm immediately
  const ts = now();
  const confirmed: GovSubmission = {
    ...saved,
    status: 'confirmed',
    referenceNumber: stubMudadRef(input.payrollRunId),
    submittedAt: ts,
    confirmedAt: ts,
  };
  const confirmEvent: DomainEvent = {
    eventId: newId('evt'),
    eventType: 'WpsSubmissionConfirmed',
    entityId: input.entityId,
    correlationId: input.idempotencyKey,
    occurredAt: ts,
    aggregateType: 'gov_submission',
    aggregateId: saved.id,
    payload: {
      submissionId: saved.id,
      referenceNumber: confirmed.referenceNumber,
      payrollRunId: input.payrollRunId,
    },
  };
  return repo.update(confirmed, confirmEvent);
}
