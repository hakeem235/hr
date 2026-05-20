/**
 * Onboarding saga — new hire end-to-end.
 *
 * Activities (in order):
 *   1. validateEmployee       — confirm employee record exists in people service
 *   2. enrollGosi             — day-1 GOSI enrollment via integrations service
 *   3. registerQiwaContract   — employment contract registration via integrations service
 *   4. activateBenefits       — find and activate pending benefits enrollment
 *   5. sendWelcomeNotification — welcome message via notifications service
 *   6. provisionItAccess      — IT provisioning stub (AD/IdP)
 *
 * Compensations run in reverse if any step fails:
 *   provisionItAccess  → revokeItAccess (stub)
 *   activateBenefits   → cancelBenefits
 *   registerQiwaContract → terminateQiwaContract
 *   enrollGosi         → submitGosiExit
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
    const msg = (body as any)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function idem(saga: SagaInstance, suffix: string): string {
  return `${saga.idempotencyKey}:${suffix}`;
}

export const onboardingSaga: SagaDef = {
  name: 'onboarding',
  description: 'New hire onboarding — GOSI enrollment, Qiwa contract, benefits activation, IT provisioning',
  activities: [

    // ── 1. Validate employee ───────────────────────────────────────────────────
    {
      name: 'validateEmployee',
      description: 'Confirm employee record exists in people service',
      maxRetries: 2,
      async execute(saga, ctx) {
        const emp = await apiFetch<Record<string, unknown>>(
          `${ctx.services.people}/employees/${saga.employeeId}`,
          undefined,
          ctx.correlationId,
        );
        return {
          employeeRecord: {
            employeeNumber: emp.employeeNumber,
            nationality: emp.nationality,
            status: emp.status,
          },
        };
      },
    },

    // ── 2. GOSI enrollment ────────────────────────────────────────────────────
    {
      name: 'enrollGosi',
      description: 'Day-1 GOSI social insurance enrollment',
      maxRetries: 3,
      async execute(saga, ctx) {
        const emp = saga.context as any;
        const result = await apiFetch<Record<string, unknown>>(
          `${ctx.services.integrations}/gosi/enrollments`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idem(saga, 'gosi_enroll') },
            body: JSON.stringify({
              entityId: saga.entityId,
              employeeId: saga.employeeId,
              nationality: emp.employeeRecord?.nationality ?? 'SA',
              basicMinor: emp.basicMinor ?? 0,
              hireDate: emp.hireDate ?? new Date().toISOString().slice(0, 10),
            }),
          },
          ctx.correlationId,
        );
        return { gosiSubmissionId: result.id, gosiRef: result.referenceNumber };
      },
      async compensate(saga, output, ctx) {
        await apiFetch(
          `${ctx.services.integrations}/gosi/enrollments/${saga.employeeId}/exit`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idem(saga, 'gosi_exit_compensation') },
            body: JSON.stringify({
              entityId: saga.entityId,
              exitDate: new Date().toISOString().slice(0, 10),
              lastBasicMinor: (saga.context as any).basicMinor ?? 0,
            }),
          },
          ctx.correlationId,
        );
      },
    },

    // ── 3. Qiwa contract registration ─────────────────────────────────────────
    {
      name: 'registerQiwaContract',
      description: 'Employment contract registration with Qiwa',
      maxRetries: 3,
      async execute(saga, ctx) {
        const ctx2 = saga.context as any;
        const result = await apiFetch<Record<string, unknown>>(
          `${ctx.services.integrations}/qiwa/contracts`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idem(saga, 'qiwa_register') },
            body: JSON.stringify({
              entityId: saga.entityId,
              employeeId: saga.employeeId,
              nationalId: ctx2.nationalId ?? `NID-${saga.employeeId}`,
              position: ctx2.position ?? 'Employee',
              startDate: ctx2.hireDate ?? new Date().toISOString().slice(0, 10),
              contractType: 'indefinite',
            }),
          },
          ctx.correlationId,
        );
        return { qiwaSubmissionId: result.id, qiwaRef: result.referenceNumber };
      },
      async compensate(saga, _output, ctx) {
        await apiFetch(
          `${ctx.services.integrations}/qiwa/contracts/${saga.employeeId}/terminate`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idem(saga, 'qiwa_terminate_compensation') },
            body: JSON.stringify({
              entityId: saga.entityId,
              exitDate: new Date().toISOString().slice(0, 10),
              reason: 'Onboarding saga compensation — rolled back',
            }),
          },
          ctx.correlationId,
        );
      },
    },

    // ── 4. Activate benefits ──────────────────────────────────────────────────
    {
      name: 'activateBenefits',
      description: 'Activate pending benefits enrollments for the new hire',
      maxRetries: 2,
      async execute(saga, ctx) {
        // List pending enrollments for this employee and activate them
        const list = await apiFetch<{ items: any[] }>(
          `${ctx.services.benefits}/enrollments?employeeId=${saga.employeeId}&status=pending`,
          undefined,
          ctx.correlationId,
        );
        const activated: string[] = [];
        for (const enrollment of list.items) {
          await apiFetch(
            `${ctx.services.benefits}/enrollments/${enrollment.id}/activate`,
            {
              method: 'POST',
              headers: {
                'Idempotency-Key': idem(saga, `benefits_activate_${enrollment.id}`),
                'If-Match': `"${enrollment.version}"`,
              },
              body: JSON.stringify({}),
            },
            ctx.correlationId,
          );
          activated.push(enrollment.id);
        }
        return { activatedEnrollments: activated };
      },
      async compensate(saga, output, ctx) {
        const enrollments = (output.activatedEnrollments as string[]) ?? [];
        for (const id of enrollments) {
          await apiFetch(
            `${ctx.services.benefits}/enrollments/${id}/cancel`,
            {
              method: 'POST',
              headers: { 'Idempotency-Key': idem(saga, `benefits_cancel_${id}`) },
              body: JSON.stringify({ reason: 'Onboarding saga compensation' }),
            },
            ctx.correlationId,
          ).catch(() => { /* best effort */ });
        }
      },
    },

    // ── 5. Send welcome notification ──────────────────────────────────────────
    {
      name: 'sendWelcomeNotification',
      description: 'Send welcome message and onboarding instructions to new hire',
      maxRetries: 2,
      async execute(saga, ctx) {
        const result = await apiFetch<Record<string, unknown>>(
          `${ctx.services.notifications}/notifications`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idem(saga, 'welcome_notification') },
            body: JSON.stringify({
              type: 'employee_onboarded',
              recipientId: saga.employeeId,
              entityId: saga.entityId,
              priority: 'high',
              payload: {
                employeeId: saga.employeeId,
                hireDate: (saga.context as any).hireDate,
              },
              sourceEventType: 'EmployeeOnboarded',
              sourceEventId: saga.correlationId,
            }),
          },
          ctx.correlationId,
        );
        return { welcomeNotificationId: result.id };
      },
      // Notifications are not compensated (informational only)
    },

    // ── 6. Provision IT access ────────────────────────────────────────────────
    {
      name: 'provisionItAccess',
      description: 'Provision AD account, email, and system access (stub — IT provisioning not built)',
      maxRetries: 1,
      async execute(saga, _ctx) {
        // Stub: IT provisioning service not yet built (CLAUDE.md §11 "Not built yet")
        // Returns a synthetic result so the saga can complete end-to-end
        return {
          itProvisioningStatus: 'stub_provisioned',
          adAccount: `${saga.employeeId}@company.sa`,
          email: `${saga.employeeId}@company.sa`,
        };
      },
      async compensate(saga, _output, _ctx) {
        // Stub: revoke access when IT provisioning service is built
        console.log(`[stub] Revoking IT access for ${saga.employeeId}`);
      },
    },
  ],
};
