import { LetterError } from './domain/errors.js';
const TRIGGER_TO_WORKFLOW = {
    LetterRequested: 'letter-approval',
};
export function createWorkflowClient(baseUrl) {
    return {
        async start(trigger, context) {
            const workflowId = TRIGGER_TO_WORKFLOW[trigger];
            if (!workflowId) {
                throw new LetterError('WORKFLOW_UNAVAILABLE', `No workflow mapped for trigger '${trigger}'`);
            }
            let res;
            try {
                res = await fetch(`${baseUrl}/api/v1/workflow-instances`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workflowId, trigger, context }),
                });
            }
            catch (err) {
                throw new LetterError('WORKFLOW_UNAVAILABLE', `Workflow engine unreachable: ${err instanceof Error ? err.message : String(err)}`);
            }
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new LetterError('WORKFLOW_UNAVAILABLE', `Workflow engine returned ${res.status}: ${body}`);
            }
            const data = await res.json();
            return data.id;
        },
    };
}
