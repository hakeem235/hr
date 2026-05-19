/**
 * Real workflow engine HTTP client.
 * Replaces the stub in index.ts — calls POST /api/v1/workflow-instances
 * on the workflow engine service.
 *
 * The trigger name maps to a workflowId registered in the engine.
 * WORKFLOW_ENGINE_URL defaults to http://localhost:3002 for local dev.
 */
import type { WorkflowClient } from './domain/create-request.js';
export declare function createWorkflowClient(baseUrl: string): WorkflowClient;
