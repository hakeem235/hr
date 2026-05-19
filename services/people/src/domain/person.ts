import type { PersonRecord, PersonFilter, PeopleRepo, DomainEvent } from './types.js';
import { PeopleError } from './errors.js';
import { newId, newEvent } from './events.js';

export interface CreatePersonInput {
  fullNameEn: string;
  fullNameAr?: string;
  nationality: string;
  dateOfBirth: string;
  nationalId?: string;
  idempotencyKey: string;
}

export interface UpdatePersonInput {
  fullNameEn?: string;
  fullNameAr?: string;
  nationalId?: string;
}

export async function createPerson(
  input: CreatePersonInput,
  repo: PeopleRepo,
  correlationId: string,
): Promise<PersonRecord> {
  const existing = await repo.findPersonByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  if (!input.fullNameEn.trim()) {
    throw new PeopleError('VALIDATION', 'fullNameEn is required', 'fullNameEn');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
    throw new PeopleError('VALIDATION', 'dateOfBirth must be YYYY-MM-DD', 'dateOfBirth');
  }

  const now = new Date().toISOString();
  const rec: PersonRecord = {
    id: newId('per'),
    fullNameEn: input.fullNameEn.trim(),
    fullNameAr: input.fullNameAr?.trim(),
    nationality: input.nationality.toUpperCase(),
    dateOfBirth: input.dateOfBirth,
    nationalId: input.nationalId,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    version: 1,
  };

  const event = newEvent('PersonCreated', 'system', correlationId, 'person', rec.id, {
    personId: rec.id,
    fullNameEn: rec.fullNameEn,
    nationality: rec.nationality,
  });

  await repo.savePerson(rec, event);
  return rec;
}

export async function updatePerson(
  id: string,
  input: UpdatePersonInput,
  expectedVersion: number,
  repo: PeopleRepo,
  correlationId: string,
): Promise<PersonRecord> {
  const existing = await repo.findPersonById(id);
  if (!existing) throw new PeopleError('NOT_FOUND', `Person ${id} not found`);
  if (existing.version !== expectedVersion) {
    throw new PeopleError('CONFLICT', 'Version mismatch', undefined, {
      expected: expectedVersion,
      current: existing.version,
    });
  }

  const now = new Date().toISOString();
  const updated: PersonRecord = {
    ...existing,
    fullNameEn: input.fullNameEn?.trim() ?? existing.fullNameEn,
    fullNameAr: input.fullNameAr !== undefined ? input.fullNameAr?.trim() : existing.fullNameAr,
    nationalId: input.nationalId !== undefined ? input.nationalId : existing.nationalId,
    version: existing.version + 1,
    // createdAt unchanged
  };
  // update is not time-stamped on PersonRecord (immutable identity) — version is the signal

  const event = newEvent('PersonUpdated', 'system', correlationId, 'person', id, {
    personId: id,
    changes: input,
  });

  await repo.savePerson(updated, event);
  return updated;
}

export async function listPersons(
  filter: PersonFilter,
  repo: PeopleRepo,
): Promise<{ items: PersonRecord[]; nextCursor?: string }> {
  return repo.listPersons(filter);
}
