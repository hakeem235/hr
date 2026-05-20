/**
 * HTTP routes for the workflow-sagas service.
 */
import type { FastifyInstance } from 'fastify';
import type { SagaRepo, ActivityContext, SagaName, DomainEvent } from '../domain/types.js';
import { SagaRunner } from '../domain/saga-runner.js';
import { onboardingSaga } from '../sagas/onboarding.js';
import { offboardingSaga } from '../sagas/offboarding.js';

const SAGAS = { onboarding: onboardingSaga, offboarding: offboardingSaga };

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
function nowStr(): string {
  return new Date().toISOString().replace('Z', '+00:00');
}

export function registerSagaRoutes(
  app: FastifyInstance,
  repo: SagaRepo,
  ctx: ActivityContext,
): void {

  // ── Health ────────────────────────────────────────────────────────────────

  app.get('/api/v1/health', async (_req, reply) => {
    reply.send({ status: 'ok', service: 'workflow-sagas', version: '1' });
  });

  // ── Trigger sagas manually ────────────────────────────────────────────────

  app.post('/api/v1/sagas/:sagaName', async (req, reply) => {
    const { sagaName } = req.params as { sagaName: string };
    if (!['onboarding', 'offboarding'].includes(sagaName)) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Unknown saga "${sagaName}"` } });
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }

    const existing = await repo.findByIdempotencyKey(idempotencyKey);
    if (existing) return reply.status(200).send(existing);

    const b = req.body as Record<string, unknown>;
    if (!b?.employeeId || !b?.entityId) {
      return reply.status(400).send({ error: { code: 'INVALID_INPUT', message: 'employeeId and entityId are required' } });
    }

    const saga = await repo.save({
      id: newId('saga'),
      sagaName: sagaName as SagaName,
      entityId: b.entityId as string,
      employeeId: b.employeeId as string,
      correlationId: (b.correlationId as string) ?? newId('corr'),
      idempotencyKey,
      status: 'running',
      context: { ...(b.context as Record<string, unknown> ?? {}), employeeId: b.employeeId, entityId: b.entityId },
      activities: [],
      currentActivityIndex: 0,
      createdAt: nowStr(),
    });

    const def = SAGAS[sagaName as SagaName];
    const runner = new SagaRunner(repo, ctx);

    // Run async — return 202 immediately, client polls /api/v1/sagas/:id
    setImmediate(() => {
      runner.execute(saga, def).catch((e) => {
        app.log.error({ sagaId: saga.id, err: e }, 'Unexpected saga executor error');
      });
    });

    return reply.status(202).send(saga);
  });

  // ── Query sagas ───────────────────────────────────────────────────────────

  app.get('/api/v1/sagas/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const saga = await repo.findById(id);
    if (!saga) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Saga "${id}" not found` } });
    }
    return reply.send(saga);
  });

  app.get('/api/v1/sagas', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const result = await repo.list({
      sagaName: q.sagaName as SagaName | undefined,
      employeeId: q.employeeId,
      entityId: q.entityId,
      status: q.status as any,
      cursor: q.cursor,
      limit: q.limit ? Number(q.limit) : 20,
    });
    return reply.send(result);
  });

  // ── Domain event webhook ──────────────────────────────────────────────────

  app.post('/api/v1/events', async (req, reply) => {
    const event = req.body as DomainEvent;
    if (!event?.eventId || !event?.eventType) {
      return reply.status(400).send({ error: { code: 'INVALID_EVENT', message: 'eventId and eventType are required' } });
    }

    let triggered: string | null = null;

    if (event.eventType === 'EmployeeOnboarded') {
      const p = event.payload as any;
      const existing = await repo.findByIdempotencyKey(`event:${event.eventId}:onboarding`);
      if (!existing && p?.employeeId) {
        const saga = await repo.save({
          id: newId('saga'),
          sagaName: 'onboarding',
          entityId: event.entityId,
          employeeId: p.employeeId,
          correlationId: event.correlationId,
          idempotencyKey: `event:${event.eventId}:onboarding`,
          status: 'running',
          context: {
            employeeId: p.employeeId,
            entityId: event.entityId,
            nationality: p.nationality,
            basicMinor: p.basicMinor,
            hireDate: p.hireDate,
            position: p.position,
            nationalId: p.nationalId,
          },
          activities: [],
          currentActivityIndex: 0,
          createdAt: nowStr(),
        });
        triggered = saga.id;
        setImmediate(() => {
          new SagaRunner(repo, ctx).execute(saga, onboardingSaga).catch((e) => {
            app.log.error({ sagaId: saga.id, err: e }, 'Onboarding saga error');
          });
        });
      }
    } else if (event.eventType === 'EmployeeTerminated') {
      const p = event.payload as any;
      const existing = await repo.findByIdempotencyKey(`event:${event.eventId}:offboarding`);
      if (!existing && p?.employeeId) {
        const saga = await repo.save({
          id: newId('saga'),
          sagaName: 'offboarding',
          entityId: event.entityId,
          employeeId: p.employeeId,
          correlationId: event.correlationId,
          idempotencyKey: `event:${event.eventId}:offboarding`,
          status: 'running',
          context: {
            employeeId: p.employeeId,
            entityId: event.entityId,
            exitDate: p.exitDate,
            terminationReason: p.reason,
            lastBasicMinor: p.lastBasicMinor,
          },
          activities: [],
          currentActivityIndex: 0,
          createdAt: nowStr(),
        });
        triggered = saga.id;
        setImmediate(() => {
          new SagaRunner(repo, ctx).execute(saga, offboardingSaga).catch((e) => {
            app.log.error({ sagaId: saga.id, err: e }, 'Offboarding saga error');
          });
        });
      }
    }

    return reply.send({ eventId: event.eventId, handled: triggered !== null, sagaId: triggered });
  });
}
