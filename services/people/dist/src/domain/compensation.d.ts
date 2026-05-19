import type { CompensationRecord, PeopleRepo } from './types.js';
export interface CreateCompensationInput {
    employeeId: string;
    basicMinor: number;
    housingMinor?: number;
    transportMinor?: number;
    otherMinor?: number;
    currency?: string;
    effectiveFrom: string;
    idempotencyKey: string;
}
export declare function createCompensation(input: CreateCompensationInput, repo: PeopleRepo): Promise<CompensationRecord>;
export declare function getCurrentCompensation(employeeId: string, asOf: string | undefined, repo: PeopleRepo): Promise<CompensationRecord | null>;
export declare function listCompensation(employeeId: string, repo: PeopleRepo): Promise<CompensationRecord[]>;
