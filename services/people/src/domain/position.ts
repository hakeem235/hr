import type { PositionRecord, PeopleRepo, WorkflowRole } from './types.js';
import { PeopleError } from './errors.js';
import { newId } from './events.js';

export interface CreatePositionInput {
  employeeId: string;
  title: string;
  grade: string;
  departmentId: string;
  reportsTo?: string;
  workflowRole: WorkflowRole;
  effectiveFrom: string;   // ISO date
  idempotencyKey: string;
}

export async function createPosition(
  input: CreatePositionInput,
  repo: PeopleRepo,
): Promise<PositionRecord> {
  const existing = await repo.findPositionByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    throw new PeopleError('VALIDATION', 'effectiveFrom must be YYYY-MM-DD', 'effectiveFrom');
  }

  // Close any currently-open position for this employee
  const current = await repo.getCurrentPosition(input.employeeId);
  if (current && !current.effectiveTo) {
    // Close the previous position one day before the new one starts
    const closed: PositionRecord = { ...current, effectiveTo: input.effectiveFrom };
    await repo.savePosition(closed);
  }

  const rec: PositionRecord = {
    id: newId('pos'),
    employeeId: input.employeeId,
    title: input.title,
    grade: input.grade,
    departmentId: input.departmentId,
    reportsTo: input.reportsTo,
    workflowRole: input.workflowRole,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: undefined,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
  };

  await repo.savePosition(rec);
  return rec;
}

export async function getCurrentPosition(
  employeeId: string,
  asOf: string | undefined,
  repo: PeopleRepo,
): Promise<PositionRecord | null> {
  return repo.getCurrentPosition(employeeId, asOf);
}

export async function listPositions(
  employeeId: string,
  repo: PeopleRepo,
): Promise<PositionRecord[]> {
  return repo.listPositions(employeeId);
}
