import type { PositionRecord, PeopleRepo, WorkflowRole } from './types.js';
export interface CreatePositionInput {
    employeeId: string;
    title: string;
    grade: string;
    departmentId: string;
    reportsTo?: string;
    workflowRole: WorkflowRole;
    effectiveFrom: string;
    idempotencyKey: string;
}
export declare function createPosition(input: CreatePositionInput, repo: PeopleRepo): Promise<PositionRecord>;
export declare function getCurrentPosition(employeeId: string, asOf: string | undefined, repo: PeopleRepo): Promise<PositionRecord | null>;
export declare function listPositions(employeeId: string, repo: PeopleRepo): Promise<PositionRecord[]>;
