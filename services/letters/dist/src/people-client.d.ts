/**
 * Client for fetching employee + entity data from the people service.
 * Mirrors wf-client.ts pattern.
 */
import type { EmployeeData, EntityData } from './renderer/index.js';
export interface PeopleClient {
    getEmployee(employeeId: string): Promise<EmployeeData | null>;
    getEntity(entityId: string): Promise<EntityData | null>;
}
export declare function createPeopleClient(baseUrl: string): PeopleClient;
export declare function createFallbackPeopleClient(httpClient: PeopleClient): PeopleClient;
