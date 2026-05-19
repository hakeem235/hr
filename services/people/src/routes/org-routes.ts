/**
 * ActorStore HTTP API — consumed by the workflow engine's HTTP adapter.
 * These four endpoints implement the ActorStore contract from actor-resolver.ts.
 */
import type { FastifyInstance } from 'fastify';
import type { PeopleRepo } from '../domain/types.js';
import { buildOrgNode, findActiveManager, findByRole } from '../domain/delegation.js';

export function registerOrgRoutes(app: FastifyInstance, repo: PeopleRepo): void {

  // GET /api/v1/employees/:id/org-node
  // Returns the OrgNode projection used by the workflow engine.
  app.get('/api/v1/employees/:id/org-node', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { asOf?: string };
    const node = await buildOrgNode(id, repo, q.asOf);
    if (!node) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Employee ${id} not found` } });
    return reply.send(node);
  });

  // GET /api/v1/employees/:id/manager
  // Returns the OrgNode of the employee's current active manager.
  app.get('/api/v1/employees/:id/manager', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { asOf?: string };
    const node = await findActiveManager(id, repo, q.asOf);
    if (!node) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `No active manager found for employee ${id}` } });
    return reply.send(node);
  });

  // GET /api/v1/employees/:id/delegation?asOf=
  // Returns the active delegation if one exists (workflow engine delegation check).
  app.get('/api/v1/employees/:id/delegation', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { asOf?: string };
    const asOf = q.asOf ?? new Date().toISOString().slice(0, 10);
    const delegation = await repo.getActiveDelegation(id, asOf);
    if (!delegation) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `No active delegation for employee ${id}` } });
    return reply.send(delegation);
  });
}
