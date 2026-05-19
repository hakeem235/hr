/**
 * All record types, repo interfaces, and domain event types for /services/people.
 * Follows data-model.sql exactly; adds workflow_role to PositionRecord and
 * DelegationRecord (not in SQL yet — see CLAUDE.md open decisions).
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

export type EmploymentStatus = 'pre_hire' | 'active' | 'on_leave' | 'suspended' | 'terminated';

/**
 * The four role values the workflow engine's actor resolver understands.
 * Stored on PositionRecord so it tracks with position history.
 */
export type WorkflowRole = 'employee' | 'manager' | 'hr_ops' | 'director';

// ─── Entity & department ──────────────────────────────────────────────────────

export interface EntityRecord {
  id: string;
  legalName: string;
  country: string;             // ISO-3166-1 alpha-2, default 'SA'
  workWeek: number[];          // day-of-week indices, 0=Sun; KSA default [0,1,2,3,4]
  createdAt: string;
  version: number;
}

export interface HolidayRecord {
  entityId: string;
  holidayDate: string;         // ISO date string YYYY-MM-DD
  name: string;
  isReligious: boolean;
}

export interface DepartmentRecord {
  id: string;
  entityId: string;
  name: string;
  parentId?: string;
  createdAt: string;
  version: number;
}

// ─── Person ───────────────────────────────────────────────────────────────────

export interface PersonRecord {
  id: string;
  fullNameEn: string;
  fullNameAr?: string;
  nationality: string;         // ISO-3166-1 alpha-2
  dateOfBirth: string;         // ISO date
  nationalId?: string;         // iqama / national ID
  idempotencyKey: string;
  createdAt: string;
  version: number;
}

// ─── Employee ─────────────────────────────────────────────────────────────────

export interface EmployeeRecord {
  id: string;
  personId: string;
  entityId: string;
  employeeNo: string;
  status: EmploymentStatus;
  hireDate: string;            // ISO date
  exitDate?: string;           // ISO date
  idempotencyKey: string;
  createdAt: string;
  version: number;
}

// ─── Position (effective-dated) ───────────────────────────────────────────────

export interface PositionRecord {
  id: string;
  employeeId: string;
  title: string;
  grade: string;
  departmentId: string;
  reportsTo?: string;          // employee id
  workflowRole: WorkflowRole;
  effectiveFrom: string;       // ISO date (inclusive)
  effectiveTo?: string;        // ISO date (exclusive); undefined = current
  idempotencyKey: string;
  createdAt: string;
}

// ─── Compensation (effective-dated) ───────────────────────────────────────────

export interface CompensationRecord {
  id: string;
  employeeId: string;
  basicMinor: number;          // SAR halalas (100 halalas = 1 SAR)
  housingMinor: number;
  transportMinor: number;
  otherMinor: number;
  currency: string;            // default 'SAR'
  effectiveFrom: string;       // ISO date
  effectiveTo?: string;        // undefined = current
  idempotencyKey: string;
  createdAt: string;
}

// ─── Document ─────────────────────────────────────────────────────────────────

export type DocumentType = 'offer' | 'contract' | 'letter' | 'id' | 'cert' | 'other';

export interface DocumentRecord {
  id: string;
  entityId: string;
  employeeId?: string;
  docType: DocumentType;
  title: string;
  storageKey: string;
  version: number;
  expiresOn?: string;          // ISO date
  idempotencyKey: string;
  createdAt: string;
}

// ─── Delegation ───────────────────────────────────────────────────────────────

export interface DelegationRecord {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  validFrom: string;           // ISO date
  validUntil: string;          // ISO date
  createdAt: string;
}

// ─── Org projection (consumed by workflow engine ActorStore) ─────────────────

export interface OrgNode {
  employeeId: string;
  managerId?: string;
  role: WorkflowRole;
  entityId: string;
  departmentId?: string;
  isActive: boolean;
}

// ─── Domain event ─────────────────────────────────────────────────────────────

export interface DomainEvent {
  eventId: string;
  eventType: string;
  entityId: string;
  correlationId: string;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

// ─── List filters ─────────────────────────────────────────────────────────────

export interface PersonFilter {
  cursor?: string;
  limit: number;
}

export interface EmployeeFilter {
  entityId?: string;
  status?: EmploymentStatus;
  role?: WorkflowRole;
  cursor?: string;
  limit: number;
}

export interface DocumentFilter {
  employeeId?: string;
  entityId?: string;
  docType?: DocumentType;
  expiringBefore?: string;    // ISO date — for expiry dashboard
  cursor?: string;
  limit: number;
}

// ─── Repo interface ───────────────────────────────────────────────────────────

export interface PeopleRepo {
  // Entity
  findEntityById(id: string): Promise<EntityRecord | null>;
  listEntities(): Promise<EntityRecord[]>;
  saveEntity(rec: EntityRecord, event: DomainEvent): Promise<void>;

  // Holiday
  listHolidays(entityId: string): Promise<HolidayRecord[]>;
  upsertHoliday(rec: HolidayRecord): Promise<void>;
  deleteHoliday(entityId: string, holidayDate: string): Promise<void>;

  // Department
  findDepartmentById(id: string): Promise<DepartmentRecord | null>;
  listDepartments(entityId: string): Promise<DepartmentRecord[]>;
  saveDepartment(rec: DepartmentRecord, event: DomainEvent): Promise<void>;

  // Person
  findPersonById(id: string): Promise<PersonRecord | null>;
  findPersonByIdempotencyKey(key: string): Promise<PersonRecord | null>;
  listPersons(filter: PersonFilter): Promise<{ items: PersonRecord[]; nextCursor?: string }>;
  savePerson(rec: PersonRecord, event: DomainEvent): Promise<void>;

  // Employee
  findEmployeeById(id: string): Promise<EmployeeRecord | null>;
  findEmployeeByIdempotencyKey(key: string): Promise<EmployeeRecord | null>;
  listEmployees(filter: EmployeeFilter): Promise<{ items: EmployeeRecord[]; nextCursor?: string }>;
  saveEmployee(rec: EmployeeRecord, event: DomainEvent): Promise<void>;
  updateEmployeeStatus(
    id: string,
    status: EmploymentStatus,
    exitDate: string | undefined,
    expectedVersion: number,
    event: DomainEvent,
  ): Promise<EmployeeRecord>;

  // Position
  findPositionByIdempotencyKey(key: string): Promise<PositionRecord | null>;
  listPositions(employeeId: string): Promise<PositionRecord[]>;
  getCurrentPosition(employeeId: string, asOf?: string): Promise<PositionRecord | null>;
  savePosition(rec: PositionRecord): Promise<void>;

  // Compensation
  findCompensationByIdempotencyKey(key: string): Promise<CompensationRecord | null>;
  listCompensation(employeeId: string): Promise<CompensationRecord[]>;
  getCurrentCompensation(employeeId: string, asOf?: string): Promise<CompensationRecord | null>;
  saveCompensation(rec: CompensationRecord): Promise<void>;

  // Document
  findDocumentById(id: string): Promise<DocumentRecord | null>;
  findDocumentByIdempotencyKey(key: string): Promise<DocumentRecord | null>;
  listDocuments(filter: DocumentFilter): Promise<{ items: DocumentRecord[]; nextCursor?: string }>;
  saveDocument(rec: DocumentRecord, event: DomainEvent): Promise<void>;

  // Delegation
  findDelegationById(id: string): Promise<DelegationRecord | null>;
  listDelegations(fromEmployeeId: string): Promise<DelegationRecord[]>;
  getActiveDelegation(fromEmployeeId: string, asOf: string): Promise<DelegationRecord | null>;
  saveDelegation(rec: DelegationRecord): Promise<void>;
  deleteDelegation(id: string): Promise<void>;
}
