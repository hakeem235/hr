/**
 * Core types for the payroll service.
 *
 * Money rule: ALL monetary amounts are in minor units (halalas, 1 SAR = 100 halalas).
 * Never store or compute floats for money. Use Math.floor for division.
 */
export type PayrollRunStatus = 'draft' | 'calculating' | 'pending_approval' | 'approved' | 'processing_wps' | 'paid' | 'cancelled';
export interface PayrollRun {
    id: string;
    entityId: string;
    period: string;
    status: PayrollRunStatus;
    headcount: number;
    grossMinor: number;
    netMinor: number;
    gosiEmployeeMinor: number;
    gosiEmployerMinor: number;
    version: number;
    idempotencyKey: string;
    createdAt: string;
    calculatedAt?: string;
    approvedAt?: string;
    paidAt?: string;
}
export type PayslipStatus = 'draft' | 'approved' | 'paid';
export interface PayslipRecord {
    id: string;
    payrollRunId: string;
    entityId: string;
    employeeId: string;
    period: string;
    nationality: string;
    basicMinor: number;
    housingMinor: number;
    transportMinor: number;
    otherAllowancesMinor: number;
    grossMinor: number;
    gosiDeductionEmployeeMinor: number;
    gosiContributionEmployerMinor: number;
    otherDeductionsMinor: number;
    netMinor: number;
    status: PayslipStatus;
    version: number;
    createdAt: string;
}
export interface GosiContribution {
    employeeId: string;
    basicMinor: number;
    nationality: string;
    isSaudi: boolean;
    /** Employee share (annuity): 9.75 % × basic for Saudis, 0 for expats */
    employeeDeductionMinor: number;
    /** Employer share: 11.75 % × basic for Saudis, 2 % × basic for expats */
    employerContributionMinor: number;
    /** Total GOSI cost to employer = employer share */
    totalContributionMinor: number;
}
export interface EmployeePayInput {
    employeeId: string;
    entityId: string;
    nationality: string;
    basicMinor: number;
    housingMinor: number;
    transportMinor: number;
    otherAllowancesMinor: number;
    otherDeductionsMinor: number;
}
export interface RunFilter {
    entityId?: string;
    period?: string;
    status?: PayrollRunStatus;
    cursor?: string;
    limit?: number;
}
export interface PayrollRepo {
    findRunByIdempotencyKey(key: string): Promise<PayrollRun | null>;
    saveRun(run: PayrollRun, event: DomainEvent): Promise<PayrollRun>;
    findRunById(id: string): Promise<PayrollRun | null>;
    updateRun(run: PayrollRun, event: DomainEvent): Promise<PayrollRun>;
    listRuns(filter: RunFilter): Promise<{
        items: PayrollRun[];
        nextCursor: string | null;
    }>;
    savePayslips(slips: PayslipRecord[]): Promise<void>;
    findPayslipById(id: string): Promise<PayslipRecord | null>;
    listPayslipsByRun(runId: string): Promise<PayslipRecord[]>;
    updatePayslipStatus(runId: string, status: PayslipStatus): Promise<void>;
    findEventsByCorrelationId(correlationId: string): Promise<DomainEvent[]>;
}
export interface DomainEvent {
    eventId: string;
    eventType: string;
    entityId: string;
    correlationId: string;
    occurredAt: string;
    aggregateType: 'payroll_run';
    aggregateId: string;
    payload: Record<string, unknown>;
}
