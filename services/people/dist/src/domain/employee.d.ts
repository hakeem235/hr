import type { EmployeeRecord, EmploymentStatus, EmployeeFilter, PeopleRepo } from './types.js';
export interface CreateEmployeeInput {
    personId: string;
    entityId: string;
    employeeNo: string;
    hireDate: string;
    idempotencyKey: string;
}
export declare function createEmployee(input: CreateEmployeeInput, repo: PeopleRepo, correlationId: string): Promise<EmployeeRecord>;
export declare function updateEmployeeStatus(id: string, newStatus: EmploymentStatus, exitDate: string | undefined, expectedVersion: number, repo: PeopleRepo, correlationId: string): Promise<EmployeeRecord>;
export declare function listEmployees(filter: EmployeeFilter, repo: PeopleRepo): Promise<{
    items: EmployeeRecord[];
    nextCursor?: string;
}>;
