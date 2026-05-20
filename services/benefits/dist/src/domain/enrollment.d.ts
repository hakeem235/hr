import type { EnrollmentRecord, BenefitRepo, Dependent } from './types.js';
export interface CreateEnrollmentInput {
    entityId: string;
    employeeId: string;
    planId: string;
    effectiveFrom: string;
    idempotencyKey: string;
}
export declare function createEnrollment(input: CreateEnrollmentInput, repo: BenefitRepo, correlationId: string): Promise<EnrollmentRecord>;
export declare function activateEnrollment(id: string, expectedVersion: number, repo: BenefitRepo, correlationId: string): Promise<EnrollmentRecord>;
export declare function cancelEnrollment(id: string, effectiveTo: string, expectedVersion: number, repo: BenefitRepo, correlationId: string): Promise<EnrollmentRecord>;
export declare function addDependent(enrollmentId: string, input: Omit<Dependent, 'id' | 'enrollmentId' | 'addedAt'>, repo: BenefitRepo): Promise<EnrollmentRecord>;
export declare function removeDependent(enrollmentId: string, dependentId: string, repo: BenefitRepo): Promise<EnrollmentRecord>;
