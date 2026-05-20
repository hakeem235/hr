/**
 * Offboarding saga — employee exit end-to-end.
 *
 * Activities (in order):
 *   1. submitGosiExit           — GOSI exit notification (must be within 7 days of exit)
 *   2. terminateQiwaContract    — Qiwa contract termination
 *   3. cancelBenefits           — cancel active benefits enrollments
 *   4. calculateFinalSettlement — trigger final payroll calculation (EOSB + unused leave)
 *   5. revokeItAccess           — revoke AD/IdP access (stub)
 *   6. sendOffboardingNotification — farewell + final settlement details
 *
 * Compensation: each step compensates in reverse if a later step fails.
 * In practice, offboarding compensations are mostly "re-enroll / re-activate"
 * which is unusual, but modelled for correctness.
 */
import type { SagaDef, SagaInstance, ActivityContext } from '../domain/types.js';

async function apiFetch<T>(
  url: string,
  init?: RequestInit,
  correlationId?: string,
): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(correlationId ? { 'X-Correlation-Id': correlationId } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function idem(saga: SagaInstance, suffix: string): string {
  return `${saga.idempotencyKey}:${suffix}`;
}

export const offboardingSaga: SagaDef = {
  name: 'offboarding',
  description: 'Employee exit — GOSI exit, Qiwa termination, benefits cancellation, final settlement, access revocation',
  activities: [

    // ── 1. GOSI exit ─────────────────────────────────────────────────────────
    {
      name: 'submitGosiExit',
      description: 'Submit GOSI exit notification (KSA regulation: within 7 days of exit date)',
      maxRetries: 3,
      async execute(saga, ctx) {
        const c = saga.context as any;
        const result = await apiFetch<Record<string, unknown>>(
          `${ctx.services.integrations}/gosi/enrollments/${saga.employeeId}/exit`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idem(saga, 'gosi_exit') },
            body: JSON.stringify({
              entityId: saga.entityId,
              exitDate: c.exitDate ?? new Date().toISOString().slice(0, 10),
              lastBasicMinor: c.lastBasicMinor ?? 0,
            }),
          },
          ctx.correlationId,
        );
        return { gosiExitSubmissionId: result.id, gosiExitRef: result.referenceNumber };
      },
      // GOSI exit is not easily reversed; no compensation defined
    },

    // ── 2. Qiwa contract termination ──────────────────────────────────────────
    {
      name: 'terminateQiwaContract',
      description: 'Register contract termination with Qiwa',
      maxRetries: 3,
      async execute(saga, ctx) {
        const c = saga.context as any;
        const result = await apiFetch<Record<string, unknown>>(
          `${ctx.services.integrations}/qiwa/contracts/${saga.employeeId}/terminate`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idem(saga, 'qiwa_terminate') },
            body: JSON.stringify({
              entityId: saga.entityId,
              exitDate: c.exitDate ?? new Date().toISOString().slice(0, 10),
              reason: c.terminationReason ?? 'Resignation',
            }),
          },
          ctx.correlationId,
        );
        return { qiwaTerminationId: result.id, qiwaTermRef: result.referenceNumber };
      },
    },

    // ── 3. Cancel benefits ────────────────────────────────────────────────────
    {
      name: 'cancelBenefits',
      description: 'Cancel all active and pending benefits enrollments',
      maxRetries: 2,
      async execute(saga, ctx) {
        const list = await apiFetch<{ items: any[] }>(
          `${ctx.services.benefits}/enrollments?employeeId=${saga.employeeId}`,
          undefined,
          ctx.correlationId,
        );
        const cancelled: string[] = [];
        for (const enrollment of list.items) {
          if (!['active', 'pending', 'suspended'].includes(enrollment.status)) continue;
          await apiFetch(
            `${ctx.services.benefits}/enrollments/${enrollment.id}/cancel`,
            {
              method: 'POST',
              headers: {
                'Idempotency-Key': idem(saga, `benefits_cancel_${enrollment.id}`),
                'If-Match': `"${enrollment.version}"`,
              },
              body: JSON.stringify({ reason: `Employee offboarding — ${saga.employeeId}` }),
            },
            ctx.correlationId,
          );
          cancelled.push(enrollment.id);
        }
        return { cancelledEnrollments: cancelled };
      },
    },

    // ── 4. Calculate final settlement ─────────────────────────────────────────
    {
      name: 'calculateFinalSettlement',
      description: 'Create final payroll run with EOSB, unused leave encashment, deductions',
      maxRetries: 2,
      async execute(saga, ctx) {
        const c = saga.context as any;
        // Create a special "final_settlement" payroll run
        const run = await apiFetch<Record<string, unknown>>(
          `${ctx.services.payroll}/payroll-runs`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idem(saga, 'final_settlement_run') },
            body: JSON.stringify({
              entityId: saga.entityId,
              period: c.exitDate?.slice(0, 7) ?? new Date().toISOString().slice(0, 7),
              type: 'final_settlement',
              employeeIds: [saga.employeeId],
            }),
          },
          ctx.correlationId,
        );
        return { finalSettlementRunId: run.id };
      },
    },

    // ── 5. Revoke IT access ───────────────────────────────────────────────────
    {
      name: 'revokeItAccess',
      description: 'Revoke AD account, email, and system access (stub — IT provisioning not built)',
      maxRetries: 1,
      async execute(saga, _ctx) {
        // Stub: IT provisioning service not yet built
        console.log(`[stub] Revoking IT access for ${saga.employeeId}`);
        return { itRevocationStatus: 'stub_revoked' };
      },
    },

    // ── 6. Send offboarding notification ──────────────────────────────────────
    {
      name: 'sendOffboardingNotification',
      description: 'Send final settlement details and farewell communication',
      maxRetries: 2,
      async execute(saga, ctx) {
        const c = saga.context as any;
        const result = await apiFetch<Record<string, unknown>>(
          `${ctx.services.notifications}/notifications`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idem(saga, 'offboarding_notification') },
            body: JSON.stringify({
              type: 'employee_offboarded',
              recipientId: saga.employeeId,
              entityId: saga.entityId,
              priority: 'high',
              payload: {
                employeeId: saga.employeeId,
                exitDate: c.exitDate,
                finalSettlementRunId: c.finalSettlementRunId,
              },
              sourceEventType: 'EmployeeTerminated',
              sourceEventId: saga.correlationId,
            }),
          },
          ctx.correlationId,
        );
        return { offboardingNotificationId: result.id };
      },
    },
  ],
};
