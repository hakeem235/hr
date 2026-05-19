/**
 * In-memory adapters for the workflow engine's port interfaces.
 * Used in tests and dev mode; replace with Postgres adapters for production.
 */

import type {
  WorkflowDefinition,
  WorkflowInstance,
  DefinitionRepo,
  InstanceRepo,
  WorkingCalendar,
} from '../engine/types.js';
import type { CalendarRepo } from '../engine/sla.js';
import type { OrgRepo } from '../engine/actor-resolver.js';

// ---------------------------------------------------------------------------
// Definition repo
// ---------------------------------------------------------------------------

export class InMemoryDefinitionRepo implements DefinitionRepo {
  private store = new Map<string, WorkflowDefinition[]>();

  async save(def: WorkflowDefinition): Promise<void> {
    const versions = this.store.get(def.workflowId) ?? [];
    const idx = versions.findIndex((v) => v.version === def.version);
    if (idx >= 0) versions[idx] = def;
    else versions.push(def);
    this.store.set(def.workflowId, versions);
  }

  async findByTrigger(trigger: string): Promise<WorkflowDefinition | null> {
    for (const versions of this.store.values()) {
      const active = versions
        .filter((v) => v.trigger === trigger && !v.deletedAt)
        .sort((a, b) => b.version - a.version)[0];
      if (active) return active;
    }
    return null;
  }

  async findById(
    workflowId: string,
    version?: number,
  ): Promise<WorkflowDefinition | null> {
    const versions = this.store.get(workflowId) ?? [];
    if (version !== undefined) {
      return versions.find((v) => v.version === version) ?? null;
    }
    return versions.sort((a, b) => b.version - a.version)[0] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Instance repo
// ---------------------------------------------------------------------------

export class InMemoryInstanceRepo implements InstanceRepo {
  private store = new Map<string, WorkflowInstance>();

  async save(instance: WorkflowInstance): Promise<void> {
    this.store.set(instance.id, { ...instance, steps: [...instance.steps] });
  }

  async findById(id: string): Promise<WorkflowInstance | null> {
    return this.store.get(id) ?? null;
  }

  async findByIdOrThrow(id: string): Promise<WorkflowInstance> {
    const inst = this.store.get(id);
    if (!inst) throw new Error(`WorkflowInstance '${id}' not found`);
    return inst;
  }
}

// ---------------------------------------------------------------------------
// Calendar repo — KSA defaults; real impl reads entity table
// ---------------------------------------------------------------------------

export class InMemoryCalendarRepo implements CalendarRepo {
  private calendars = new Map<string, WorkingCalendar>();

  setCalendar(entityId: string, cal: WorkingCalendar): void {
    this.calendars.set(entityId, cal);
  }

  async getCalendar(entityId: string): Promise<WorkingCalendar> {
    return (
      this.calendars.get(entityId) ?? {
        workWeek: [0, 1, 2, 3, 4],   // KSA Sun–Thu
        holidays: new Set<string>(),
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Org repo — minimal stub; real impl reads position table
// ---------------------------------------------------------------------------

export class InMemoryOrgRepo implements OrgRepo {
  private managers = new Map<string, string>();
  private roleMembers = new Map<string, string[]>();
  private delegates = new Map<string, string>();

  setManager(employeeId: string, managerId: string): void {
    this.managers.set(employeeId, managerId);
  }

  setRoleMembers(role: string, scopeId: string, members: string[]): void {
    this.roleMembers.set(`${role}:${scopeId}`, members);
  }

  setDelegate(employeeId: string, delegateId: string): void {
    this.delegates.set(employeeId, delegateId);
  }

  async getManagerOf(employeeId: string): Promise<string | null> {
    return this.managers.get(employeeId) ?? null;
  }

  async getEmployeesByRole(role: string, scopeId: string): Promise<string[]> {
    return this.roleMembers.get(`${role}:${scopeId}`) ?? [];
  }

  async getActiveDelegateFor(employeeId: string): Promise<string | null> {
    return this.delegates.get(employeeId) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Event publisher — collects for tests / logs in dev
// ---------------------------------------------------------------------------

export class InMemoryEventPublisher {
  public events: Record<string, unknown>[] = [];

  async publish(event: Record<string, unknown>): Promise<void> {
    this.events.push(event);
  }
}
