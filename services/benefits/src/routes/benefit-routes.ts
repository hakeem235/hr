import type { FastifyInstance } from 'fastify';
import type { BenefitRepo, EnrollmentStatus } from '../domain/types.js';
import { createEnrollment, activateEnrollment, cancelEnrollment, addDependent, removeDependent } from '../domain/enrollment.js';
import { calculateEosb, type ResignationType } from '../domain/eosb.js';
import { BenefitError, statusFor } from '../domain/errors.js';

const etag = (v: number) => `"${v}"`;
const parseIfMatch = (h: string | undefined): number | null => {
  const m = h?.match(/^"(\d+)"$/);
  return m ? Number(m[1]) : null;
};
const corr = (req: { headers: Record<string, string | string[] | undefined> }) =>
  (req.headers['x-correlation-id'] as string | undefined) ?? globalThis.crypto.randomUUID();

export function registerBenefitRoutes(app: FastifyInstance, repo: BenefitRepo): void {

  app.get('/api/v1/health', async () => ({ status: 'ok', service: 'benefits' }));

  /* ── Benefit plans ───────────────────────────────────────── */

  app.get('/api/v1/benefit-plans', async (req, reply) => {
    const { entityId = 'ent_default' } = req.query as { entityId?: string };
    const plans = await repo.listPlans(entityId);
    return reply.send({ items: plans });
  });

  app.get('/api/v1/benefit-plans/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const plan = await repo.findPlanById(id);
    if (!plan) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Plan ${id} not found` } });
    return reply.header('ETag', etag(plan.version)).send(plan);
  });

  /* ── Enrollments ─────────────────────────────────────────── */

  app.post('/api/v1/enrollments', async (req, reply) => {
    const correlationId = corr(req);
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) return reply.status(422).send({ error: { code: 'VALIDATION', message: 'Idempotency-Key header required' } });
    try {
      const body = req.body as Record<string, unknown>;
      const missing = ['entityId', 'employeeId', 'planId', 'effectiveFrom'].filter((k) => !body?.[k]);
      if (missing.length) return reply.status(422).send({ error: { code: 'VALIDATION', message: `Missing: ${missing.join(', ')}` } });
      const rec = await createEnrollment(
        { entityId: String(body.entityId), employeeId: String(body.employeeId), planId: String(body.planId), effectiveFrom: String(body.effectiveFrom), idempotencyKey },
        repo, correlationId,
      );
      return reply.status(201).header('ETag', etag(rec.version)).send(rec);
    } catch (err) {
      if (err instanceof BenefitError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
      throw err;
    }
  });

  app.get('/api/v1/enrollments', async (req, reply) => {
    const q = req.query as { employeeId?: string; entityId?: string; planId?: string; status?: string; cursor?: string; limit?: string };
    const limit = Math.min(Number(q.limit ?? 20), 100);
    const { items, nextCursor } = await repo.listEnrollments({
      employeeId: q.employeeId, entityId: q.entityId, planId: q.planId,
      status: q.status as EnrollmentStatus | undefined, cursor: q.cursor, limit,
    });
    return reply.send({ items, nextCursor: nextCursor ?? null, limit });
  });

  app.get('/api/v1/enrollments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rec = await repo.findEnrollmentById(id);
    if (!rec) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Enrollment ${id} not found` } });
    return reply.header('ETag', etag(rec.version)).send(rec);
  });

  app.post('/api/v1/enrollments/:id/activate', async (req, reply) => {
    const correlationId = corr(req);
    const { id } = req.params as { id: string };
    const ifMatch = parseIfMatch(req.headers['if-match'] as string | undefined);
    if (ifMatch === null) return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
    try {
      const rec = await activateEnrollment(id, ifMatch, repo, correlationId);
      return reply.header('ETag', etag(rec.version)).send(rec);
    } catch (err) {
      if (err instanceof BenefitError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
      throw err;
    }
  });

  app.post('/api/v1/enrollments/:id/cancel', async (req, reply) => {
    const correlationId = corr(req);
    const { id } = req.params as { id: string };
    const ifMatch = parseIfMatch(req.headers['if-match'] as string | undefined);
    if (ifMatch === null) return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
    try {
      const body = req.body as { effectiveTo?: string };
      const effectiveTo = body?.effectiveTo ?? new Date().toISOString().slice(0, 10);
      const rec = await cancelEnrollment(id, effectiveTo, ifMatch, repo, correlationId);
      return reply.header('ETag', etag(rec.version)).send(rec);
    } catch (err) {
      if (err instanceof BenefitError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
      throw err;
    }
  });

  /* ── Dependents ──────────────────────────────────────────── */

  app.post('/api/v1/enrollments/:id/dependents', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = req.body as Record<string, unknown>;
      const missing = ['nameEn', 'relationship', 'dateOfBirth'].filter((k) => !body?.[k]);
      if (missing.length) return reply.status(422).send({ error: { code: 'VALIDATION', message: `Missing: ${missing.join(', ')}` } });
      const rec = await addDependent(id, {
        nameEn: String(body.nameEn),
        nameAr: body.nameAr as string | undefined,
        relationship: body.relationship as 'spouse' | 'child' | 'parent',
        dateOfBirth: String(body.dateOfBirth),
        nationalId: body.nationalId as string | undefined,
      }, repo);
      return reply.status(201).header('ETag', etag(rec.version)).send(rec);
    } catch (err) {
      if (err instanceof BenefitError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
      throw err;
    }
  });

  app.delete('/api/v1/enrollments/:id/dependents/:depId', async (req, reply) => {
    const { id, depId } = req.params as { id: string; depId: string };
    try {
      const rec = await removeDependent(id, depId, repo);
      return reply.header('ETag', etag(rec.version)).send(rec);
    } catch (err) {
      if (err instanceof BenefitError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  /* ── EOSB calculator ─────────────────────────────────────── */

  app.post('/api/v1/eosb/calculate', async (req, reply) => {
    try {
      const body = req.body as Record<string, unknown>;
      const missing = ['employeeId', 'hireDate', 'exitDate', 'lastBasicMinor', 'resignationType'].filter((k) => body?.[k] === undefined || body?.[k] === null || body?.[k] === '');
      if (missing.length) return reply.status(422).send({ error: { code: 'VALIDATION', message: `Missing: ${missing.join(', ')}` } });
      const result = calculateEosb(
        String(body.employeeId),
        String(body.hireDate),
        String(body.exitDate),
        Number(body.lastBasicMinor),
        String(body.resignationType) as ResignationType,
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof BenefitError) return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field } });
      throw err;
    }
  });
}
