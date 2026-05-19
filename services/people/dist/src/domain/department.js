import { PeopleError } from './errors.js';
import { newId, newEvent } from './events.js';
export async function createEntity(input, repo, correlationId) {
    const rec = {
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
export async function updateEntity(id, input, expectedVersion, repo, correlationId) {
    const existing = await repo.findEntityById(id);
    if (!existing)
        throw new PeopleError('NOT_FOUND', `Entity ${id} not found`);
    if (existing.version !== expectedVersion) {
        throw new PeopleError('CONFLICT', 'Version mismatch', undefined, {
            expected: expectedVersion, current: existing.version,
        });
    }
    const updated = {
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
export async function upsertHoliday(rec, repo) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.holidayDate)) {
        throw new PeopleError('VALIDATION', 'holidayDate must be YYYY-MM-DD', 'holidayDate');
    }
    await repo.upsertHoliday(rec);
    return rec;
}
export async function deleteHoliday(entityId, holidayDate, repo) {
    await repo.deleteHoliday(entityId, holidayDate);
}
export async function createDepartment(input, repo, correlationId) {
    const rec = {
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
export async function updateDepartment(id, input, expectedVersion, repo, correlationId) {
    const existing = await repo.findDepartmentById(id);
    if (!existing)
        throw new PeopleError('NOT_FOUND', `Department ${id} not found`);
    if (existing.version !== expectedVersion) {
        throw new PeopleError('CONFLICT', 'Version mismatch', undefined, {
            expected: expectedVersion, current: existing.version,
        });
    }
    const updated = {
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
