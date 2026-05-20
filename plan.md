# HR Platform — Build Plan

Last updated: 2026-05-20

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
  - [x] Delegates approval to workflow engine
- [x] HTTP layer — Fastify, all endpoints
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

---

### Workflow engine — `/services/workflow-engine` · port 3002

- [x] Config-driven state machine — versioned JSON definitions, HR-editable without deploy
- [x] `WorkflowInstance` execution + version pinning
- [x] All step types: `approval`, `automated`, `branch`, `parallel`, `wait`, `terminal`
- [x] JSONPath condition evaluation + `onSkip` fallback
- [x] Actor resolution: `reports_to`, `role`+`scope`, `named`, `dynamic`
- [x] Delegation-aware
- [x] SLA in business hours against KSA calendar (Sun–Thu)
- [x] SLA escalation: `escalate` | `auto-approve` | `notify-only`; circular-escalation cap
- [x] Domain events: `StepActivated`, `StepCompleted`, `WorkflowCompleted`, `StepEscalated`, `WorkflowCancelled`
- [x] Cancellation from any non-terminal state
- [x] HTTP layer — all endpoints including approval decision + pending inbox
- [x] Seeded definitions: `leave-approval` v1, `letter-approval` v1
- [x] In-memory repo + org chart (8 seeded employees)
- [x] **36 passing tests** — executor, SLA, context evaluator
- [x] SLA breach scheduler (60s poll, KSA business-hours check, escalation chain)
- [ ] Real PostgreSQL persistence
- [x] Visual workflow builder — `/settings/workflows`, SVG canvas, full step editor, publishes versioned JSON to workflow engine
- [x] Temporal sagas — built as `/services/workflow-sagas` (port 3009)

---

### People service — `/services/people` · port 3003

- [x] Domain layer — full CRUD: persons, employees, positions (effective-dated), compensation (effective-dated), documents, departments, entities, holiday calendar, delegations
- [x] `workflow_role` on `PositionRecord`
- [x] ActorStore HTTP endpoints (`/org-node`, `/manager`, `/delegation`)
- [x] Employment state machine with valid transitions + domain events
- [x] ETag + If-Match on employees, persons, entities, departments
- [x] Outbox pattern on all write operations
- [x] Cursor pagination on persons, employees, documents
- [x] Seeded data matching workflow engine + leave service employee IDs (10 employees, 2 departments, 1 entity)
- [x] **24 passing tests**
- [ ] Real PostgreSQL adapter

---

### Letters service — `/services/letters` · port 3004

- [x] Domain layer — 7 KSA letter types, status machine, bilingual support
- [x] Workflow client integration
- [x] ETag + If-Match, outbox pattern
- [x] Seeded data: 3 requests
- [x] **19 passing tests**
- [ ] Real PostgreSQL adapter
- [ ] Letter template renderer (bilingual PDF generation)

---

### Notifications service — `/services/notifications` · port 3005

- [x] Tiered fan-out: in_app → email → sms → push per recipient preference
- [x] 13 notification types, ICU-style templates en+ar
- [x] Recipient preferences, quiet hours, urgent override
- [x] In-app inbox API: list, get, mark-read, mark-all-read, unread-count
- [x] Delivery log per channel
- [x] **21 passing tests**
- [ ] Real provider wiring (SES/Postmark, Unifonic/Msegat, FCM/APNs)
- [ ] Event relay integration (consume Kafka/NATS → notifications)

---

### Benefits service — `/services/benefits` · port 3006

- [x] Benefit plans (medical/CCHI, life, EOSB, air ticket, mobile), enrollments with dependents
- [x] 6 pre-loaded plans with CCHI provider codes
- [x] Enrollment status machine, dependent management
- [x] EOSB calculator — KSA Labour Law Art. 84; all amounts in halalas (integer-safe)
- [x] ETag + If-Match, outbox pattern, idempotency, cursor pagination
- [x] **27 passing tests**
- [ ] Real PostgreSQL adapter

---

### Payroll service — `/services/payroll` · port 3007

- [x] `PayrollRun` + `PayslipRecord` with full state machine, GOSI calculator, gross-to-net
- [x] Status machine: `draft → calculating → pending_approval → approved → processing_wps → paid`
- [x] GOSI contributions — Saudi 9.75%/11.75%, Expat 2% employer; integer basis-point arithmetic
- [x] Gross-to-net, negative net rejected
- [x] WPS/Mudad step — `approved → processing_wps → paid`
- [x] Payslip generation per employee with full pay breakdown
- [x] Idempotency-Key, ETag + If-Match, outbox pattern, cursor pagination
- [x] Seeded: 4 paid runs (Jan–Apr 2026) + 1 draft (May 2026)
- [x] **29 passing tests**
- [ ] Real PostgreSQL adapter
- [ ] Payslip PDF generation
- [ ] Real Mudad/WPS API integration (in `/services/integrations`)

---

### Integrations service — `/services/integrations` · port 3008

- [x] GOSI — enroll on day 1 (9.75%/11.75% Saudi, 2% expat), exit, recalculation on comp change
- [x] Mudad / WPS — WPS file generation + stub submission, IBAN validation, per-employee breakdown
- [x] Qiwa — contract registration (indefinite/fixed-term) + termination
- [x] Muqeem — iqama renewal + exit notification for expat employees
- [x] CCHI — medical insurance enrollment + termination with dependent list
- [x] Domain event webhook (`POST /api/v1/events`) — `EmployeeOnboarded` → GOSI+Qiwa; `EmployeeTerminated` → GOSI+Qiwa; `CompensationChanged` → GOSI recalc
- [x] `POST /api/v1/gosi/preview` — standalone contribution calculator
- [x] `GET /api/v1/submissions` — cross-system submission list with filters + cursor pagination
- [x] In-memory repo with idempotency, 5 seeded submissions
- [x] **28 passing tests** — GOSI rates/integer safety, enrollment/exit/recalc, Mudad WPS validation, Qiwa/Muqeem/CCHI, event routing + idempotency
- [ ] Real portal API clients (GOSI, Mudad, Qiwa, Muqeem, CCHI)
- [ ] Async polling / webhook confirmation (currently stub-confirms synchronously)
- [ ] Real PostgreSQL adapter

---

### Workflow sagas — `/services/workflow-sagas` · port 3009

- [x] Temporal-pattern saga engine — `SagaRunner` with retry + exponential backoff + reverse compensation
- [x] `SagaInstance` + `ActivityDef` + `SagaDef` + `SagaRepo` domain types
- [x] Onboarding saga — 6 activities: validateEmployee → enrollGosi → registerQiwaContract → activateBenefits → sendWelcomeNotification → provisionItAccess (stub)
- [x] Offboarding saga — 6 activities: submitGosiExit → terminateQiwaContract → cancelBenefits → calculateFinalSettlement → revokeItAccess (stub) → sendOffboardingNotification
- [x] Compensation for partial saga failures (reverse order, per-activity compensate fns)
- [x] HTTP layer — POST /sagas/:name, GET /sagas/:id, GET /sagas, POST /events (EmployeeOnboarded/EmployeeTerminated)
- [x] Idempotency on event IDs; seeded data: 1 completed onboarding + 1 completed offboarding
- [x] In-memory repo with cursor pagination
- [x] **34 passing tests** — SagaRunner happy path, retries, compensation, onboarding/offboarding structure, event routing, repo
- [ ] Real PostgreSQL persistence

---

## HR Console — `/apps/hr-console` · port 3000

Next.js 14 App Router · TypeScript · CSS Modules · desktop-first · compact density default

### Shell & foundation

- [x] Next.js 14 App Router scaffold
- [x] Full design token system (primitives + semantic + dark mode overrides + compact density)
- [x] RTL support — logical CSS throughout, `dir`/`lang` synced to `<html>` on locale change
- [x] Bilingual en/ar — locale context, 236+ translation keys (en + ar), Arabic font stack + size adjust
- [x] Skip link, visible focus rings, `prefers-reduced-motion`
- [x] Sidebar navigation — 9 top-level items + Settings footer, `aria-current`, `data-active`
- [x] Top bar with page heading + locale toggle (EN ↔ ع)
- [x] API client (`lib/api.ts`) — typed fetch with proxy rewrites to all 7 services (leave, workflow, people, letters, payroll, integrations, workflow-sagas)

### UI atoms

- [x] `Button` — primary / secondary / ghost / destructive × sm / md / lg + loading spinner
- [x] `StatusPill` — success / warning / danger / neutral, mapped to all statuses across modules

### Leave Management — `/leave`

- [x] Balance cards — 4 types, usage progress bar, accrued/used stats, skeleton loading
- [x] Requests table — employee, type, dates, days, status pill; skeleton; empty state; error + retry
- [x] New request drawer — slide-in, full form validation, POSTs to leave service, error banner
- [x] Falls back to mock data when service is not running
- [x] Filters / search on requests table — employee ID search (debounced) + status filter pills, re-fetches API
- [x] Cursor pagination — "Load more" appends next page; resets on filter change
- [x] Request detail view / cancel with If-Match — slide-in drawer, fetches ETag, confirm-step cancel

### Approvals Inbox — `/approvals`

- [x] Filter bar (all / leave / letters / payroll) with per-module counts
- [x] Approval cards — module colour stripe, requester, summary, SLA overdue highlight
- [x] Inline approve + decline with note
- [x] Optimistic removal + `aria-live` announcement
- [x] Connected to workflow engine `GET /api/v1/approvals` + decision endpoint — live fetch, mock fallback, re-fetch on error
- [x] Bulk approve — select-all checkbox + bulk action bar, `Promise.allSettled` fan-out, optimistic removal
- [x] Approval history / audit trail view — History tab, `GET /api/v1/workflow-instances` endpoint, seeded completed instances, audit table with outcome/decided-by/note

### Remaining screens

- [x] People directory (`/people`) — employee table, search, status filter, avatar initials
- [x] Employee profile detail (`/people/[id]`) — header card, position, compensation, leave-history tab
- [x] Payroll (`/payroll`) — payroll runs table; live fetch from payroll service + skeleton loading
- [x] Compliance (`/compliance`) — Nitaqat meter + band colour + gap indicator, document expiry table
- [x] Settings (`/settings`) — configuration section shells
- [x] Onboarding pipeline (`/onboarding`) — case cards with 5-stage progress track
- [x] Offboarding pipeline (`/offboarding`) — case cards with 5-stage progress track
- [x] HR Letters workspace (`/letters`) — request table, New Letter drawer, 7 KSA types, bilingual
- [x] Reports (`/reports`) — report catalogue cards

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

---

## Test summary

| Service | Tests | Status |
|---|---|---|
| `/services/leave` | 22 | all passing |
| `/services/workflow-engine` | 36 | all passing |
| `/services/people` | 24 | all passing |
| `/services/letters` | 19 | all passing |
| `/services/notifications` | 21 | all passing |
| `/services/benefits` | 27 | all passing |
| `/services/payroll` | 29 | all passing |
| `/services/integrations` | 28 | all passing |
| `/services/workflow-sagas` | 34 | all passing |
| `/apps/hr-console` | — | 13 routes, build passing |
