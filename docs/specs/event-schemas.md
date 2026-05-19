# Event Schema Registry

Status: stable · Single source of truth for cross-service events
(CLAUDE.md §4). Code in `/packages/event-schemas` is generated from this.

## Envelope (every event)

```json
{
  "eventId": "uuid",
  "eventType": "string",
  "occurredAt": "ISO-8601 with offset",
  "entityId": "uuid",
  "correlationId": "uuid",
  "aggregateType": "string",
  "aggregateId": "uuid",
  "payload": { }
}
```

`correlationId` threads one user action across all services for tracing. It is
created at the originating request and propagated through every downstream
event.

## Rules

- Events are **immutable facts** in past tense (`LeaveApproved`, not
  `ApproveLeave`).
- Additive changes only. A new required field is a new event version
  (`LeaveApproved.v2`), never a mutation of v1.
- Consumers must be **idempotent** — events can be redelivered.
- Published via the **outbox pattern** (see `event_outbox` in data-model.sql):
  domain change + event row in one transaction; a relay publishes.

## Core events

### People / lifecycle
| Event | Payload keys | Consumers |
|---|---|---|
| `EmployeeOnboarded` | employeeId, entityId, hireDate, positionId | payroll, insurance, benefits, IT-provisioning, assets, integrations(GOSI/Qiwa) |
| `PositionChanged` | employeeId, fromPositionId, toPositionId | payroll, benefits, access |
| `CompensationChanged` | employeeId, effectiveDate, components | payroll, integrations(GOSI), letters |
| `EmployeeTerminated` | employeeId, exitDate, reason | payroll(settlement), insurance(cancel), access(revoke), assets(recover), integrations(GOSI exit, Qiwa) |
| `DocumentExpiring` | employeeId, docType, expiresOn | notifications, compliance dashboard |

### Leave
| Event | Payload keys | Consumers |
|---|---|---|
| `LeaveRequestSubmitted` | requestId, employeeId, dates, typeId | workflow-engine |
| `LeaveApproved` | requestId, employeeId, dates, workingDays | payroll, calendar, notifications |
| `LeaveDeclined` | requestId, employeeId, reason | notifications |
| `LeaveCancelled` | requestId, employeeId | payroll, calendar, notifications |
| `LeaveTaken` | requestId, employeeId, dates | payroll, analytics |

### Workflow engine
| Event | Payload keys | Consumers |
|---|---|---|
| `StepActivated` | instanceId, stepId, actorId, slaDueAt | notifications |
| `StepCompleted` | instanceId, stepId, decision | originating module |
| `WorkflowCompleted` | instanceId, workflowId, result | originating module, audit |

### Letters
| Event | Payload keys | Consumers |
|---|---|---|
| `LetterRequested` | requestId, employeeId, letterType, purpose | workflow-engine |
| `LetterIssued` | requestId, employeeId, documentId | notifications, audit |

## Versioning policy

`{EventName}.v{N}`. The registry lists the current version. Old versions stay
supported until all consumers migrate (tracked per event in an ADR).
