/**
 * Real workflow engine HTTP client.
 * Replaces the stub in index.ts — calls POST /api/v1/workflow-instances
 * on the workflow engine service.
 *
 * The trigger name maps to a workflowId registered in the engine.
 * WORKFLOW_ENGINE_URL defaults to http://localhost:3002 for local dev.
 */
import type { WorkflowClient } from './domain/create-request.js';
import { LeaveError } from './domain/working-days.js';

const TRIGGER_TO_WORKFLOW: Record<string, string> = {
  LeaveRequestSubmitted: 'leave-approval',
  LetterRequested: 'letter-approval',
};

export function createWorkflowClient(baseUrl: string): WorkflowClient {
  return {
    async start(trigger: string, context: Record<string, unknown>): Promise<string> {
      const workflowId = TRIGGER_TO_WORKFLOW[trigger];
      if (!workflowId) {
        throw new LeaveError(
          'WORKFLOW_UNAVAILABLE',
          `No workflow definition mapped for trigger "${trigger}"`,
        );
      }

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/v1/workflow-instances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId, context }),
        });
      } catch (err) {
        throw new LeaveError(
          'WORKFLOW_UNAVAILABLE',
          `Could not reach workflow engine at ${baseUrl}: ${(err as Error).message}`,
        );
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new LeaveError(
          'WORKFLOW_UNAVAILABLE',
          body?.error?.message ?? `Workflow engine returned ${res.status}`,
        );
      }

      const data = await res.json() as { id: string };
      return data.id;
    },
  };
}
