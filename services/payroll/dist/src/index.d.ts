import type { PayrollRepo, PayrollRun, PayslipRecord, DomainEvent, RunFilter, PayslipStatus } from './domain/types.js';
export declare class InMemoryPayrollRepo implements PayrollRepo {
    private runs;
    private byKey;
    private payslips;
    private outbox;
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
