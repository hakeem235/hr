# HR Platform — Build Plan

Last updated: 2026-05-19

---

## Legend
- [x] Done
- [~] In progress
- [ ] Not started

---

## Foundation

- [x] Monorepo structure (`/apps`, `/services`, `/packages`, `/docs`)
- [x] `pnpm` workspace config
- [x] Root `tsconfig.json`
- [x] Root ESLint config (`.eslintrc.json`, `.eslintignore`)
- [x] Design tokens — `/packages/design-tokens`
  - [x] Primitives + semantic token JSON (W3C format)
  - [x] Style Dictionary build → `tokens.css`, `tokens.native.js`, `tokens.figma.json`
- [x] Specs written
  - [x] `docs/specs/leave-api.md` — reference API contract
  - [x] `docs/specs/workflow-engine.md`
  - [x] `docs/specs/design-tokens.md`
  - [x] `docs/specs/data-model.sql`
  - [x] `docs/specs/event-schemas.md`
  - [x] `docs/specs/a11y-checklist.md`

---

## Services

### Leave service — `/services/leave` · port 3001

- [x] Domain logic (`create-request.ts`, `working-days.ts`)
  - [x] Working-day calculation against KSA calendar (Sun–Thu)
  - [x] Balance check, overlap check, idempotency
  - [x] Outbox event pattern (`eventId`, `occurredAt`, `correlationId` on all events)
  - [x] Delegates approval to workflow engine (stub wired in `index.ts`)
- [x] HTTP layer — Fastify, all endpoints below
  - [x] `POST /api/v1/leave-requests` (Idempotency-Key, server-side day calc)
  - [x] `GET  /api/v1/leave-requests` (cursor pagination, filter by employeeId/entityId/status)
  - [x] `GET  /api/v1/leave-requests/:id` (ETag header)
  - [x] `POST /api/v1/leave-requests/:id/cancel` (If-Match, state guard, `LeaveCancelled` event)
  - [x] `GET  /api/v1/leave-requests/:id/conflicts`
  - [x] `GET  /api/v1/leave-balances?employeeId=`
  - [x] `GET  /api/v1/leave-types?entityId=`
  - [x] `GET  /api/v1/leave-policies/:typeId`
  - [x] `GET  /api/v1/health`
- [x] KSA Labour Law leave types seeded (annual, sick, emergency, maternity, paternity, hajj, unpaid)
- [x] In-memory store with sample data (5 seeded requests)
- [x] ETag + If-Match on mutable resources
- [x] **22 passing tests** — working-days, create, cancel, types, policies
- [ ] Real PostgreSQL adapter
- [x] Real workflow engine client (wf-client.ts → HTTP POST /api/v1/workflow-instances)

---

### Workflow engine — `/services/workflow-engine` · port 3002

- [x] Config-driven state machine — versioned JSON definitions, HR-editable without deploy
- [x] `WorkflowInstance` execution + version pinning (instances finish on the version they started)
- [x] All step types: `approval`, `automated`, `branch`, `parallel`, `wait`, `terminal`
- [x] JSONPath condition evaluation (`$.request.workingDays > 5`) + `onSkip` fallback
- [x] Actor resolution: `reports_to`, `role`+`scope`, `named`, `dynamic`
- [x] Delegation-aware (active delegations checked before resolving actor)
- [x] SLA in business hours against KSA calendar (Sun–Thu, configurable holidays + hours)
- [x] SLA escalation: `escalate` | `auto-approve` | `notify-only` per step; circular-escalation cap
- [x] Domain events: `StepActivated`, `StepCompleted`, `WorkflowCompleted`, `StepEscalated`, `WorkflowCancelled`
- [x] Cancellation from any non-terminal state
- [x] HTTP layer — Fastify
  - [x] `POST /api/v1/workflow-instances` — start instance
  - [x] `GET  /api/v1/workflow-instances/:id` — state + full step history
  - [x] `POST /api/v1/workflow-instances/:id/steps/:stepId/decision` — **the only approval endpoint**
  - [x] `POST /api/v1/workflow-instances/:id/cancel`
  - [x] `GET  /api/v1/approvals` — pending inbox, filterable by actorId
  - [x] `GET  /api/v1/workflow-definitions` + CRUD + soft-delete
- [x] Seeded definitions: `leave-approval` v1, `letter-approval` v1
- [x] In-memory repo + org chart (8 seeded employees, roles, hierarchy)
- [x] **36 passing tests** — executor, SLA, context evaluator
- [ ] Real PostgreSQL persistence
- [x] Wire leave service workflow client → `POST /api/v1/workflow-instances`
- [x] SLA breach scheduler (`SlaScheduler` — 60s poll, KSA business-hours check, escalation chain)
- [ ] Visual workflow builder (future)
- [ ] Temporal sagas — separate service (`/services/workflow-sagas`)

---

### People service — `/services/people` · port 3003

- [x] Domain layer — full CRUD: persons, employees, positions (effective-dated), compensation (effective-dated), documents, departments, entities, holiday calendar, delegations
- [x] `workflow_role` on `PositionRecord` — maps to engine vocabulary (`employee`, `manager`, `hr_ops`, `director`)
- [x] ActorStore HTTP endpoints (`/org-node`, `/manager`, `/delegation`) — workflow engine can replace its in-memory store
- [x] Employment state machine with valid transitions + `EmployeeOnboarded` / `EmployeeTerminated` events
- [x] ETag + If-Match on employees, persons, entities, departments
- [x] Outbox pattern on all write operations
- [x] Cursor pagination on persons, employees, documents
- [x] Seeded data matching workflow engine + leave service employee IDs (10 employees, 2 departments, 1 entity)
- [x] **24 passing tests** — persons, employees, positions, compensation, delegations, org-node projection
- [ ] Real PostgreSQL adapter
- [ ] Delegation table in SQL schema (`docs/specs/data-model.sql`)
- [ ] HTTP adapter in workflow engine replacing `InMemoryActorStore`

---

### Other services (not started)

- [ ] `/services/payroll`
- [ ] `/services/letters`
- [ ] `/services/benefits`
- [ ] `/services/notifications`
- [ ] `/services/integrations` (GOSI, Mudad, Qiwa, Muqeem, CCHI)
- [ ] `/services/workflow-sagas` (Temporal workers — onboarding/offboarding)

---

## HR Console — `/apps/hr-console` · port 3000

Next.js 14 App Router · TypeScript · CSS Modules · desktop-first · compact density default

### Shell & foundation
- [x] Next.js 14 App Router scaffold
- [x] Full design token system (primitives + semantic + dark mode overrides + compact density)
- [x] RTL support — logical CSS throughout, `dir`/`lang` synced to `<html>` on locale change
- [x] Bilingual en/ar — locale context, 62 translation keys, Arabic font stack + size adjust
- [x] Skip link, visible focus rings, `prefers-reduced-motion`
- [x] Sidebar navigation with `aria-current`
- [x] Top bar with page heading + locale toggle (EN ↔ ع)
- [x] API client (`lib/api.ts`) — typed fetch with proxy rewrites to leave service

### UI atoms
- [x] `Button` — primary / secondary / ghost / destructive × sm / md / lg + loading spinner
- [x] `StatusPill` — success / warning / danger / neutral, mapped to all leave statuses

### Leave Management — `/leave`
- [x] Balance cards — 4 types, usage progress bar, accrued/used stats, skeleton loading
- [x] Requests table — employee, type, dates, days, status pill, submitted; skeleton; empty state; error + retry
- [x] New request drawer — slide-in, full form validation, POSTs to leave service, error banner
- [x] Falls back to mock data when leave service is not running
- [ ] Filters / search on requests table
- [ ] Cursor pagination
- [ ] Request detail view
- [ ] Cancel request action (If-Match header)
- [ ] Team calendar / conflict view

### Approvals Inbox — `/approvals`
- [x] Filter bar (all / leave / letters / payroll) with per-module counts
- [x] Approval cards — module colour stripe, requester, summary, SLA with overdue highlight
- [x] Inline approve action
- [x] Inline decline with optional note
- [x] Optimistic removal + `aria-live` announcement for screen readers
- [x] Empty state
- [ ] Connect to workflow engine `GET /api/v1/approvals` + decision endpoint ← **now unblocked**
- [ ] Bulk approve
- [ ] Approval history / audit trail view

### Remaining screens (not started)
- [ ] People directory (`/people`)
- [ ] Employee profile detail
- [ ] Payroll (`/payroll`)
- [ ] Compliance (`/compliance`) — Nitaqat ratio, document expiry — **top-level nav per spec**
- [ ] Settings / configuration (`/settings`)
- [ ] Onboarding pipeline
- [ ] Offboarding pipeline
- [ ] HR Letters workspace
- [ ] Reports

---

## Employee Mobile — `/apps/employee-mobile`

React Native · iOS + Android

- [ ] Project scaffold (Expo or bare RN)
- [ ] Design tokens → `tokens.native.js` wired in
- [ ] Leave request 5-step flow
- [ ] Leave balance overview
- [ ] Manager approvals inbox (mobile)
- [ ] Push notifications
- [ ] Home / dashboard screen

---

## Packages

- [x] `/packages/design-tokens` — Style Dictionary, CSS + RN + Figma output
- [ ] `/packages/ui-web` — web component library (Storybook, RTL + density tested in CI)
- [ ] `/packages/ui-native` — React Native component library
- [ ] `/packages/event-schemas` — shared event contracts (single source of truth)
- [ ] `/packages/api-types` — TS types generated from OpenAPI specs
- [ ] `/packages/i18n` — shared ICU MessageFormat translation catalogs (en + ar, 6 Arabic plural forms)

---

## Infrastructure & integrations (not started)

- [ ] Auth — SSO (SAML / OIDC), RBAC
- [ ] PostgreSQL schema — apply `docs/specs/data-model.sql`
- [ ] Kafka / NATS event bus
- [ ] Temporal workers (onboarding/offboarding sagas)
- [ ] API gateway / BFF
- [ ] CI pipeline — lint, typecheck, test, visual regression (RTL + density)
- [ ] Government integrations — GOSI, Mudad, Qiwa, Muqeem, CCHI

---

## Test summary

| Service | Tests | Status |
|---|---|---|
| `/services/leave` | 22 | ✅ all passing |
| `/services/workflow-engine` | 36 | ✅ all passing |
| `/services/people` | 24 | ✅ all passing |
| `/apps/hr-console` | — | build passing, no unit tests yet |

