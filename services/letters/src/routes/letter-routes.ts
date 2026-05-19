/**
 * HTTP layer for the letters module.
 * Thin: validates input, calls domain logic, maps errors → standard envelope.
 */
import type { FastifyInstance } from 'fastify';
import {
  createLetterRequest,
  cancelLetterRequest,
  markLetterIssued,
  type LetterRepo,
  type WorkflowClient,
  type LetterStatus,
} from '../domain/letter.js';
import { getLetterTypes, getLetterPolicy } from '../domain/letter-types.js';
import { LetterError, statusFor } from '../domain/errors.js';

interface Deps {
  repo: LetterRepo;
  wf: WorkflowClient;
}

function correlationId(req: { headers: Record<string, unknown> }): string {
  return (req.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
}

function etag(version: number): string { return `"${version}"`; }

function parseIfMatch(header: string | undefined): number | null {
  const m = header?.match(/^"(\d+)"$/);
  return m ? Number(m[1]) : null;
}

export function registerLetterRoutes(app: FastifyInstance, deps: Deps): void {
  const { repo, wf } = deps;

  /* ── Health ──────────────────────────────────────────────── */
  app.get('/api/v1/health', async () => ({ status: 'ok', service: 'letters' }));

  /* ── Letter types ────────────────────────────────────────── */
  app.get('/api/v1/letter-types', async (req, reply) => {
    const { entityId = 'ent_default' } = req.query as { entityId?: string };
    return reply.send(getLetterTypes(entityId));
  });

  /* ── Letter policies ─────────────────────────────────────── */
  app.get('/api/v1/letter-policies/:typeId', async (req, reply) => {
    const { typeId } = req.params as { typeId: string };
    const policy = getLetterPolicy(typeId);
    if (!policy) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `No policy for type '${typeId}'` } });
    }
    return reply.send(policy);
  });

  /* ── Create letter request ───────────────────────────────── */
  app.post('/api/v1/letter-requests', async (req, reply) => {
    const corrId = correlationId(req);
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(422).send({ error: { code: 'VALIDATION', message: 'Idempotency-Key header required' } });
    }

    try {
      const body = req.body as Record<string, unknown>;
      const missing = ['entityId', 'employeeId', 'letterTypeId', 'purpose', 'language'].filter((k) => !body?.[k]);
      if (missing.length) {
        return reply.status(422).send({ error: { code: 'VALIDATION', message: `Missing required fields: ${missing.join(', ')}` } });
      }

      const rec = await createLetterRequest(
        {
          entityId: String(body.entityId),
          employeeId: String(body.employeeId),
          letterTypeId: String(body.letterTypeId),
          purpose: String(body.purpose),
          recipientName: body.recipientName as string | undefined,
          language: body.language as 'en' | 'ar' | 'bilingual',
          idempotencyKey,
        },
        repo, wf, corrId,
      );
      return reply.status(201).header('ETag', etag(rec.version)).send(rec);
    } catch (err) {
      if (err instanceof LetterError) {
        return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
      }
      throw err;
    }
  });

  /* ── List letter requests ────────────────────────────────── */
  app.get('/api/v1/letter-requests', async (req, reply) => {
    const q = req.query as { employeeId?: string; entityId?: string; status?: string; cursor?: string; limit?: string };
    const limit = Math.min(Number(q.limit ?? 20), 100);
    const { items, nextCursor } = await repo.listRequests({
      employeeId: q.employeeId,
      entityId: q.entityId,
      status: q.status as LetterStatus | undefined,
      cursor: q.cursor,
      limit,
    });
    return reply.send({ items, nextCursor: nextCursor ?? null, limit });
  });

  /* ── Get letter request ──────────────────────────────────── */
  app.get('/api/v1/letter-requests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rec = await repo.findById(id);
    if (!rec) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Letter request ${id} not found` } });
    return reply.header('ETag', etag(rec.version)).send(rec);
  });

  /* ── Cancel ──────────────────────────────────────────────── */
  app.post('/api/v1/letter-requests/:id/cancel', async (req, reply) => {
    const corrId = correlationId(req);
    const { id } = req.params as { id: string };
    const ifMatch = parseIfMatch(req.headers['if-match'] as string | undefined);
    if (ifMatch === null) {
      return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
    }

    try {
      const body = req.body as { requesterId: string } | undefined;
      if (!body?.requesterId) {
        return reply.status(422).send({ error: { code: 'VALIDATION', message: 'requesterId required in body' } });
      }
      const rec = await cancelLetterRequest(id, body.requesterId, ifMatch, repo, corrId);
      return reply.header('ETag', etag(rec.version)).send(rec);
    } catch (err) {
      if (err instanceof LetterError) {
        const http = err.code === 'NOT_FOUND' ? 404
          : err.code === 'FORBIDDEN' ? 403
          : err.code === 'CONFLICT'  ? 409
          : statusFor(err.code);
        return reply.status(http).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
      }
      throw err;
    }
  });

  /* ── Mark issued (internal — called by workflow event handler) */
  app.post('/api/v1/letter-requests/:id/issue', async (req, reply) => {
    const corrId = correlationId(req);
    const { id } = req.params as { id: string };
    const ifMatch = parseIfMatch(req.headers['if-match'] as string | undefined);
    if (ifMatch === null) {
      return reply.status(428).send({ error: { code: 'PRECONDITION_REQUIRED', message: 'If-Match header required' } });
    }

    try {
      const body = req.body as { documentId: string } | undefined;
      if (!body?.documentId) {
        return reply.status(422).send({ error: { code: 'VALIDATION', message: 'documentId required in body' } });
      }
      const rec = await markLetterIssued(id, body.documentId, ifMatch, repo, corrId);
      return reply.header('ETag', etag(rec.version)).send(rec);
    } catch (err) {
      if (err instanceof LetterError) {
        return reply.status(statusFor(err.code)).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
      }
      throw err;
    }
  });
}
