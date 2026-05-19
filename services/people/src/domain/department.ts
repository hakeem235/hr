import type { DepartmentRecord, EntityRecord, HolidayRecord, PeopleRepo } from './types.js';
import { PeopleError } from './errors.js';
import { newId, newEvent } from './events.js';

// ─── Entity ───────────────────────────────────────────────────────────────────

export interface CreateEntityInput {
  legalName: string;
  country?: string;
  workWeek?: number[];
}

export async function createEntity(
  input: CreateEntityInput,
  repo: PeopleRepo,
  correlationId: string,
): Promise<EntityRecord> {
  const rec: EntityRecord = {
    id: newId('ent'),
    legalName: input.legalName.trim(),
    country: (input.country ?? 'SA').toUpperCase(),
    workWeek: input.workWeek ?? [0, 1, 2, 3, 4],
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const event = newEvent('EntityCreated', rec.id, correlationId, 'entity', rec.id, {
    entityId: rec.id,
    legalName: rec.legalName,
  });

  await repo.saveEntity(rec, event);
  return rec;
}

export async function updateEntity(
  id: string,
  input: Partial<CreateEntityInput>,
  expectedVersion: number,
  repo: PeopleRepo,
  correlationId: string,
): Promise<EntityRecord> {
  const existing = await repo.findEntityById(id);
  if (!existing) throw new PeopleError('NOT_FOUND', `Entity ${id} not found`);
  if (existing.version !== expectedVersion) {
    throw new PeopleError('CONFLICT', 'Version mismatch', undefined, {
      expected: expectedVersion, current: existing.version,
    });
  }

  const updated: EntityRecord = {
    ...existing,
    legalName: input.legalName?.trim() ?? existing.legalName,
    country: input.country?.toUpperCase() ?? existing.country,
    workWeek: input.workWeek ?? existing.workWeek,
    version: existing.version + 1,
  };

  const event = newEvent('EntityUpdated', id, correlationId, 'entity', id, { entityId: id });
  await repo.saveEntity(updated, event);
  return updated;
}

// ─── Holiday calendar ─────────────────────────────────────────────────────────

export async function upsertHoliday(
  rec: Omit<HolidayRecord, never>,
  repo: PeopleRepo,
): Promise<HolidayRecord> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.holidayDate)) {
    throw new PeopleError('VALIDATION', 'holidayDate must be YYYY-MM-DD', 'holidayDate');
  }
  await repo.upsertHoliday(rec);
  return rec;
}

export async function deleteHoliday(
  entityId: string,
  holidayDate: string,
  repo: PeopleRepo,
): Promise<void> {
  await repo.deleteHoliday(entityId, holidayDate);
}

// ─── Department ───────────────────────────────────────────────────────────────

export interface CreateDepartmentInput {
  entityId: string;
  name: string;
  parentId?: string;
}

export async function createDepartment(
  input: CreateDepartmentInput,
  repo: PeopleRepo,
  correlationId: string,
): Promise<DepartmentRecord> {
  const rec: DepartmentRecord = {
    id: newId('dep'),
    entityId: input.entityId,
    name: input.name.trim(),
    parentId: input.parentId,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const event = newEvent('DepartmentCreated', input.entityId, correlationId, 'department', rec.id, {
    departmentId: rec.id,
    name: rec.name,
    entityId: rec.entityId,
  });

  await repo.saveDepartment(rec, event);
  return rec;
}

export async function updateDepartment(
  id: string,
  input: { name?: string; parentId?: string },
  expectedVersion: number,
  repo: PeopleRepo,
  correlationId: string,
): Promise<DepartmentRecord> {
  const existing = await repo.findDepartmentById(id);
  if (!existing) throw new PeopleError('NOT_FOUND', `Department ${id} not found`);
  if (existing.version !== expectedVersion) {
    throw new PeopleError('CONFLICT', 'Version mismatch', undefined, {
      expected: expectedVersion, current: existing.version,
    });
  }

  const updated: DepartmentRecord = {
    ...existing,
    name: input.name?.trim() ?? existing.name,
    parentId: input.parentId !== undefined ? input.parentId : existing.parentId,
    version: existing.version + 1,
  };

  const event = newEvent('DepartmentUpdated', existing.entityId, correlationId, 'department', id, {
    departmentId: id,
  });

  await repo.saveDepartment(updated, event);
  return updated;
}
