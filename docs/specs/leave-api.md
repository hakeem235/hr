# Leave API Contract — `/api/v1`

Status: stable · This is the **reference contract**. Every new module mirrors
these conventions exactly (CLAUDE.md §6).

## Conventions (apply to all modules)

- REST, JSON, versioned under `/api/v1`.
- `Idempotency-Key` header **required** on every state-creating POST.
- Cursor pagination (`?cursor=&limit=`), never offset.
- Timestamps ISO 8601 **with offset**, never naked UTC.
- Money/balances as integers (minor units) or decimal strings, never floats.
- Every list endpoint filterable by `entityId`.
- `ETag` + `If-Match` on mutable resources.
- The module owns its data; it **delegates state transitions to the workflow
  engine**. Approving leave hits the engine's decision endpoint, not a leave
  endpoint. Leave reacts to the `LeaveApproved` event.

## Resources

```
GET    /leave-types?entityId=                 list configured types
GET    /leave-balances?employeeId=            balances across all types
GET    /leave-requests?employeeId=&status=&cursor=&limit=
POST   /leave-requests                        create + submit
GET    /leave-requests/{id}                   detail incl. workflow state
POST   /leave-requests/{id}/cancel            requester-initiated cancel
GET    /leave-requests/{id}/conflicts         team overlap + holiday check
GET    /leave-policies/{typeId}               accrual + eligibility rules
```

Approvals are deliberately **not** here. See workflow-engine.md §7.

## POST /leave-requests

```http
POST /api/v1/leave-requests
Content-Type: application/json
Idempotency-Key: 4f1a-...

{
  "employeeId": "emp_018f23",
  "leaveTypeId": "annual",
  "startDate": "2026-03-15",
  "endDate": "2026-03-22",
  "reason": "Family trip",
  "attachments": ["doc_91ab"]
}
```

```http
201 Created

{
  "id": "lv_2026_00417",
  "status": "pending_approval",
  "employeeId": "emp_018f23",
  "leaveTypeId": "annual",
  "startDate": "2026-03-15",
  "endDate": "2026-03-22",
  "workingDays": 6,
  "balanceImpact": { "before": 18, "after": 12 },
  "workflowInstanceId": "wf_7c2e91",
  "currentStep": {
    "id": "manager-review",
    "actor": "emp_004a",
    "slaDueAt": "2026-03-09T13:00:00+03:00"
  },
  "createdAt": "2026-03-08T09:14:22+03:00"
}
```

`workingDays` is computed **server-side** against the entity calendar. Never
trust a client-sent duration.

## Status model

```
draft → pending_approval → approved → scheduled → taken
              ↓                ↓
          declined         cancelled
```

`status` is a **projection**: the workflow engine owns
`pending_approval → approved/declined`; the leave module advances
`approved → scheduled → taken` on date triggers.

## Error envelope

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Requested 6 days exceeds available annual balance of 4.",
    "field": "endDate",
    "details": { "requested": 6, "available": 4 }
  }
}
```

Codes: `INSUFFICIENT_BALANCE`, `OVERLAPPING_REQUEST`, `POLICY_VIOLATION`,
`INELIGIBLE`, `INVALID_DATE_RANGE`, `WORKFLOW_UNAVAILABLE`.
HTTP: `409` state conflict, `422` policy/validation, `400` malformed.

## Events emitted

| Event | Consumers |
|---|---|
| `LeaveRequestSubmitted` | workflow-engine (triggers approval flow) |
| `LeaveApproved` | payroll (LWP), calendar, notifications |
| `LeaveDeclined` | notifications |
| `LeaveCancelled` | payroll, calendar, notifications |
| `LeaveBalanceAdjusted` | audit, employee notification |
| `LeaveTaken` | payroll (confirm), analytics |

Every event carries `eventId`, `occurredAt`, `entityId`, `correlationId`.
