/**
 * Leave service entrypoint.
 * Wires in-memory adapters for dev; swap for Postgres adapters in production.
 *
 * The WorkflowClient here calls the workflow-engine service over HTTP.
 * In dev mode the engine URL defaults to localhost:3001.
 */

import Fastify from 'fastify';
import { registerLeaveRoutes } from './routes/leave-routes.js';
import type { LeaveRepo, WorkflowClient, LeaveRecord } from './domain/create-request.js';
import type { WorkingCalendar } from './domain/working-days.js';

// ---------------------------------------------------------------------------
// In-memory adapters (dev / test use; replace with Postgres in production)
// ---------------------------------------------------------------------------

class InMemoryLeaveRepo implements LeaveRepo {
  private byIdempotency = new Map<string, LeaveRecord>();
  private records: LeaveRecord[] = [];

  async findByIdempotencyKey(
    employeeId: string,
    key: string,
  ): Promise<LeaveRecord | null> {
    return this.byIdempotency.get(`${employeeId}:${key}`) ?? null;
  }

  async getBalance(
    _employeeId: string,
    _leaveTypeId: string,
    _year: number,
  ) {
    // Default: 21 days accrued, none used. Real impl queries leave_balance table.
    return { accruedDays: 21, usedDays: 0, carriedDays: 0 };
  }

  async hasOverlap(
    employeeId: string,
    start: string,
    end: string,
  ): Promise<boolean> {
    return this.records.some(
      (r) =>
        r.employeeId === employeeId &&
        r.status !== 'pending_approval' &&
        r.startDate <= end &&
        r.endDate >= start,
    );
  }

  async saveWithEvent(record: LeaveRecord): Promise<void> {
    this.records.push(record);
    this.byIdempotency.set(`${record.employeeId}:${record.idempotencyKey}`, record);
  }
}

// ---------------------------------------------------------------------------
// Workflow client — calls the workflow-engine service
// ---------------------------------------------------------------------------

const WORKFLOW_ENGINE_URL =
  process.env.WORKFLOW_ENGINE_URL ?? 'http://localhost:3001';

const httpWorkflowClient: WorkflowClient = {
  async start(trigger, context) {
    const res = await fetch(`${WORKFLOW_ENGINE_URL}/api/v1/workflow-instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ trigger, context, entityId: context.entityId }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Workflow engine error ${res.status}: ${body}`);
    }
    const data = await res.json() as { id: string };
    return data.id;
  },
};

// ---------------------------------------------------------------------------
// KSA default calendar (real impl queries entity + holiday_calendar tables)
// ---------------------------------------------------------------------------

const ksaCalendar: WorkingCalendar = {
  workWeek: [0, 1, 2, 3, 4], // Sun–Thu
  holidays: new Set<string>(),
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const app = Fastify({ logger: true });

registerLeaveRoutes(app, {
  repo: new InMemoryLeaveRepo(),
  wf: httpWorkflowClient,
  calendarFor: async (_entityId) => ksaCalendar,
});

const port = Number(process.env.PORT ?? 3002);
await app.listen({ port, host: '0.0.0.0' });
