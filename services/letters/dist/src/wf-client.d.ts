/**
 * Real HTTP workflow client — calls POST /api/v1/workflow-instances on the
 * workflow engine. Mirrors leave/wf-client.ts exactly.
 */
import type { WorkflowClient } from './domain/letter.js';
export declare function createWorkflowClient(baseUrl: string): WorkflowClient;
