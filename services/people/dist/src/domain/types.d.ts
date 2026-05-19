/**
 * All record types, repo interfaces, and domain event types for /services/people.
 * Follows data-model.sql exactly; adds workflow_role to PositionRecord and
 * DelegationRecord (not in SQL yet — see CLAUDE.md open decisions).
 */
export type EmploymentStatus = 'pre_hire' | 'active' | 'on_leave' | 'suspended' | 'terminated';
/**
 * The four role values the workflow engine's actor resolver understands.
 * Stored on PositionRecord so it tracks with position history.
 */
export type WorkflowRole = 'employee' | 'manager' | 'hr_ops' | 'director';
export interface EntityRecord {
    id: string;
    legalName: string;
    country: string;
    workWeek: number[];
    createdAt: string;
    version: number;
}
export interface HolidayRecord {
    entityId: string;
    holidayDate: string;
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
export interface PersonRecord {
    id: string;
    fullNameEn: string;
    fullNameAr?: string;
    nationality: string;
    dateOfBirth: string;
    nationalId?: string;
    idempotencyKey: string;
    createdAt: string;
    version: number;
}
export interface EmployeeRecord {
    id: string;
    personId: string;
    entityId: string;
    employeeNo: string;
    status: EmploymentStatus;
    hireDate: string;
    exitDate?: string;
    idempotencyKey: string;
    createdAt: string;
    version: number;
}
export interface PositionRecord {
    id: string;
    employeeId: string;
    title: string;
    grade: string;
    departmentId: string;
    reportsTo?: string;
    workflowRole: WorkflowRole;
    effectiveFrom: string;
    effectiveTo?: string;
    idempotencyKey: string;
    createdAt: string;
}
export interface CompensationRecord {
    id: string;
    employeeId: string;
    basicMinor: number;
    housingMinor: number;
    transportMinor: number;
    otherMinor: number;
    currency: string;
    effectiveFrom: string;
    effectiveTo?: string;
    idempotencyKey: string;
    createdAt: string;
}
export type DocumentType = 'offer' | 'contract' | 'letter' | 'id' | 'cert' | 'other';
export interface DocumentRecord {
    id: string;
    entityId: string;
    employeeId?: string;
    docType: DocumentType;
    title: string;
    storageKey: string;
    version: number;
    expiresOn?: string;
    idempotencyKey: string;
    createdAt: string;
}
export interface DelegationRecord {
    id: string;
    fromEmployeeId: string;
    toEmployeeId: string;
    validFrom: string;
    validUntil: string;
    createdAt: string;
}
export interface OrgNode {
    employeeId: string;
    managerId?: string;
    role: WorkflowRole;
    entityId: string;
    departmentId?: string;
    isActive: boolean;
}
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
    expiringBefore?: string;
    cursor?: string;
    limit: number;
}
export interface PeopleRepo {
    findEntityById(id: string): Promise<EntityRecord | null>;
    listEntities(): Promise<EntityRecord[]>;
    saveEntity(rec: EntityRecord, event: DomainEvent): Promise<void>;
    listHolidays(entityId: string): Promise<HolidayRecord[]>;
    upsertHoliday(rec: HolidayRecord): Promise<void>;
    deleteHoliday(entityId: string, holidayDate: string): Promise<void>;
    findDepartmentById(id: string): Promise<DepartmentRecord | null>;
    listDepartments(entityId: string): Promise<DepartmentRecord[]>;
    saveDepartment(rec: DepartmentRecord, event: DomainEvent): Promise<void>;
    findPersonById(id: string): Promise<PersonRecord | null>;
    findPersonByIdempotencyKey(key: string): Promise<PersonRecord | null>;
    listPersons(filter: PersonFilter): Promise<{
        items: PersonRecord[];
        nextCursor?: string;
    }>;
    savePerson(rec: PersonRecord, event: DomainEvent): Promise<void>;
    findEmployeeById(id: string): Promise<EmployeeRecord | null>;
    findEmployeeByIdempotencyKey(key: string): Promise<EmployeeRecord | null>;
    listEmployees(filter: EmployeeFilter): Promise<{
        items: EmployeeRecord[];
        nextCursor?: string;
    }>;
    saveEmployee(rec: EmployeeRecord, event: DomainEvent): Promise<void>;
    updateEmployeeStatus(id: string, status: EmploymentStatus, exitDate: string | undefined, expectedVersion: number, event: DomainEvent): Promise<EmployeeRecord>;
    findPositionByIdempotencyKey(key: string): Promise<PositionRecord | null>;
    listPositions(employeeId: string): Promise<PositionRecord[]>;
    getCurrentPosition(employeeId: string, asOf?: string): Promise<PositionRecord | null>;
    savePosition(rec: PositionRecord): Promise<void>;
    findCompensationByIdempotencyKey(key: string): Promise<CompensationRecord | null>;
    listCompensation(employeeId: string): Promise<CompensationRecord[]>;
    getCurrentCompensation(employeeId: string, asOf?: string): Promise<CompensationRecord | null>;
    saveCompensation(rec: CompensationRecord): Promise<void>;
    findDocumentById(id: string): Promise<DocumentRecord | null>;
    findDocumentByIdempotencyKey(key: string): Promise<DocumentRecord | null>;
    listDocuments(filter: DocumentFilter): Promise<{
        items: DocumentRecord[];
        nextCursor?: string;
    }>;
    saveDocument(rec: DocumentRecord, event: DomainEvent): Promise<void>;
    findDelegationById(id: string): Promise<DelegationRecord | null>;
    listDelegations(fromEmployeeId: string): Promise<DelegationRecord[]>;
    getActiveDelegation(fromEmployeeId: string, asOf: string): Promise<DelegationRecord | null>;
    saveDelegation(rec: DelegationRecord): Promise<void>;
    deleteDelegation(id: string): Promise<void>;
}
