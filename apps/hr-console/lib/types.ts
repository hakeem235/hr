/** Shared types mirroring service API contracts. */

// ── Leave ────────────────────────────────────────────────────────────────────

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
  startDate: string;
  endDate: string;
  workingDays: number;
  reason?: string;
  status: LeaveStatus;
  workflowInstanceId?: string;
  currentStep?: { id: string; actor: string; slaDueAt: string };
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

// ── Workflow / Approvals ──────────────────────────────────────────────────────

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

export interface WorkflowHistoryItem {
  instanceId: string;
  workflowId: string;
  module: 'leave' | 'letters' | 'payroll' | 'benefits';
  status: 'completed' | 'cancelled';
  result?: 'approved' | 'declined';
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
  startedAt: string;
  context: Record<string, unknown>;
}

// ── People ────────────────────────────────────────────────────────────────────

export type EmploymentStatus =
  | 'active'
  | 'probation'
  | 'on_leave'
  | 'suspended'
  | 'terminated'
  | 'inactive';

export interface EmployeeListItem {
  employeeId: string;
  employeeNumber: string;
  fullNameEn: string;
  fullNameAr?: string;
  nationality: string;
  status: EmploymentStatus;
  hireDate: string;
  departmentName?: string;
  positionTitle?: string;
  managerId?: string;
}

export interface PositionRecord {
  id: string;
  employeeId: string;
  title: string;
  departmentId: string;
  departmentName?: string;
  grade?: string;
  workflowRole: 'employee' | 'manager' | 'hr_ops' | 'director';
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface CompensationRecord {
  id: string;
  employeeId: string;
  basicMinor: number;       // halalas (integer)
  housingMinor: number;
  transportMinor: number;
  effectiveFrom: string;
  effectiveTo?: string;
  currency: string;
}

// ── Letters ───────────────────────────────────────────────────────────────────

export type LetterStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'generating'
  | 'issued'
  | 'declined'
  | 'cancelled';

export type LetterLanguage = 'en' | 'ar' | 'bilingual';

export type LetterType =
  | 'salary_certificate'
  | 'employment_certificate'
  | 'experience_letter'
  | 'noc'
  | 'bank_letter'
  | 'embassy_letter'
  | 'salary_transfer';

export interface LetterRecord {
  id: string;
  entityId: string;
  employeeId: string;
  letterType: LetterType;
  language: LetterLanguage;
  purpose?: string;
  recipientName?: string;
  status: LetterStatus;
  workflowInstanceId?: string;
  version: number;
  createdAt: string;
  issuedAt?: string;
}

// ── Payroll ───────────────────────────────────────────────────────────────────

export type PayrollRunStatus = 'draft' | 'calculating' | 'pending_approval' | 'approved' | 'processing_wps' | 'paid' | 'cancelled';

export interface PayrollRun {
  id: string;
  entityId: string;
  period: string;          // 'YYYY-MM'
  headcount: number;
  grossMinor: number;      // halalas
  netMinor: number;
  status: PayrollRunStatus;
  createdAt: string;
  paidAt?: string;
}

// ── Compliance ────────────────────────────────────────────────────────────────

export type DocType = 'iqama' | 'passport' | 'contract' | 'driving' | 'cchi';

export interface DocExpiryItem {
  employeeId: string;
  employeeName: string;
  docType: DocType;
  expiryDate: string;       // ISO 8601 date
  daysUntilExpiry: number;  // negative = already expired
}

export interface NitaqatStats {
  totalEmployees: number;
  saudiNationals: number;
  targetPercent: number;    // e.g. 20 for 20%
  band: 'platinum' | 'high_green' | 'medium_green' | 'low_green' | 'yellow' | 'red';
}

// ── Onboarding / Offboarding ──────────────────────────────────────────────────

export type OnboardingStage = 'offer' | 'documents' | 'accounts' | 'orientation' | 'active';
export type OffboardingStage = 'notice' | 'clearance' | 'documents' | 'settlement' | 'completed';

export interface OnboardingCase {
  id: string;
  employeeName: string;
  position: string;
  department: string;
  startDate: string;
  stage: OnboardingStage;
  managerId?: string;
  managerName?: string;
}

export interface OffboardingCase {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  lastDay: string;
  stage: OffboardingStage;
  resignationType: 'voluntary' | 'employer_termination';
}

// ── Shared ────────────────────────────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

// ── Workflow Definitions ──────────────────────────────────────────────────────

export interface ActorSpec {
  strategy: 'reports_to' | 'role' | 'named' | 'dynamic';
  of?: string;
  role?: string;
  scope?: string;
  employeeId?: string;
}

export interface SlaSpec {
  duration: string;
  businessHours: boolean;
}

export interface Transition {
  on: string;
  to: string;
}

export interface ApprovalStep {
  id: string;
  type: 'approval';
  actor: ActorSpec;
  sla?: SlaSpec;
  onTimeout?: 'escalate' | 'auto-approve' | 'notify-only';
  transitions: Transition[];
  condition?: string;
  onSkip?: string;
}

export interface AutomatedStep {
  id: string;
  type: 'automated';
  action: string;
  params: Record<string, unknown>;
  transitions: Transition[];
  condition?: string;
  onSkip?: string;
}

export interface WaitStep {
  id: string;
  type: 'wait';
  until?: string;
  signal?: string;
  transitions: Transition[];
  condition?: string;
  onSkip?: string;
}

export interface BranchStep {
  id: string;
  type: 'branch';
  branches: Array<{ condition: string; to: string }>;
  transitions: Transition[];
  condition?: string;
  onSkip?: string;
}

export interface ParallelStep {
  id: string;
  type: 'parallel';
  branches: string[];
  joinOn: 'all' | 'any';
  transitions: Transition[];
  condition?: string;
  onSkip?: string;
}

export interface TerminalStep {
  id: string;
  type: 'terminal';
  result: string;
  transitions: [];
  condition?: string;
  onSkip?: string;
}

export type StepDef =
  | ApprovalStep
  | AutomatedStep
  | WaitStep
  | BranchStep
  | ParallelStep
  | TerminalStep;

export interface WorkflowDefinition {
  workflowId: string;
  version: number;
  trigger: string;
  steps: StepDef[];
  deletedAt?: string;
}
