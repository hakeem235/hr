import type { DepartmentRecord, EntityRecord, HolidayRecord, PeopleRepo } from './types.js';
export interface CreateEntityInput {
    legalName: string;
    country?: string;
    workWeek?: number[];
}
export declare function createEntity(input: CreateEntityInput, repo: PeopleRepo, correlationId: string): Promise<EntityRecord>;
export declare function updateEntity(id: string, input: Partial<CreateEntityInput>, expectedVersion: number, repo: PeopleRepo, correlationId: string): Promise<EntityRecord>;
export declare function upsertHoliday(rec: Omit<HolidayRecord, never>, repo: PeopleRepo): Promise<HolidayRecord>;
export declare function deleteHoliday(entityId: string, holidayDate: string, repo: PeopleRepo): Promise<void>;
export interface CreateDepartmentInput {
    entityId: string;
    name: string;
    parentId?: string;
}
export declare function createDepartment(input: CreateDepartmentInput, repo: PeopleRepo, correlationId: string): Promise<DepartmentRecord>;
export declare function updateDepartment(id: string, input: {
    name?: string;
    parentId?: string;
}, expectedVersion: number, repo: PeopleRepo, correlationId: string): Promise<DepartmentRecord>;
