import { LeaveError } from './domain/working-days.js';
const TRIGGER_TO_WORKFLOW = {
    LeaveRequestSubmitted: 'leave-approval',
    LetterRequested: 'letter-approval',
};
export function createWorkflowClient(baseUrl) {
    return {
        async start(trigger, context) {
            const workflowId = TRIGGER_TO_WORKFLOW[trigger];
            if (!workflowId) {
                throw new LeaveError('WORKFLOW_UNAVAILABLE', `No workflow definition mapped for trigger "${trigger}"`);
            }
            let res;
            try {
                res = await fetch(`${baseUrl}/api/v1/workflow-instances`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workflowId, context }),
                });
            }
            catch (err) {
                throw new LeaveError('WORKFLOW_UNAVAILABLE', `Could not reach workflow engine at ${baseUrl}: ${err.message}`);
            }
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new LeaveError('WORKFLOW_UNAVAILABLE', body?.error?.message ?? `Workflow engine returned ${res.status}`);
            }
            const data = await res.json();
            return data.id;
        },
    };
}
