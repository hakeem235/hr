import type { PersonRecord, PersonFilter, PeopleRepo } from './types.js';
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
export declare function createPerson(input: CreatePersonInput, repo: PeopleRepo, correlationId: string): Promise<PersonRecord>;
export declare function updatePerson(id: string, input: UpdatePersonInput, expectedVersion: number, repo: PeopleRepo, correlationId: string): Promise<PersonRecord>;
export declare function listPersons(filter: PersonFilter, repo: PeopleRepo): Promise<{
    items: PersonRecord[];
    nextCursor?: string;
}>;
