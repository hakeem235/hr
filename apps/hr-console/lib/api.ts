/**
 * Typed fetch wrappers for the leave service.
 * Base URL proxied through Next.js rewrites: /api/leave/* → localhost:3001/api/v1/*
 */
import type { LeaveRecord, LeaveBalance, LeaveType } from './types';

const BASE = '/api/leave';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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

export async function fetchLeaveRequests(params: {
  employeeId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: LeaveRecord[]; nextCursor?: string }> {
  const q = new URLSearchParams();
  if (params.employeeId) q.set('employeeId', params.employeeId);
  if (params.status) q.set('status', params.status);
  if (params.cursor) q.set('cursor', params.cursor);
  if (params.limit) q.set('limit', String(params.limit));
  return apiFetch(`/leave-requests?${q}`);
}

export async function fetchLeaveBalances(
  employeeId: string,
): Promise<LeaveBalance[]> {
  return apiFetch(`/leave-balances?employeeId=${employeeId}`);
}

export async function fetchLeaveTypes(entityId: string): Promise<LeaveType[]> {
  return apiFetch(`/leave-types?entityId=${entityId}`);
}

export async function createLeaveRequest(input: {
  entityId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}): Promise<LeaveRecord> {
  const idempotencyKey = crypto.randomUUID();
  return apiFetch('/leave-requests', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}
