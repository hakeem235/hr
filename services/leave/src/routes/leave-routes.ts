/**
 * HTTP layer for the leave module. Thin: validates input, calls domain logic,
 * maps LeaveError → the standard error envelope (leave-api.md).
 *
 * Repo/workflow adapters are injected so this file stays infra-free. Wire real
 * Postgres + workflow-engine adapters in src/index.ts.
 */
import type { FastifyInstance } from 'fastify';
import { createLeaveRequest, type LeaveRepo, type WorkflowClient } from '../domain/create-request.js';
import { LeaveError, statusFor, type WorkingCalendar } from '../domain/working-days.js';

interface Deps {
  repo: LeaveRepo;
  wf: WorkflowClient;
  /** Resolves the working calendar for an entity (work week + holidays). */
  calendarFor(entityId: string): Promise<WorkingCalendar>;
}

export function registerLeaveRoutes(app: FastifyInstance, deps: Deps): void {
  app.post('/api/v1/leave-requests', async (req, reply) => {
    const idem = req.headers['idempotency-key'];
    if (!idem || typeof idem !== 'string') {
      return reply.status(400).send({
        error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header is required.' },
      });
    }
    const correlationId =
      (req.headers['x-correlation-id'] as string) ?? crypto.randomUUID();

    const b = req.body as Record<string, unknown>;
    for (const f of ['entityId', 'employeeId', 'leaveTypeId', 'startDate', 'endDate']) {
      if (!b?.[f]) {
        return reply.status(400).send({
          error: { code: 'INVALID_INPUT', message: `Missing field: ${f}`, field: f },
        });
      }
    }

    try {
      const cal = await deps.calendarFor(b.entityId as string);
      const rec = await createLeaveRequest(
        {
          entityId: b.entityId as string,
          employeeId: b.employeeId as string,
          leaveTypeId: b.leaveTypeId as string,
          startDate: b.startDate as string,
          endDate: b.endDate as string,
          reason: b.reason as string | undefined,
          attachments: b.attachments as string[] | undefined,
          idempotencyKey: idem,
        },
        cal, deps.repo, deps.wf, correlationId,
      );
      return reply.status(201).send(rec);
    } catch (e) {
      if (e instanceof LeaveError) {
        return reply.status(statusFor(e.code)).send({
          error: { code: e.code, message: e.message, field: e.field, details: e.details },
        });
      }
      req.log.error(e);
      return reply.status(500).send({
        error: { code: 'INTERNAL', message: 'Unexpected error.' },
      });
    }
  });

  app.get('/api/v1/health', async () => ({ status: 'ok', service: 'leave' }));
}
