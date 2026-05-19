import type { DelegationRecord, OrgNode, PeopleRepo } from './types.js';
export interface CreateDelegationInput {
    fromEmployeeId: string;
    toEmployeeId: string;
    validFrom: string;
    validUntil: string;
}
export declare function createDelegation(input: CreateDelegationInput, repo: PeopleRepo): Promise<DelegationRecord>;
export declare function deleteDelegation(id: string, repo: PeopleRepo): Promise<void>;
/**
 * Build the OrgNode projection that the workflow engine's ActorStore reads.
 * Joins employee + current position to produce the flat view.
 */
export declare function buildOrgNode(employeeId: string, repo: PeopleRepo, asOf?: string): Promise<OrgNode | null>;
/**
 * Walk up from employeeId to find the nearest active manager.
 * Returns the manager's OrgNode or null if no active manager in chain.
 */
export declare function findActiveManager(employeeId: string, repo: PeopleRepo, asOf?: string): Promise<OrgNode | null>;
/**
 * Find all active employees with the given workflowRole in an entity.
 */
export declare function findByRole(role: string, entityId: string, repo: PeopleRepo, asOf?: string): Promise<OrgNode[]>;
