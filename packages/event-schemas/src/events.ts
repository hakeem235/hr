import type { EventEnvelope } from './envelope.js';

// ---------------------------------------------------------------------------
// People / lifecycle events (event-schemas.md)
// ---------------------------------------------------------------------------

export interface EmployeeOnboarded extends EventEnvelope {
  eventType: 'EmployeeOnboarded';
  payload: {
    employeeId: string;
    entityId: string;
    hireDate: string;
    positionId: string;
  };
}

export interface PositionChanged extends EventEnvelope {
  eventType: 'PositionChanged';
  payload: {
    employeeId: string;
    fromPositionId: string;
    toPositionId: string;
    effectiveDate: string;
  };
}

export interface CompensationChanged extends EventEnvelope {
  eventType: 'CompensationChanged';
  payload: {
    employeeId: string;
    effectiveDate: string;
    components: {
      basicMinor: number;
      housingMinor: number;
      transportMinor: number;
      otherMinor: number;
      currency: string;
    };
  };
}

export interface EmployeeTerminated extends EventEnvelope {
  eventType: 'EmployeeTerminated';
  payload: {
    employeeId: string;
    exitDate: string;
    reason: string;
  };
}

export interface DocumentExpiring extends EventEnvelope {
  eventType: 'DocumentExpiring';
  payload: {
    employeeId: string;
    docType: string;
    expiresOn: string;
    daysUntilExpiry: number;
  };
}

// ---------------------------------------------------------------------------
// Leave events
// ---------------------------------------------------------------------------

export interface LeaveRequestSubmitted extends EventEnvelope {
  eventType: 'LeaveRequestSubmitted';
  payload: {
    requestId: string;
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    workingDays: number;
  };
}

export interface LeaveApproved extends EventEnvelope {
  eventType: 'LeaveApproved';
  payload: {
    requestId: string;
    employeeId: string;
    startDate: string;
    endDate: string;
    workingDays: number;
  };
}

export interface LeaveDeclined extends EventEnvelope {
  eventType: 'LeaveDeclined';
  payload: {
    requestId: string;
    employeeId: string;
    reason?: string;
  };
}

export interface LeaveCancelled extends EventEnvelope {
  eventType: 'LeaveCancelled';
  payload: {
    requestId: string;
    employeeId: string;
  };
}

export interface LeaveTaken extends EventEnvelope {
  eventType: 'LeaveTaken';
  payload: {
    requestId: string;
    employeeId: string;
    startDate: string;
    endDate: string;
  };
}

export interface LeaveBalanceAdjusted extends EventEnvelope {
  eventType: 'LeaveBalanceAdjusted';
  payload: {
    employeeId: string;
    leaveTypeId: string;
    year: number;
    delta: number;
    reason: string;
  };
}

// ---------------------------------------------------------------------------
// Workflow engine events
// ---------------------------------------------------------------------------

export interface StepActivated extends EventEnvelope {
  eventType: 'StepActivated';
  payload: {
    instanceId: string;
    stepId: string;
    actorId: string | null;
    slaDueAt: string | null;
  };
}

export interface StepCompleted extends EventEnvelope {
  eventType: 'StepCompleted';
  payload: {
    instanceId: string;
    stepId: string;
    decision: string;
    note?: string;
  };
}

export interface WorkflowCompleted extends EventEnvelope {
  eventType: 'WorkflowCompleted';
  payload: {
    instanceId: string;
    workflowId: string;
    version: number;
    result: string;
  };
}

// ---------------------------------------------------------------------------
// Letters events
// ---------------------------------------------------------------------------

export interface LetterRequested extends EventEnvelope {
  eventType: 'LetterRequested';
  payload: {
    requestId: string;
    employeeId: string;
    letterType: string;
    purpose: string;
  };
}

export interface LetterIssued extends EventEnvelope {
  eventType: 'LetterIssued';
  payload: {
    requestId: string;
    employeeId: string;
    documentId: string;
  };
}

// ---------------------------------------------------------------------------
// Union type — exhaustive type-check switch on eventType
// ---------------------------------------------------------------------------

export type DomainEvent =
  | EmployeeOnboarded
  | PositionChanged
  | CompensationChanged
  | EmployeeTerminated
  | DocumentExpiring
  | LeaveRequestSubmitted
  | LeaveApproved
  | LeaveDeclined
  | LeaveCancelled
  | LeaveTaken
  | LeaveBalanceAdjusted
  | StepActivated
  | StepCompleted
  | WorkflowCompleted
  | LetterRequested
  | LetterIssued;
