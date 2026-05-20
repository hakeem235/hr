/**
 * HTTP routes for the integrations service.
 * All endpoints follow the API conventions in CLAUDE.md §6.
 */
import type { FastifyInstance } from 'fastify';
import type { IntegrationsRepo } from '../domain/types.js';
import { gosiEnroll, gosiExit, gosiRecalculate, previewGosiContributions } from '../domain/gosi.js';
import { mudadSubmitWps } from '../domain/mudad.js';
import {
  qiwaRegisterContract, qiwaTerminateContract,
  muqeemProcessIqama, cchiEnroll, cchiTerminate,
} from '../domain/qiwa-muqeem-cchi.js';
import { handleDomainEvent } from '../domain/events.js';

export function registerRoutes(app: FastifyInstance, repo: IntegrationsRepo): void {

  // ── Health ────────────────────────────────────────────────────────────────

  app.get('/api/v1/health', async (_req, reply) => {
    reply.send({ status: 'ok', service: 'integrations', version: '1' });
  });

  // ── GOSI ──────────────────────────────────────────────────────────────────

  /** Enroll employee in GOSI (day 1 — triggered by EmployeeOnboarded or manual) */
  app.post('/api/v1/gosi/enrollments', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }
    const b = req.body as Record<string, unknown>;
    try {
      const result = await gosiEnroll({
        idempotencyKey,
        entityId: b.entityId as string,
        employeeId: b.employeeId as string,
        nationality: b.nationality as string,
        basicMinor: b.basicMinor as number,
        hireDate: b.hireDate as string,
      }, repo);
      return reply.status(result.retryCount === 0 && result.status === 'confirmed' ? 201 : 200).send(result);
    } catch (e: any) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: e.message } });
    }
  });

  /** GOSI exit notification (triggered by EmployeeTerminated or manual) */
  app.post('/api/v1/gosi/enrollments/:employeeId/exit', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }
    const { employeeId } = req.params as { employeeId: string };
    const b = req.body as Record<string, unknown>;
    const result = await gosiExit({
      idempotencyKey,
      entityId: b.entityId as string,
      employeeId,
      exitDate: b.exitDate as string,
      lastBasicMinor: b.lastBasicMinor as number,
    }, repo);
    return reply.status(200).send(result);
  });

  /** GOSI contribution recalculation (triggered by CompensationChanged) */
  app.post('/api/v1/gosi/enrollments/:employeeId/recalculate', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }
    const { employeeId } = req.params as { employeeId: string };
    const b = req.body as Record<string, unknown>;
    const result = await gosiRecalculate({
      idempotencyKey,
      entityId: b.entityId as string,
      employeeId,
      nationality: b.nationality as string,
      oldBasicMinor: b.oldBasicMinor as number,
      newBasicMinor: b.newBasicMinor as number,
      effectiveDate: b.effectiveDate as string,
    }, repo);
    return reply.status(200).send(result);
  });

  /** Get GOSI submissions for an employee */
  app.get('/api/v1/gosi/enrollments/:employeeId', async (req, reply) => {
    const { employeeId } = req.params as { employeeId: string };
    const submissions = await repo.findByEmployee(employeeId);
    const gosiSubs = submissions.filter(s => s.system === 'gosi');
    return reply.send({ items: gosiSubs });
  });

  /** Utility: preview GOSI contributions without submitting */
  app.post('/api/v1/gosi/preview', async (req, reply) => {
    const b = req.body as Record<string, unknown>;
    const preview = previewGosiContributions(
      b.nationality as string,
      b.basicMinor as number,
    );
    return reply.send(preview);
  });

  // ── Mudad / WPS ────────────────────────────────────────────────────────────

  /** Submit WPS file for a payroll run */
  app.post('/api/v1/mudad/wps-submissions', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }
    const b = req.body as Record<string, unknown>;
    try {
      const result = await mudadSubmitWps({
        idempotencyKey,
        entityId: b.entityId as string,
        payrollRunId: b.payrollRunId as string,
        period: b.period as string,
        lines: b.lines as any,
      }, repo);
      return reply.status(201).send(result);
    } catch (e: any) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: e.message } });
    }
  });

  app.get('/api/v1/mudad/wps-submissions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const sub = await repo.findById(id);
    if (!sub || sub.system !== 'mudad') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Submission "${id}" not found` } });
    }
    return reply.send(sub);
  });

  // ── Qiwa ──────────────────────────────────────────────────────────────────

  app.post('/api/v1/qiwa/contracts', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }
    const b = req.body as Record<string, unknown>;
    const result = await qiwaRegisterContract({
      idempotencyKey,
      entityId: b.entityId as string,
      employeeId: b.employeeId as string,
      nationalId: b.nationalId as string,
      position: b.position as string,
      startDate: b.startDate as string,
      contractType: (b.contractType as any) ?? 'indefinite',
      contractEndDate: b.contractEndDate as string | undefined,
    }, repo);
    return reply.status(201).send(result);
  });

  app.post('/api/v1/qiwa/contracts/:employeeId/terminate', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }
    const { employeeId } = req.params as { employeeId: string };
    const b = req.body as Record<string, unknown>;
    const result = await qiwaTerminateContract({
      idempotencyKey,
      entityId: b.entityId as string,
      employeeId,
      exitDate: b.exitDate as string,
      reason: b.reason as string,
    }, repo);
    return reply.status(200).send(result);
  });

  // ── Muqeem ────────────────────────────────────────────────────────────────

  app.post('/api/v1/muqeem/iqama', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }
    const b = req.body as Record<string, unknown>;
    const result = await muqeemProcessIqama({
      idempotencyKey,
      entityId: b.entityId as string,
      employeeId: b.employeeId as string,
      iqamaNumber: b.iqamaNumber as string,
      passportNumber: b.passportNumber as string,
      expiryDate: b.expiryDate as string,
      action: (b.action as 'renew' | 'exit') ?? 'renew',
    }, repo);
    return reply.status(201).send(result);
  });

  // ── CCHI ──────────────────────────────────────────────────────────────────

  app.post('/api/v1/cchi/enrollments', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }
    const b = req.body as Record<string, unknown>;
    const result = await cchiEnroll({
      idempotencyKey,
      entityId: b.entityId as string,
      employeeId: b.employeeId as string,
      enrollmentId: b.enrollmentId as string,
      planCode: b.planCode as string,
      memberId: b.memberId as string | undefined,
      dependents: b.dependents as any,
    }, repo);
    return reply.status(201).send(result);
  });

  app.post('/api/v1/cchi/enrollments/:enrollmentId/terminate', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header required' } });
    }
    const { enrollmentId } = req.params as { enrollmentId: string };
    const b = req.body as Record<string, unknown>;
    const result = await cchiTerminate({
      idempotencyKey,
      entityId: b.entityId as string,
      employeeId: b.employeeId as string,
      enrollmentId,
      planCode: b.planCode as string,
    }, repo);
    return reply.status(200).send(result);
  });

  // ── Submissions list (cross-system) ───────────────────────────────────────

  app.get('/api/v1/submissions', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const result = await repo.list({
      system: q.system as any,
      status: q.status as any,
      employeeId: q.employeeId,
      entityId: q.entityId,
      cursor: q.cursor,
      limit: q.limit ? Number(q.limit) : 20,
    });
    return reply.send(result);
  });

  app.get('/api/v1/submissions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const sub = await repo.findById(id);
    if (!sub) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Submission "${id}" not found` } });
    }
    return reply.send(sub);
  });

  // ── Domain event webhook ──────────────────────────────────────────────────

  /**
   * POST /api/v1/events — receive domain events from other services.
   * Until Kafka/NATS is live, services call this directly.
   * Idempotent: duplicate events with the same eventId are safely ignored.
   */
  app.post('/api/v1/events', async (req, reply) => {
    const event = req.body as Record<string, unknown>;
    if (!event?.eventId || !event?.eventType) {
      return reply.status(400).send({ error: { code: 'INVALID_EVENT', message: 'eventId and eventType are required' } });
    }

    const result = await handleDomainEvent(event as any, repo);
    return reply.send({ eventId: event.eventId, handled: result.handled, actions: result.actions });
  });
}
