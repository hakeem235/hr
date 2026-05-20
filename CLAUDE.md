# CLAUDE.md

Project guide for Claude Code and future Claude sessions. Read this first. It captures the
architecture, conventions, and decisions already locked for this project so you don't
re-derive or contradict them.

---

## 1. What this is

A unified HR automation platform for a Saudi Arabia–based organization (~1,250 employees,
multi-entity capable). It replaces ticket-and-spreadsheet HR ops with self-service workflows.

**Modules:** onboarding, payroll, benefits, leaves, HR letters, medical insurance,
offboarding. Each module is "a thing that moves through states with approvals and automated
actions" — they share a workflow engine and an approvals inbox rather than each reinventing
them.

**Four personas, four surfaces** — treat them as distinct products sharing a database, not
one app with role toggles:
- Employee — mobile-first self-service
- Manager — mobile + desktop, approvals-centric
- HR Ops — desktop console, all-day operational use
- HR Admin / Config — desktop, occasional, configuration only

---

## 2. Repo layout

Default assumption is a **monorepo**. The structure below is also designed to split cleanly
into separate repos later: `/packages` becomes published internal packages, each `/apps` and
`/services` entry becomes its own repo, and this `CLAUDE.md` is copied to each repo root with
sections 11–14 trimmed to that repo's scope. Whichever setup is live, sections 3–10 (the
architecture, API, design, RTL, and a11y rules) apply unchanged.

```
/apps
  /employee-mobile      React Native — employee + manager surfaces
  /hr-console           Next.js — HR Ops + Admin (desktop web)
  /api-gateway          BFF / API gateway
/services
  /workflow-engine      config-driven state machine (approval workflows)
  /workflow-sagas       Temporal workers (onboarding, offboarding)
  /leave                leave module
  /letters              HR letters module
  /payroll              payroll module
  /benefits             benefits + insurance module
  /people               employee master / HRIS core
  /integrations         govt portals (GOSI, Mudad, Qiwa, Muqeem, CCHI), banking, IdP
  /notifications        tiered notification fan-out
/packages
  /design-tokens        W3C design tokens → CSS / RN / Figma (Style Dictionary)
  /ui-web               web component library
  /ui-native            React Native component library
  /event-schemas        shared event contracts (single source of truth)
  /api-types            shared TS types generated from OpenAPI specs
  /i18n                 translation catalogs (ICU MessageFormat), en + ar
/prototypes
  hr-platform-prototype.html   static clickable HTML/CSS prototype (see §9)
/docs
  raci.xlsx             design system team RACI
  /specs                module specs, API contracts, ADRs
```

If this is later split into separate repos, `/packages` becomes published internal packages
consumed by both sides, and each app/service is its own repo. Keep this `CLAUDE.md` at every
repo root — shared rules stay identical, only the "what exists" and "commands" sections
differ per repo.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Employee + Manager apps | React Native | one codebase, iOS + Android; web fallback acceptable |
| HR Console + Admin | Next.js (App Router) | desktop-optimized, keyboard-first |
| Backend services | Node.js (primary), Go (perf-critical paths) | per-service, not a monolith |
| Datastore | MongoDB (NoSQL) | one employee master in `/services/people` |
| Event bus | Kafka or NATS | services subscribe; engine stays ignorant of consumers |
| Approval workflows | custom config-driven state machine | HR-editable JSON, no deploy needed |
| Long-running sagas | Temporal | onboarding/offboarding only — durable retries + compensation |
| Workflow editing | visual builder emits versioned JSON | see §5 |
| Auth | SSO (SAML / OIDC) | RBAC; Admin surface stricter |
| Design tokens | Style Dictionary | one source → CSS, RN, Figma variables |

Do not introduce new infrastructure (databases, queues, languages) without an ADR in
`/docs/specs`.

---

## 4. Architecture principles

These are locked. Don't violate them without an ADR.

1. **Single source of truth** — `/services/people` owns the employee record. Payroll,
   insurance, AD, etc. consume it via events. Never duplicate employee master data.
2. **Event-driven, not point-to-point** — modules publish domain events; consumers subscribe.
   A "new hire" event fans out; no module calls another module directly to trigger work.
3. **Two workflow engines, split by workload shape** — short-lived approval flows use the
   config-driven state machine; long-running multi-system sagas use Temporal. Don't force one
   to do both.
4. **The UI is a projection of engine state** — approval cards, status pills, timelines
   render workflow/engine state. The frontend never owns workflow truth.
5. **Self-service first** — employee + manager surfaces should carry ~70% of transactions. HR
   handles exceptions, not data entry.
6. **Approvals are uniform** — every module's approvals go through the workflow engine's
   decision endpoint and surface in one inbox. A module never builds its own approval UI.

---

## 5. Workflow engine conventions

- Workflow definitions are **versioned JSON**, stored, edited via visual builder. HR admins
  edit without a deploy.
- A `WorkflowInstance` **pins its definition version** at creation. It finishes on the
  version it started on; new instances pick up new versions.
- Step types: `approval`, `automated`, `wait`, `branch`, `parallel`, `terminal`.
- **Actors resolved at step activation**, not workflow start (org chart may change).
  Strategies: `reports_to`, `role`+`scope`, `named`, `dynamic`, and every strategy is
  **delegation-aware**.
- SLAs run in **business hours against a per-entity working calendar** (KSA: Sun–Thu + local
  + religious holidays — Ramadan/Hajj/Eid clusters must be wired in or approvals look
  falsely breached).
- Every transition emits a domain event. Cancellation paths must exist from any non-terminal
  state. Workflow definitions soft-delete only (instances pin them).

---

## 6. API conventions

Lock these across every module so the workflow engine and approval inbox treat modules
identically.

- REST, JSON, versioned under `/api/v1`.
- **Idempotency-Key required** on every POST that creates state.
- **Cursor pagination** (`?cursor=&limit=`), never offset.
- Timestamps **ISO 8601 with offset**, never naked UTC (Hijri + working-calendar math needs
  local offset).
- Money and balances as **integers or decimal strings**, never floats.
- Every list endpoint filterable by `entityId` (multi-entity orgs).
- `ETag` + `If-Match` on mutable resources (catches two-approvers-at-once races).
- Consistent error envelope: `{ error: { code, message, field?, details? } }`. Use `409`
  for state conflicts, `422` for policy/validation, `400` for malformed input.
- A module **owns its data**; it **delegates state transitions to the workflow engine**.
  Example: approving leave hits the engine's decision endpoint, not a leave endpoint. Leave
  reacts to the `LeaveApproved` event.
- Every event carries `eventId`, `occurredAt`, `entityId`, `correlationId`. The
  `correlationId` threads one request across all services for tracing.

Reference contract: `/docs/specs/leave-api.md` is the template. New modules mirror it.

---

## 7. Design system

- **Two-layer tokens.** Primitives (raw values) → semantic tokens (purpose-bound). Components
  reference **semantic tokens only**. Never hardcode color/spacing/radius.
- **Mode swaps** override semantic tokens only: `[data-theme="dark"]`,
  `[data-density="compact"]`. Density: comfortable for ESS, compact for HR ops.
- **Component build order is tiered** — tokens → atoms → molecules → domain → composites →
  page templates. Don't build a domain component before its atoms exist. `DataTable` is its
  own swimlane.
- **One card pattern, many entities.** `ApprovalCard` is the reference component (5 states ×
  3 variants). `EmployeeCard`, `PayslipCard`, `LetterCard` reuse its spec with state-machine
  swaps.
- Component library is published from `/packages/ui-web` and `/packages/ui-native`,
  documented in Storybook, RTL + density tested in CI with visual regression.

### Aesthetic direction (current prototype)

Warm editorial, not generic SaaS. Paper-toned canvas, deep teal primary, ochre accent,
Fraunces (display) + Hanken Grotesk (UI). If you rebuild or extend UI, stay consistent or
raise it explicitly.

---

## 8. Bilingual + RTL (non-negotiable, build from day one)

Retrofitting RTL costs 3–5× doing it upfront. Budget 15–20% of frontend effort for it.

- `dir` toggled at app root, never per component.
- **Logical CSS properties only** — `margin-inline-start`, `padding-inline`,
  `inset-inline-start`, `border-inline-end`. No `left`/`right`.
- Icons split: directional (arrows, chevrons, back) get a mirror transform; non-directional
  (search, settings, bell) and brand logos do not.
- Numbers, dates, currencies, emails render LTR even inside RTL — wrap in `<bdi>` /
  `unicode-bidi: isolate`.
- Separate font stack per language. Arabic needs ~105–110% size to match English visual
  weight — token it (`--font-size-arabic-adjust`).
- Translation **keys only**, even for English. ICU MessageFormat (Arabic has 6 plural forms).
- Letters/documents: bilingual templates per type. Renderer picks language by user pref for
  ESS docs, by purpose for outbound (KSA bank letter → Arabic; Western embassy → English).
- Notifications localized **at delivery time** using recipient preference, not at composition.
- Dates: Gregorian default for system dates, Hijri overlay available.
- Test every component in both directions in CI. Pseudo-translation pass catches hardcoded
  strings.

---

## 9. Domain context — KSA specifics

These are compliance-critical. Get them wrong and the platform is unusable for HR.

- **GOSI** — social insurance; enroll on day 1, contribution recalc on comp change, exit on
  termination.
- **Mudad / WPS** — Wage Protection System; payroll runs must integrate.
- **Qiwa** — employment contract registration; required for new hires.
- **Muqeem** — iqama (residence permit) processing and renewal for expats.
- **CCHI** — medical insurance compliance; provider integrations must be CCHI-compliant.
- **Saudization (Nitaqat)** — nationality ratio tracking; surfaced as a first-class
  compliance metric, not buried in reports.
- **Document expiry** — iqama, passport, contract, license. Surfaced in dashboards and as
  ambient warnings wherever the employee appears.

In the HR Console, **Compliance is a top-level nav section**, not nested under Reports.

---

## 10. Accessibility — target WCAG 2.2 AA

Applies to all UI work. The full checklist is in `/docs/specs/a11y-checklist.md`.

- Visible focus on every interactive element — never `outline: none` without a replacement.
- Skip link, landmarks, logical heading hierarchy, `aria-current` on active nav.
- Forms: programmatic labels (not placeholders), errors via `aria-describedby`, required
  marked with `*` + `aria-required`.
- Tables: proper `thead`/`th scope`, sort state announced, bulk actions keyboard-reachable.
- Approvals: state changes announced via `aria-live`; every swipe gesture has a keyboard
  equivalent; decline-with-note manages focus.
- Decorative SVGs `aria-hidden`; meaningful ones get labels.
- Respect `prefers-reduced-motion`.
- Touch targets ≥ 44×44 CSS px.
- Generated PDFs (payslips, letters) are **tagged PDFs with a text layer** — not scanned
  images.
- `lang` + `dir` set correctly, including on inline language switches.
- Automated `axe-core` in CI is necessary but not sufficient — real screen-reader passes
  (NVDA, VoiceOver, TalkBack) are a required human step before launch.

---

## 11. What exists now

- **`/prototypes/hr-platform-prototype.html`** — a static, self-contained, clickable HTML/CSS
  prototype. Three surfaces (employee mobile incl. 5-step leave flow, manager approvals
  inbox, HR Ops console incl. onboarding pipeline + letter approval workspace). Bilingual/RTL
  toggle. Keyboard-navigable. **It is a reference, not production code** — screens are
  hardcoded, no data layer, not yet screen-reader tested.
- **`/docs/specs/leave-api.md`** — reference API contract.
- **`/docs/raci.xlsx`** — design system team RACI.
- Specs for: workflow engine, IA per surface, design tokens, component inventory,
  bilingual/RTL strategy, a11y checklist.

**Not built yet:** all production services, real component libraries, the data model DDL,
the event schema registry, the workflow visual builder, offboarding pipeline, employee
profile detail page.

---

## 12. Working agreements for Claude

- **Read the relevant spec in `/docs/specs` before implementing a module or component.**
  Decisions there override your priors.
- When extending the prototype, keep its token system and aesthetic — don't drift to generic
  SaaS styling.
- Don't introduce new infra, languages, or cross-module direct calls without an ADR.
- New modules mirror the leave module's API conventions exactly.
- Any new UI ships with: logical CSS properties, both-direction rendering, focus states,
  semantic HTML/ARIA. Not as a follow-up — in the same change.
- Prefer config-driven over hardcoded — workflows, policies, letter templates, eligibility
  rules are data, edited by HR, not code.
- Money, dates, and i18n: follow §6 and §8 every time. These bugs are expensive and quiet.
- When unsure whether something is decided, check `/docs/specs` and this file before asking.
  If it's genuinely open, raise it rather than guessing.

---

## 13. Commands

> Placeholder — fill in as the build scaffolds. Keep this section current; it's the first
> thing Claude Code looks for.

```bash
# install
pnpm install

# dev — per app
pnpm --filter hr-console dev
pnpm --filter employee-mobile start

# test
pnpm test                 # all
pnpm --filter leave test  # one service

# lint + typecheck
pnpm lint
pnpm typecheck

# design tokens build
pnpm --filter design-tokens build

# storybook
pnpm --filter ui-web storybook
```

---

## 14. Open decisions

Track these here until resolved with an ADR.

- Build vs buy vs hybrid — a KSA-localized vendor (Jisr, ZenHR, Bayzat) may beat custom build
  on time-to-value for the commodity layers. Custom is currently assumed; revisit before
  payroll work starts.
- Node vs Go split — which specific services justify Go. Default to Node until a perf case is
  made.
- Notification provider for SMS/push in KSA.
- Whether the employee + manager apps ship as one binary with role detection or two.
