/**
 * HTTP routes for the workflow engine (workflow-engine.md §7).
 *
 * The decision endpoint is the ONLY way to act on an approval.
 * Modules never build their own approval endpoints.
 */

import type { FastifyInstance } from 'fastify';
import {
  startWorkflow,
  recordDecision,
  cancelWorkflow,
  WorkflowError,
} from '../engine/executor.js';
import type { WorkflowEngineDeps } from '../engine/types.js';

export function registerWorkflowRoutes(
  app: FastifyInstance,
  deps: WorkflowEngineDeps,
): void {
  // Start a workflow instance (called by modules after domain event submission)
  app.post('/api/v1/workflow-instances', async (req, reply) => {
    const idem = req.headers['idempotency-key'];
    if (!idem || typeof idem !== 'string') {
      return reply.status(400).send({
        error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header is required.' },
      });
    }

    const b = req.body as Record<string, unknown>;
    for (const f of ['trigger', 'entityId', 'context']) {
      if (b?.[f] == null) {
        return reply.status(400).send({
          error: { code: 'INVALID_INPUT', message: `Missing field: ${f}`, field: f },
        });
      }
    }

    const correlationId =
      (req.headers['x-correlation-id'] as string) ?? crypto.randomUUID();

    try {
      const instance = await startWorkflow(
        b.trigger as string,
        b.context as Record<string, unknown>,
        b.entityId as string,
        correlationId,
        deps,
      );
      return reply.status(201).send(instance);
    } catch (e) {
      return handleError(e, req, reply);
    }
  });

  // Get instance state
  app.get('/api/v1/workflow-instances/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const instance = await deps.instances.findById(id);
    if (!instance) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Workflow instance '${id}' not found.` },
      });
    }
    return reply.send(instance);
  });

  // The decision endpoint — the ONLY way to advance an approval step
  app.post(
    '/api/v1/workflow-instances/:id/steps/:stepId/decision',
    async (req, reply) => {
      const { id, stepId } = req.params as { id: string; stepId: string };
      const b = req.body as Record<string, unknown>;

      if (!b?.decision || !['approved', 'declined'].includes(b.decision as string)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_INPUT',
            message: "Field 'decision' must be 'approved' or 'declined'.",
            field: 'decision',
          },
        });
      }

      const actorId = req.headers['x-actor-id'] as string;
      if (!actorId) {
        return reply.status(400).send({
          error: { code: 'MISSING_ACTOR', message: 'X-Actor-Id header is required.' },
        });
      }

      try {
        const instance = await recordDecision(
          id,
          stepId,
          b.decision as string,
          b.note as string | undefined,
          actorId,
          deps,
        );
        return reply.send(instance);
      } catch (e) {
        return handleError(e, req, reply);
      }
    },
  );

  // Cancel a running workflow (requester-initiated, workflow-engine.md §6)
  app.post('/api/v1/workflow-instances/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, unknown>;

    try {
      const instance = await cancelWorkflow(
        id,
        (b?.reason as string) ?? 'Cancelled by requester',
        deps,
      );
      return reply.send(instance);
    } catch (e) {
      return handleError(e, req, reply);
    }
  });

  app.get('/api/v1/health', async () => ({
    status: 'ok',
    service: 'workflow-engine',
  }));
}

function handleError(e: unknown, req: any, reply: any) {
  if (e instanceof WorkflowError) {
    const status =
      e.code === 'NO_DEFINITION' ? 422
      : e.code === 'INSTANCE_NOT_RUNNING' ? 409
      : e.code === 'WRONG_STEP' ? 409
      : e.code === 'NOTE_REQUIRED' ? 422
      : e.code === 'STEP_NOT_ACTIVE' ? 409
      : e.code === 'NOT_FOUND' ? 404
      : 400;
    return reply.status(status).send({
      error: { code: e.code, message: e.message },
    });
  }
  req.log.error(e);
  return reply.status(500).send({
    error: { code: 'INTERNAL', message: 'Unexpected error.' },
  });
}
