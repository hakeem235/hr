/**
 * Actor resolution strategies (workflow-engine.md §4).
 * Resolved at step activation, not workflow start — org chart may change.
 * Every strategy is delegation-aware: active delegations checked first.
 */
import type { ActorSpec } from './types.js';
export interface OrgNode {
    employeeId: string;
    managerId?: string;
    role: string;
    entityId: string;
    departmentId?: string;
    isActive: boolean;
}
export interface Delegation {
    fromEmployeeId: string;
    toEmployeeId: string;
    /** ISO date range */
    validFrom: string;
    validUntil: string;
}
export interface ActorStore {
    findEmployee(employeeId: string): Promise<OrgNode | null>;
    findManager(employeeId: string): Promise<OrgNode | null>;
    findByRole(role: string, entityId: string): Promise<OrgNode[]>;
    getActiveDelegation(employeeId: string): Promise<Delegation | null>;
}
/**
 * Resolve the actor for a step.
 * Returns the employee id who should act, after checking delegations.
 */
export declare function resolveActor(spec: ActorSpec, context: Record<string, unknown>, store: ActorStore): Promise<string>;
