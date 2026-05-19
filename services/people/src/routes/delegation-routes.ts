import type { FastifyInstance } from 'fastify';
import type { PeopleRepo } from '../domain/types.js';
import { createDelegation, deleteDelegation } from '../domain/delegation.js';
import { PeopleError, statusFor } from '../domain/errors.js';

export function registerDelegationRoutes(app: FastifyInstance, repo: PeopleRepo): void {

  // POST /api/v1/delegations
  app.post('/api/v1/delegations', async (req, reply) => {
    try {
      const body = req.body as Record<string, unknown>;
      if (!body?.fromEmployeeId || !body?.toEmployeeId || !body?.validFrom || !body?.validUntil) {
        return reply.status(422).send({ error: { code: 'VALIDATION', message: 'fromEmployeeId, toEmployeeId, validFrom, validUntil are required' } });
      }
      const rec = await createDelegation(
        { fromEmployeeId: String(body.fromEmployeeId), toEmployeeId: String(body.toEmployeeId), validFrom: String(body.validFrom), validUntil: String(body.validUntil) },
        repo,
      );
      return reply.status(201).send(rec);
    } catch (err) {
      if (err instanceof PeopleError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
      throw err;
    }
  });

  // GET /api/v1/delegations?fromEmployeeId=
  app.get('/api/v1/delegations', async (req, reply) => {
    const { fromEmployeeId } = req.query as { fromEmployeeId?: string };
    if (!fromEmployeeId) return reply.status(422).send({ error: { code: 'VALIDATION', message: 'fromEmployeeId query param required' } });
    const items = await repo.listDelegations(fromEmployeeId);
    return reply.send({ items });
  });

  // DELETE /api/v1/delegations/:id
  app.delete('/api/v1/delegations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deleteDelegation(id, repo);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof PeopleError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });
}
