/**
 * Payroll run domain logic.
 *
 * Status machine:
 *   draft → calculating → pending_approval → approved → processing_wps → paid
 *   Any non-terminal state → cancelled
 *
 * Gross-to-net per employee:
 *   gross   = basic + housing + transport + otherAllowances
 *   GOSI    = calculateGosi(employeeId, basic, nationality)
 *   net     = gross − GOSI.employeeDeduction − otherDeductions
 *
 * Salary-change events (from people service) are applied by re-calculating
 * affected payslips within a draft run; if no draft run exists the event is
 * silently acknowledged (the next run will pick up the current compensation).
 */
import type { PayrollRun, PayslipRecord, EmployeePayInput, PayrollRepo } from './types.js';
export interface CreateRunInput {
    entityId: string;
    period: string;
    idempotencyKey: string;
}
export declare function createPayrollRun(input: CreateRunInput, repo: PayrollRepo, correlationId: string): Promise<PayrollRun>;
export declare function calculatePayrollRun(runId: string, employees: EmployeePayInput[], expectedVersion: number, repo: PayrollRepo, correlationId: string): Promise<{
    run: PayrollRun;
    payslips: PayslipRecord[];
}>;
export declare function approvePayrollRun(runId: string, expectedVersion: number, repo: PayrollRepo, correlationId: string): Promise<PayrollRun>;
export declare function submitWps(runId: string, expectedVersion: number, repo: PayrollRepo, correlationId: string): Promise<PayrollRun>;
export declare function markRunPaid(runId: string, expectedVersion: number, repo: PayrollRepo, correlationId: string): Promise<PayrollRun>;
export declare function cancelPayrollRun(runId: string, expectedVersion: number, repo: PayrollRepo, correlationId: string): Promise<PayrollRun>;
