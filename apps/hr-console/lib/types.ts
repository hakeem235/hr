/** Shared types mirroring the leave API contract (leave-api.md). */

export type LeaveStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'declined'
  | 'cancelled'
  | 'scheduled'
  | 'taken';

export interface LeaveRecord {
  id: string;
  entityId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;   // ISO 8601 date
  endDate: string;
  workingDays: number;
  reason?: string;
  status: LeaveStatus;
  workflowInstanceId?: string;
  currentStep?: {
    id: string;
    actor: string;
    slaDueAt: string;
  };
  createdAt: string;
}

export interface LeaveBalance {
  leaveTypeId: string;
  leaveTypeName: string;
  accruedDays: number;
  usedDays: number;
  carriedDays: number;
}

export interface LeaveType {
  id: string;
  name: string;
  nameAr: string;
  maxDaysPerYear: number;
}

/** Workflow engine approval step (workflow-engine.md §3) */
export interface ApprovalItem {
  instanceId: string;
  stepId: string;
  module: 'leave' | 'letters' | 'payroll' | 'benefits';
  title: string;
  requesterName: string;
  requesterAvatarUrl?: string;
  summary: string;
  slaDueAt: string;
  submittedAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}
