/**
 * CRUD routes for workflow definitions.
 * Definitions are versioned JSON — HR admins edit via these endpoints
 * (or the future visual builder). Soft-delete only; instances pin their version.
 */
import type { FastifyInstance } from 'fastify';
import type { EngineRepo } from '../domain/executor.js';
import type { WorkflowDefinition } from '../domain/types.js';

export function registerDefinitionRoutes(app: FastifyInstance, repo: EngineRepo): void {

  /* ── List definitions ──────────────────────────────────────── */
  app.get('/api/v1/workflow-definitions', async (_req, reply) => {
    const defs = (repo as any).listDefinitions?.() ?? [];
    return reply.send(Array.isArray(defs) ? defs : await defs);
  });

  /* ── Get a specific version ────────────────────────────────── */
  app.get('/api/v1/workflow-definitions/:workflowId', async (req, reply) => {
    const { workflowId } = req.params as { workflowId: string };
    const { version } = req.query as { version?: string };
    const def = version
      ? await repo.getDefinition(workflowId, Number(version))
      : await repo.getLatestDefinition(workflowId);
    if (!def) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Definition "${workflowId}" not found` } });
    }
    return reply.send(def);
  });

  /* ── Create or publish a new version ──────────────────────── */
  app.post('/api/v1/workflow-definitions', async (req, reply) => {
    const b = req.body as Partial<WorkflowDefinition>;
    if (!b.workflowId || !b.steps || !b.trigger) {
      return reply.status(400).send({
        error: { code: 'INVALID_INPUT', message: 'workflowId, trigger, and steps are required' },
      });
    }
    const latest = await repo.getLatestDefinition(b.workflowId);
    const def: WorkflowDefinition = {
      workflowId: b.workflowId,
      version: (latest?.version ?? 0) + 1,
      trigger: b.trigger,
      steps: b.steps,
    };
    await repo.saveDefinition(def);
    return reply.status(201).send(def);
  });

  /* ── Soft-delete a definition ──────────────────────────────── */
  app.delete('/api/v1/workflow-definitions/:workflowId', async (req, reply) => {
    const { workflowId } = req.params as { workflowId: string };
    const def = await repo.getLatestDefinition(workflowId);
    if (!def) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Definition "${workflowId}" not found` } });
    }
    const deleted: WorkflowDefinition = { ...def, deletedAt: new Date().toISOString() };
    await repo.saveDefinition(deleted);
    return reply.status(200).send({ deleted: true, workflowId, version: deleted.version });
  });
}
