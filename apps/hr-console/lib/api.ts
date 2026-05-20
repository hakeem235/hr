/**
 * Typed fetch wrappers for all backend services.
 * All bases are proxied through Next.js rewrites in next.config.mjs.
 */
import type {
  LeaveRecord, LeaveBalance, LeaveType,
  EmployeeListItem, PositionRecord, CompensationRecord,
  LetterRecord,
  PayrollRun, ApprovalItem, WorkflowHistoryItem,
} from './types';

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function apiFetch<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body?.error?.message ?? 'Request failed'), {
      status: res.status,
      code: body?.error?.code,
      details: body?.error?.details,
    });
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ── Leave service (port 3001, proxied via /api/leave) ─────────────────────────

const LEAVE = '/api/leave';

export async function fetchLeaveRequests(params: {
  employeeId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: LeaveRecord[]; nextCursor?: string }> {
  return apiFetch(LEAVE, `/leave-requests${qs(params)}`);
}

export async function fetchLeaveBalances(employeeId: string): Promise<LeaveBalance[]> {
  return apiFetch(LEAVE, `/leave-balances?employeeId=${employeeId}`);
}

export async function fetchLeaveTypes(entityId: string): Promise<LeaveType[]> {
  return apiFetch(LEAVE, `/leave-types?entityId=${entityId}`);
}

export async function createLeaveRequest(input: {
  entityId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}): Promise<LeaveRecord> {
  return apiFetch(LEAVE, '/leave-requests', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(input),
  });
}

export async function fetchLeaveRequest(id: string): Promise<{ record: LeaveRecord; etag: string }> {
  const res = await fetch(`${LEAVE}/leave-requests/${id}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? 'Request failed');
  }
  const record = await res.json() as LeaveRecord;
  return { record, etag: res.headers.get('etag') ?? '""' };
}

export async function cancelLeaveRequest(id: string, etag: string, reason?: string): Promise<void> {
  const res = await fetch(`${LEAVE}/leave-requests/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-Match': etag },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body?.error?.message ?? 'Cancel failed'), { status: res.status });
  }
}

export async function fetchWorkflowHistory(params: {
  status?: 'completed' | 'cancelled';
  limit?: number;
  cursor?: string;
} = {}): Promise<{ items: WorkflowHistoryItem[]; nextCursor: string | null }> {
  type RawInstance = {
    id: string; workflowId: string; status: string; result?: string;
    createdAt: string; completedAt?: string;
    context: Record<string, unknown>;
    steps: Array<{ actorId?: string; decidedAt?: string; decision?: string; note?: string; state: string }>;
  };

  const qs2 = Object.entries({ ...params })
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

  const raw = await apiFetch<{ items: RawInstance[]; steps: Record<string, unknown>; nextCursor: string | null }>(
    WORKFLOW, `/workflow-instances${qs2 ? '?' + qs2 : ''}`,
  );

  function moduleFromId(workflowId: string): WorkflowHistoryItem['module'] {
    if (workflowId.startsWith('leave'))   return 'leave';
    if (workflowId.startsWith('letter'))  return 'letters';
    if (workflowId.startsWith('payroll')) return 'payroll';
    return 'leave';
  }

  const items: WorkflowHistoryItem[] = raw.items.map((inst) => {
    const decisionStep = inst.steps?.find((s) => s.decision);
    return {
      instanceId: inst.id,
      workflowId: inst.workflowId,
      module: moduleFromId(inst.workflowId),
      status: (inst.status as WorkflowHistoryItem['status']),
      result: inst.result as WorkflowHistoryItem['result'],
      decidedBy: decisionStep?.actorId,
      decidedAt: decisionStep?.decidedAt,
      note: decisionStep?.note,
      startedAt: inst.createdAt,
      context: inst.context,
    };
  });

  return { items, nextCursor: raw.nextCursor };
}

// ── People service (port 3003, proxied via /api/people) ───────────────────────

const PEOPLE = '/api/people';

export async function fetchEmployees(params: {
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: EmployeeListItem[]; nextCursor?: string }> {
  return apiFetch(PEOPLE, `/employees${qs(params)}`);
}

export async function fetchEmployee(id: string): Promise<EmployeeListItem> {
  return apiFetch(PEOPLE, `/employees/${id}`);
}

export async function fetchCurrentPosition(employeeId: string): Promise<PositionRecord | null> {
  return apiFetch<PositionRecord>(PEOPLE, `/employees/${employeeId}/positions/current`).catch(() => null);
}

export async function fetchCurrentCompensation(employeeId: string): Promise<CompensationRecord | null> {
  return apiFetch<CompensationRecord>(PEOPLE, `/employees/${employeeId}/compensation/current`).catch(() => null);
}

// ── Letters service (port 3004, proxied via /api/letters) ─────────────────────

const LETTERS = '/api/letters';

export async function fetchLetterRequests(params: {
  employeeId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: LetterRecord[]; nextCursor?: string }> {
  return apiFetch(LETTERS, `/letter-requests${qs(params)}`);
}

export async function createLetterRequest(input: {
  entityId: string;
  employeeId: string;
  letterType: string;
  language: string;
  purpose?: string;
  recipientName?: string;
}): Promise<LetterRecord> {
  return apiFetch(LETTERS, '/letter-requests', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(input),
  });
}

// ── Payroll service (port 3007, proxied via /api/payroll) ─────────────────────

const PAYROLL = '/api/payroll';

export async function fetchPayrollRuns(params: {
  entityId?: string;
  period?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: PayrollRun[]; nextCursor?: string }> {
  return apiFetch(PAYROLL, `/payroll-runs${qs(params)}`);
}

export async function fetchPayrollRun(id: string): Promise<PayrollRun> {
  return apiFetch(PAYROLL, `/payroll-runs/${id}`);
}

// ── Workflow engine (port 3002, proxied via /api/workflow) ─────────────────────

const WORKFLOW = '/api/workflow';

/** Raw shape returned by GET /api/v1/approvals */
interface RawApprovalItem {
  instance: {
    id: string;
    workflowId: string;
    context: Record<string, unknown>;
    createdAt: string;
  };
  step: {
    id: string;
    stepId: string;
    actorId?: string;
    slaDueAt?: string;
  };
  definition: {
    id: string;
    name: string;
  };
}

function moduleFromWorkflowId(workflowId: string): ApprovalItem['module'] {
  if (workflowId.startsWith('leave'))   return 'leave';
  if (workflowId.startsWith('letter'))  return 'letters';
  if (workflowId.startsWith('payroll')) return 'payroll';
  return 'leave';
}

function buildTitle(raw: RawApprovalItem): string {
  const ctx = raw.instance.context as Record<string, unknown>;
  const req = (ctx.request ?? {}) as Record<string, unknown>;
  const module = moduleFromWorkflowId(raw.instance.workflowId);

  if (module === 'leave') {
    const days = req.workingDays ? ` — ${req.workingDays} days` : '';
    const typeId = String(req.leaveTypeId ?? '');
    const typeName = typeId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `${typeName}${days}`;
  }
  if (module === 'letters') {
    const lt = String(req.letterType ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return lt || 'Letter Request';
  }
  return raw.definition.name;
}

function buildSummary(raw: RawApprovalItem): string {
  const ctx = raw.instance.context as Record<string, unknown>;
  const req = (ctx.request ?? {}) as Record<string, unknown>;
  const module = moduleFromWorkflowId(raw.instance.workflowId);

  if (module === 'leave') {
    const parts: string[] = [];
    if (req.startDate && req.endDate) parts.push(`${req.startDate} – ${req.endDate}`);
    if (req.workingDays)              parts.push(`${req.workingDays} working days`);
    if (req.reason)                   parts.push(`Reason: ${req.reason}`);
    return parts.join(' · ') || 'Leave request';
  }
  if (module === 'letters') {
    const parts: string[] = [];
    const lt = String(req.letterType ?? '').replace(/_/g, ' ');
    if (lt) parts.push(lt);
    if (req.language) parts.push(String(req.language).toUpperCase());
    if (req.purpose)  parts.push(`For: ${req.purpose}`);
    return parts.join(' · ') || 'Letter request';
  }
  return raw.definition.name;
}

export async function fetchApprovals(actorId?: string): Promise<ApprovalItem[]> {
  const raw = await apiFetch<{ items: RawApprovalItem[] }>(
    WORKFLOW,
    `/approvals${actorId ? `?actorId=${encodeURIComponent(actorId)}` : ''}`,
  );
  return raw.items.map((r) => ({
    instanceId: r.instance.id,
    stepId: r.step.stepId,
    module: moduleFromWorkflowId(r.instance.workflowId),
    title: buildTitle(r),
    requesterName: String(r.instance.context.requester ?? 'Employee'),
    summary: buildSummary(r),
    slaDueAt: r.step.slaDueAt ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    submittedAt: r.instance.createdAt,
  }));
}

export async function postDecision(
  instanceId: string,
  stepId: string,
  decision: 'approved' | 'declined',
  actorId: string,
  note?: string,
): Promise<void> {
  await apiFetch(WORKFLOW, `/workflow-instances/${instanceId}/steps/${stepId}/decision`, {
    method: 'POST',
    headers: { 'X-Actor-Id': actorId },
    body: JSON.stringify({ decision, ...(note ? { note } : {}) }),
  });
}

// ── Workflow Definitions (port 3002, proxied via /api/workflow) ───────────────

export async function fetchWorkflowDefinitions(): Promise<import('./types').WorkflowDefinition[]> {
  return apiFetch<import('./types').WorkflowDefinition[]>(WORKFLOW, '/workflow-definitions');
}

export async function fetchWorkflowDefinition(workflowId: string): Promise<import('./types').WorkflowDefinition> {
  return apiFetch<import('./types').WorkflowDefinition>(WORKFLOW, `/workflow-definitions/${workflowId}`);
}

export async function saveWorkflowDefinition(
  def: Omit<import('./types').WorkflowDefinition, 'version' | 'deletedAt'>,
): Promise<import('./types').WorkflowDefinition> {
  return apiFetch<import('./types').WorkflowDefinition>(WORKFLOW, '/workflow-definitions', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(def),
  });
}
