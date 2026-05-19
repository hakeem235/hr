/**
 * Real HTTP workflow client — calls POST /api/v1/workflow-instances on the
 * workflow engine. Mirrors leave/wf-client.ts exactly.
 */
import type { WorkflowClient } from './domain/letter.js';
import { LetterError } from './domain/errors.js';

const TRIGGER_TO_WORKFLOW: Record<string, string> = {
  LetterRequested: 'letter-approval',
};

export function createWorkflowClient(baseUrl: string): WorkflowClient {
  return {
    async start(trigger, context) {
      const workflowId = TRIGGER_TO_WORKFLOW[trigger];
      if (!workflowId) {
        throw new LetterError('WORKFLOW_UNAVAILABLE', `No workflow mapped for trigger '${trigger}'`);
      }

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/v1/workflow-instances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId, trigger, context }),
        });
      } catch (err) {
        throw new LetterError(
          'WORKFLOW_UNAVAILABLE',
          `Workflow engine unreachable: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new LetterError(
          'WORKFLOW_UNAVAILABLE',
          `Workflow engine returned ${res.status}: ${body}`,
        );
      }

      const data = await res.json() as { id: string };
      return data.id;
    },
  };
}
