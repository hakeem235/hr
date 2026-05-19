# @hr/leave — reference module

This is the **template** every other module copies (CLAUDE.md §6). It
demonstrates the locked conventions end to end.

## Structure

```
src/
  domain/
    working-days.ts     server-side day calc + error model (pure, tested)
    create-request.ts   creation flow: idempotency, balance, wf delegation, outbox
  routes/
    leave-routes.ts     thin HTTP layer, error-envelope mapping
  index.ts              composition root — wire real Postgres + wf adapters here
test/
  domain.test.ts        9 tests, all green
```

## What it shows (copy these patterns)

1. **Server-side duration** — `workingDays` never trusts the client; computed
   against the entity working calendar (KSA Sun–Thu + holidays).
2. **Idempotency** — `Idempotency-Key` required; retried POST returns the prior
   record instead of double-submitting.
3. **Validation order** — duration → overlap → balance, each mapping to the
   standard error envelope with correct HTTP status.
4. **Workflow delegation** — the module does NOT own the approval. It starts the
   `LeaveRequestSubmitted` workflow and reacts to `LeaveApproved` later.
5. **Outbox pattern** — record + event persisted in one transaction so events
   are never lost.
6. **Infra-free domain** — repo and workflow client are interfaces; logic is
   unit-tested without a database.

## Run

```bash
pnpm --filter @hr/leave test     # 9 tests
pnpm --filter @hr/leave dev      # needs adapters wired in src/index.ts
```

## Not done (intentionally — this is a reference, not production)

- Real Postgres adapter (schema is in `docs/specs/data-model.sql`).
- Real workflow-engine client.
- Auth middleware, rate limiting, request logging.
- The GET/cancel/conflicts endpoints (contract in `docs/specs/leave-api.md`).

A new module = copy this structure, swap the domain logic, keep every
convention identical.
