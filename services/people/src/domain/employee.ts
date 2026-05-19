import type { EmployeeRecord, EmploymentStatus, EmployeeFilter, PeopleRepo } from './types.js';
import { PeopleError } from './errors.js';
import { newId, newEvent } from './events.js';

export interface CreateEmployeeInput {
  personId: string;
  entityId: string;
  employeeNo: string;
  hireDate: string;
  idempotencyKey: string;
}

/** Valid status transitions */
const TRANSITIONS: Record<EmploymentStatus, EmploymentStatus[]> = {
  pre_hire:   ['active', 'terminated'],
  active:     ['on_leave', 'suspended', 'terminated'],
  on_leave:   ['active', 'terminated'],
  suspended:  ['active', 'terminated'],
  terminated: [],
};

export async function createEmployee(
  input: CreateEmployeeInput,
  repo: PeopleRepo,
  correlationId: string,
): Promise<EmployeeRecord> {
  const existing = await repo.findEmployeeByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.hireDate)) {
    throw new PeopleError('VALIDATION', 'hireDate must be YYYY-MM-DD', 'hireDate');
  }

  const now = new Date().toISOString();
  const rec: EmployeeRecord = {
    id: newId('emp'),
    personId: input.personId,
    entityId: input.entityId,
    employeeNo: input.employeeNo,
    status: 'pre_hire',
    hireDate: input.hireDate,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    version: 1,
  };

  const event = newEvent('EmployeeCreated', input.entityId, correlationId, 'employee', rec.id, {
    employeeId: rec.id,
    personId: rec.personId,
    entityId: rec.entityId,
    employeeNo: rec.employeeNo,
    hireDate: rec.hireDate,
  });

  await repo.saveEmployee(rec, event);
  return rec;
}

export async function updateEmployeeStatus(
  id: string,
  newStatus: EmploymentStatus,
  exitDate: string | undefined,
  expectedVersion: number,
  repo: PeopleRepo,
  correlationId: string,
): Promise<EmployeeRecord> {
  const existing = await repo.findEmployeeById(id);
  if (!existing) throw new PeopleError('NOT_FOUND', `Employee ${id} not found`);

  if (existing.status === 'terminated') {
    throw new PeopleError('ALREADY_TERMINATED', `Employee ${id} is already terminated`);
  }
  if (existing.version !== expectedVersion) {
    throw new PeopleError('CONFLICT', 'Version mismatch', undefined, {
      expected: expectedVersion,
      current: existing.version,
    });
  }

  const allowed = TRANSITIONS[existing.status];
  if (!allowed.includes(newStatus)) {
    throw new PeopleError(
      'VALIDATION',
      `Cannot transition from ${existing.status} to ${newStatus}`,
      'status',
      { current: existing.status, requested: newStatus, allowed },
    );
  }

  if (newStatus === 'terminated' && !exitDate) {
    throw new PeopleError('VALIDATION', 'exitDate required when terminating', 'exitDate');
  }

  // Derive event type from transition
  const eventType =
    newStatus === 'active' && existing.status === 'pre_hire' ? 'EmployeeOnboarded'
    : newStatus === 'terminated' ? 'EmployeeTerminated'
    : 'EmployeeStatusChanged';

  const event = newEvent(eventType, existing.entityId, correlationId, 'employee', id, {
    employeeId: id,
    entityId: existing.entityId,
    fromStatus: existing.status,
    toStatus: newStatus,
    exitDate,
    hireDate: existing.hireDate,
  });

  return repo.updateEmployeeStatus(id, newStatus, exitDate, expectedVersion, event);
}

export async function listEmployees(
  filter: EmployeeFilter,
  repo: PeopleRepo,
): Promise<{ items: EmployeeRecord[]; nextCursor?: string }> {
  return repo.listEmployees(filter);
}
