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
import { PayrollError } from './errors.js';
import { calculateGosi } from './gosi.js';
import { newId, newEvent } from './events.js';
// ── Valid transitions ─────────────────────────────────────────────────────────
const TRANSITIONS = {
    draft: ['calculating', 'cancelled'],
    calculating: ['pending_approval', 'cancelled'],
    pending_approval: ['approved', 'cancelled'],
    approved: ['processing_wps', 'cancelled'],
    processing_wps: ['paid'],
};
const CANCELLABLE = ['draft', 'calculating', 'pending_approval', 'approved'];
function assertTransition(run, to) {
    const allowed = TRANSITIONS[run.status] ?? [];
    if (!allowed.includes(to)) {
        throw new PayrollError('INVALID_STATE', `Cannot transition run from '${run.status}' to '${to}'`);
    }
}
function assertVersion(run, expected) {
    if (run.version !== expected) {
        throw new PayrollError('CONFLICT', 'ETag mismatch — run was modified by another request');
    }
}
export async function createPayrollRun(input, repo, correlationId) {
    // Idempotency
    const existing = await repo.findRunByIdempotencyKey(input.idempotencyKey);
    if (existing)
        return existing;
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(input.period)) {
        throw new PayrollError('VALIDATION', 'period must be YYYY-MM', 'period');
    }
    const now = new Date().toISOString();
    const run = {
        id: newId('pr'),
        entityId: input.entityId,
        period: input.period,
        status: 'draft',
        headcount: 0,
        grossMinor: 0,
        netMinor: 0,
        gosiEmployeeMinor: 0,
        gosiEmployerMinor: 0,
        version: 1,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
    };
    const event = newEvent('PayrollRunCreated', input.entityId, correlationId, run.id, {
        period: run.period,
    });
    return repo.saveRun(run, event);
}
// ── Calculate (draft → calculating → pending_approval) ────────────────────────
export async function calculatePayrollRun(runId, employees, expectedVersion, repo, correlationId) {
    const run = await repo.findRunById(runId);
    if (!run)
        throw new PayrollError('NOT_FOUND', `PayrollRun ${runId} not found`);
    assertVersion(run, expectedVersion);
    assertTransition(run, 'calculating');
    if (employees.length === 0) {
        throw new PayrollError('VALIDATION', 'employees list must not be empty');
    }
    const now = new Date().toISOString();
    const payslips = [];
    let totalGross = 0;
    let totalNet = 0;
    let totalGosiEmployee = 0;
    let totalGosiEmployer = 0;
    for (const emp of employees) {
        if (emp.basicMinor < 0 || emp.housingMinor < 0 || emp.transportMinor < 0) {
            throw new PayrollError('VALIDATION', `Negative pay component for employee ${emp.employeeId}`);
        }
        const gross = emp.basicMinor + emp.housingMinor + emp.transportMinor + emp.otherAllowancesMinor;
        const gosi = calculateGosi(emp.employeeId, emp.basicMinor, emp.nationality);
        const net = gross - gosi.employeeDeductionMinor - emp.otherDeductionsMinor;
        if (net < 0) {
            throw new PayrollError('VALIDATION', `Net pay is negative for employee ${emp.employeeId} — deductions exceed gross`, 'otherDeductionsMinor');
        }
        payslips.push({
            id: newId('slip'),
            payrollRunId: runId,
            entityId: emp.entityId,
            employeeId: emp.employeeId,
            period: run.period,
            nationality: emp.nationality,
            basicMinor: emp.basicMinor,
            housingMinor: emp.housingMinor,
            transportMinor: emp.transportMinor,
            otherAllowancesMinor: emp.otherAllowancesMinor,
            grossMinor: gross,
            gosiDeductionEmployeeMinor: gosi.employeeDeductionMinor,
            gosiContributionEmployerMinor: gosi.employerContributionMinor,
            otherDeductionsMinor: emp.otherDeductionsMinor,
            netMinor: net,
            status: 'draft',
            version: 1,
            createdAt: now,
        });
        totalGross += gross;
        totalNet += net;
        totalGosiEmployee += gosi.employeeDeductionMinor;
        totalGosiEmployer += gosi.employerContributionMinor;
    }
    await repo.savePayslips(payslips);
    const updatedRun = {
        ...run,
        status: 'pending_approval',
        headcount: employees.length,
        grossMinor: totalGross,
        netMinor: totalNet,
        gosiEmployeeMinor: totalGosiEmployee,
        gosiEmployerMinor: totalGosiEmployer,
        version: run.version + 1,
        calculatedAt: now,
    };
    const event = newEvent('PayrollRunCalculated', run.entityId, correlationId, run.id, {
        headcount: employees.length,
        grossMinor: totalGross,
        netMinor: totalNet,
        gosiEmployeeMinor: totalGosiEmployee,
        gosiEmployerMinor: totalGosiEmployer,
    });
    const saved = await repo.updateRun(updatedRun, event);
    return { run: saved, payslips };
}
// ── Approve ───────────────────────────────────────────────────────────────────
export async function approvePayrollRun(runId, expectedVersion, repo, correlationId) {
    const run = await repo.findRunById(runId);
    if (!run)
        throw new PayrollError('NOT_FOUND', `PayrollRun ${runId} not found`);
    assertVersion(run, expectedVersion);
    assertTransition(run, 'approved');
    const updated = {
        ...run,
        status: 'approved',
        version: run.version + 1,
        approvedAt: new Date().toISOString(),
    };
    await repo.updatePayslipStatus(runId, 'approved');
    const event = newEvent('PayrollRunApproved', run.entityId, correlationId, run.id, {});
    return repo.updateRun(updated, event);
}
// ── Submit WPS ────────────────────────────────────────────────────────────────
export async function submitWps(runId, expectedVersion, repo, correlationId) {
    const run = await repo.findRunById(runId);
    if (!run)
        throw new PayrollError('NOT_FOUND', `PayrollRun ${runId} not found`);
    assertVersion(run, expectedVersion);
    assertTransition(run, 'processing_wps');
    const updated = {
        ...run,
        status: 'processing_wps',
        version: run.version + 1,
    };
    const event = newEvent('PayrollRunWpsSubmitted', run.entityId, correlationId, run.id, {});
    return repo.updateRun(updated, event);
}
// ── Mark paid ─────────────────────────────────────────────────────────────────
export async function markRunPaid(runId, expectedVersion, repo, correlationId) {
    const run = await repo.findRunById(runId);
    if (!run)
        throw new PayrollError('NOT_FOUND', `PayrollRun ${runId} not found`);
    assertVersion(run, expectedVersion);
    assertTransition(run, 'paid');
    const now = new Date().toISOString();
    const updated = {
        ...run,
        status: 'paid',
        version: run.version + 1,
        paidAt: now,
    };
    await repo.updatePayslipStatus(runId, 'paid');
    const event = newEvent('PayrollRunPaid', run.entityId, correlationId, run.id, { paidAt: now });
    return repo.updateRun(updated, event);
}
// ── Cancel ────────────────────────────────────────────────────────────────────
export async function cancelPayrollRun(runId, expectedVersion, repo, correlationId) {
    const run = await repo.findRunById(runId);
    if (!run)
        throw new PayrollError('NOT_FOUND', `PayrollRun ${runId} not found`);
    assertVersion(run, expectedVersion);
    if (!CANCELLABLE.includes(run.status)) {
        throw new PayrollError('INVALID_STATE', `Run in status '${run.status}' cannot be cancelled`);
    }
    const updated = {
        ...run,
        status: 'cancelled',
        version: run.version + 1,
    };
    const event = newEvent('PayrollRunCancelled', run.entityId, correlationId, run.id, {});
    return repo.updateRun(updated, event);
}
