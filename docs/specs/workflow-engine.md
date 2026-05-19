# Workflow Engine Spec

Status: stable · Owner: platform · See CLAUDE.md §4–5

The spine of the platform. Leave, letters, expenses, comp changes, onboarding,
offboarding are all "a thing moves through states with approvals and automated
actions." Built once; every module becomes config.

## 1. Two engines, split by workload shape

| Engine | Workload | Why |
|---|---|---|
| **Config state machine** | leave, letters, expenses, comp changes | short-lived, branchy, must be HR-editable without deploy |
| **Temporal** | onboarding, offboarding | days/weeks long, fans out to many external systems, needs durable retries + compensation |

Do not force one engine to do both. Different reliability and editability needs.

## 2. Definition format (data, not code)

Versioned JSON, stored, edited via the visual builder. Example: `leave-approval`.

```json
{
  "workflowId": "leave-approval",
  "version": 7,
  "trigger": "LeaveRequestSubmitted",
  "steps": [
    {
      "id": "manager-review",
      "type": "approval",
      "actor": { "strategy": "reports_to", "of": "$.requester" },
      "sla": { "duration": "PT8H", "businessHours": true },
      "onTimeout": "escalate",
      "escalateTo": { "strategy": "reports_to", "of": "$.step.actor" },
      "transitions": [
        { "on": "approved", "to": "hr-confirm" },
        { "on": "declined", "to": "end_declined" }
      ]
    },
    {
      "id": "hr-confirm",
      "type": "approval",
      "actor": { "strategy": "role", "role": "hr_ops", "scope": "$.requester.entity" },
      "condition": "$.request.workingDays > 5",
      "onSkip": "calendar-update",
      "transitions": [
        { "on": "approved", "to": "calendar-update" },
        { "on": "declined", "to": "end_declined" }
      ]
    },
    {
      "id": "calendar-update",
      "type": "automated",
      "action": "PublishEvent",
      "params": { "event": "LeaveApproved" },
      "transitions": [ { "on": "success", "to": "end_approved" } ]
    },
    { "id": "end_approved", "type": "terminal", "result": "approved" },
    { "id": "end_declined", "type": "terminal", "result": "declined" }
  ]
}
```

### Step types

| Type | Behaviour |
|---|---|
| `approval` | wait for a human decision from a resolved actor |
| `automated` | call a service or publish an event |
| `wait` | until a date or an external signal |
| `branch` | pure conditional fork, no side effects |
| `parallel` | fan-out; join on `all` or `any` |
| `terminal` | end state with a `result` |

## 3. Execution model

- `WorkflowInstance` records: definition id + **pinned version**, current
  step(s), context (`$.`), full history.
- **Version pinning**: an instance started on v7 finishes on v7 even if v8 is
  published mid-flight. New instances pick up v8.
- Each step execution is a row (see `approval_step` in data-model.sql): actor,
  state (`pending|active|done|skipped|failed|escalated`), timestamps, decision,
  note. **This row is exactly what the ApprovalCard renders.** UI is a
  projection, never the source of truth.
- Every transition emits a domain event (`StepActivated`, `StepCompleted`,
  `WorkflowCompleted`). Modules subscribe; the engine stays ignorant of what
  leave/payroll actually do.

## 4. Actor resolution

Resolved at **step activation**, not workflow start (org chart may change).

| Strategy | Resolves to |
|---|---|
| `reports_to` | walk org hierarchy from a person |
| `role` + `scope` | anyone with role X in entity/department Y |
| `named` | a specific user (rare, fragile) |
| `dynamic` | from context (e.g. cost-center budget owner) |

Every strategy is **delegation-aware**: check active delegations first so a
manager on leave doesn't black-hole the queue.

## 5. SLA & escalation

- SLAs run in **business hours** against the entity working calendar
  (`entity.work_week` + `holiday_calendar`). KSA: Sun–Thu; Ramadan/Hajj/Eid
  clusters must be loaded or every approval looks falsely breached.
- On breach: `escalate`, `auto-approve`, or `notify-only` — per step.

## 6. Edge cases (design now, not later)

- Requester cancels mid-flow → cancellation path from any non-terminal state.
- Actor leaves company mid-approval → re-resolve or escalate.
- Definition deleted → soft-delete only; instances pin their version.
- Circular escalation → cap chain depth.

## 7. Decision endpoint (the ONLY way to act on an approval)

```
POST /api/v1/workflow-instances/{id}/steps/{stepId}/decision
{ "decision": "approved" | "declined", "note": "string (required on decline)" }
```

Modules never build their own approval endpoints or UI. Every module's
approvals flow through here and surface in the one inbox.
