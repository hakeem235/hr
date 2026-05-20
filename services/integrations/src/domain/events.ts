/**
 * Domain event handler — routes inbound events to the appropriate integration.
 *
 * Called by POST /api/v1/events (webhook-style delivery until Kafka/NATS is live).
 * Each handler is idempotent: the idempotency key is the eventId.
 */
import type { DomainEvent, IntegrationsRepo } from './types.js';
import { gosiEnroll, gosiExit, gosiRecalculate } from './gosi.js';
import { qiwaRegisterContract, qiwaTerminateContract } from './qiwa-muqeem-cchi.js';

export async function handleDomainEvent(
  event: DomainEvent,
  repo: IntegrationsRepo,
): Promise<{ handled: boolean; actions: string[] }> {
  const actions: string[] = [];

  switch (event.eventType) {

    case 'EmployeeOnboarded': {
      const p = event.payload as {
        employeeId: string;
        nationality: string;
        basicMinor: number;
        hireDate: string;
      };
      // GOSI enrollment (day 1)
      await gosiEnroll({
        idempotencyKey: `${event.eventId}:gosi_enroll`,
        entityId: event.entityId,
        employeeId: p.employeeId,
        nationality: p.nationality ?? 'SA',
        basicMinor: p.basicMinor ?? 0,
        hireDate: p.hireDate ?? event.occurredAt.slice(0, 10),
      }, repo);
      actions.push('gosi_enroll');

      // Qiwa contract registration
      await qiwaRegisterContract({
        idempotencyKey: `${event.eventId}:qiwa_register`,
        entityId: event.entityId,
        employeeId: p.employeeId,
        nationalId: (p as any).nationalId ?? `NID-${p.employeeId}`,
        position: (p as any).position ?? 'Employee',
        startDate: p.hireDate ?? event.occurredAt.slice(0, 10),
        contractType: 'indefinite',
      }, repo);
      actions.push('qiwa_register');
      break;
    }

    case 'EmployeeTerminated': {
      const p = event.payload as {
        employeeId: string;
        exitDate: string;
        lastBasicMinor: number;
      };
      // GOSI exit
      await gosiExit({
        idempotencyKey: `${event.eventId}:gosi_exit`,
        entityId: event.entityId,
        employeeId: p.employeeId,
        exitDate: p.exitDate ?? event.occurredAt.slice(0, 10),
        lastBasicMinor: p.lastBasicMinor ?? 0,
      }, repo);
      actions.push('gosi_exit');

      // Qiwa contract termination
      await qiwaTerminateContract({
        idempotencyKey: `${event.eventId}:qiwa_terminate`,
        entityId: event.entityId,
        employeeId: p.employeeId,
        exitDate: p.exitDate ?? event.occurredAt.slice(0, 10),
        reason: (p as any).reason ?? 'Termination',
      }, repo);
      actions.push('qiwa_terminate');
      break;
    }

    case 'CompensationChanged': {
      const p = event.payload as {
        employeeId: string;
        nationality: string;
        oldBasicMinor: number;
        newBasicMinor: number;
        effectiveDate: string;
      };
      await gosiRecalculate({
        idempotencyKey: `${event.eventId}:gosi_recalc`,
        entityId: event.entityId,
        employeeId: p.employeeId,
        nationality: p.nationality ?? 'SA',
        oldBasicMinor: p.oldBasicMinor ?? 0,
        newBasicMinor: p.newBasicMinor ?? 0,
        effectiveDate: p.effectiveDate ?? event.occurredAt.slice(0, 10),
      }, repo);
      actions.push('gosi_recalc');
      break;
    }

    default:
      return { handled: false, actions: [] };
  }

  return { handled: true, actions };
}
