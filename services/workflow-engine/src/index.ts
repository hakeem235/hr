/**
 * Workflow engine service entrypoint.
 * Wires in-memory adapters for dev; swap for Postgres adapters in production.
 */

import Fastify from 'fastify';
import { registerWorkflowRoutes } from './routes/workflow-routes.js';
import {
  InMemoryDefinitionRepo,
  InMemoryInstanceRepo,
  InMemoryCalendarRepo,
  InMemoryOrgRepo,
  InMemoryEventPublisher,
} from './db/in-memory.js';
import { createActorResolver } from './engine/actor-resolver.js';
import { createSlaCalculator } from './engine/sla.js';

const app = Fastify({ logger: true });

const definitions = new InMemoryDefinitionRepo();
const instances = new InMemoryInstanceRepo();
const calRepo = new InMemoryCalendarRepo();
const orgRepo = new InMemoryOrgRepo();
const publisher = new InMemoryEventPublisher();

// Seed the leave-approval workflow definition (workflow-engine.md §2 example)
await definitions.save({
  workflowId: 'leave-approval',
  version: 1,
  trigger: 'LeaveRequestSubmitted',
  steps: [
    {
      id: 'manager-review',
      type: 'approval',
      actor: { strategy: 'reports_to', of: '$.requester' },
      sla: { duration: 'PT8H', businessHours: true },
      onTimeout: 'escalate',
      escalateTo: { strategy: 'reports_to', of: '$.step.actor' },
      transitions: [
        { on: 'approved', to: 'hr-confirm' },
        { on: 'declined', to: 'end_declined' },
      ],
    },
    {
      id: 'hr-confirm',
      type: 'approval',
      actor: { strategy: 'role', role: 'hr_ops', scope: '$.requester.entity' },
      condition: '$.request.workingDays > 5',
      onSkip: 'calendar-update',
      transitions: [
        { on: 'approved', to: 'calendar-update' },
        { on: 'declined', to: 'end_declined' },
      ],
    },
    {
      id: 'calendar-update',
      type: 'automated',
      action: 'PublishEvent',
      params: { event: 'LeaveApproved' },
      transitions: [{ on: 'success', to: 'end_approved' }],
    },
    { id: 'end_approved', type: 'terminal', result: 'approved' },
    { id: 'end_declined', type: 'terminal', result: 'declined' },
  ],
});

registerWorkflowRoutes(app, {
  definitions,
  instances,
  actors: createActorResolver(orgRepo),
  sla: createSlaCalculator(calRepo),
  events: publisher,
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
