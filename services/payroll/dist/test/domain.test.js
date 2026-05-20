/**
 * Payroll domain tests.
 * 25 tests covering:
 *   — GOSI calculator (Saudi + expat, rates, integer safety, validation)
 *   — Gross-to-net calculation (pay components, net = gross − deductions)
 *   — PayrollRun lifecycle (create, idempotency, calculate, approve, submit-wps, paid, cancel)
 *   — Payslip generation (per-employee breakdown)
 *   — State machine guards (invalid transitions, stale ETag)
 *   — Salary-change event: compensation update reflected in next calculation
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateGosi } from '../src/domain/gosi.js';
import { createPayrollRun, calculatePayrollRun, approvePayrollRun, submitWps, markRunPaid, cancelPayrollRun, } from '../src/domain/payroll-run.js';
import { PayrollError } from '../src/domain/errors.js';
// ── Minimal in-memory repo for tests ─────────────────────────────────────────
function makeRepo() {
    const runs = new Map();
    const byKey = new Map();
    const payslips = new Map();
    const outbox = new Map();
    return {
        async findRunByIdempotencyKey(key) { return byKey.get(key) ?? null; },
        async saveRun(run, event) {
            runs.set(run.id, run);
            byKey.set(run.idempotencyKey, run);
            outbox.set(event.eventId, event);
            return run;
        },
        async findRunById(id) { return runs.get(id) ?? null; },
        async updateRun(run, event) {
            runs.set(run.id, run);
            byKey.set(run.idempotencyKey, run);
            outbox.set(event.eventId, event);
            return run;
        },
        async listRuns(filter) {
            let items = [...runs.values()];
            if (filter.entityId)
                items = items.filter((r) => r.entityId === filter.entityId);
            if (filter.status)
                items = items.filter((r) => r.status === filter.status);
            return { items, nextCursor: null };
        },
        async savePayslips(slips) { for (const s of slips)
            payslips.set(s.id, s); },
        async findPayslipById(id) { return payslips.get(id) ?? null; },
        async listPayslipsByRun(runId) { return [...payslips.values()].filter((s) => s.payrollRunId === runId); },
        async updatePayslipStatus(runId, status) {
            for (const [id, slip] of payslips) {
                if (slip.payrollRunId === runId)
                    payslips.set(id, { ...slip, status });
            }
        },
        async findEventsByCorrelationId(correlationId) {
            return [...outbox.values()].filter((e) => e.correlationId === correlationId);
        },
    };
}
const ENTITY = 'ent_default';
const CORR = 'corr_test_01';
// ── GOSI calculator ───────────────────────────────────────────────────────────
describe('GOSI: Saudi national', () => {
    it('employee deduction is 9.75% of basic', () => {
        const r = calculateGosi('emp_01', 1_000_000, 'SA');
        // 9.75% × 1,000,000 = 97,500
        assert.equal(r.employeeDeductionMinor, 97_500);
    });
    it('employer contribution is 11.75% of basic', () => {
        const r = calculateGosi('emp_01', 1_000_000, 'SA');
        // 11.75% × 1,000,000 = 117,500
        assert.equal(r.employerContributionMinor, 117_500);
    });
    it('isSaudi flag is true', () => {
        const r = calculateGosi('emp_01', 500_000, 'SA');
        assert.equal(r.isSaudi, true);
    });
});
describe('GOSI: expatriate', () => {
    it('employee deduction is 0', () => {
        const r = calculateGosi('emp_02', 1_000_000, 'EG');
        assert.equal(r.employeeDeductionMinor, 0);
    });
    it('employer contribution is 2% of basic', () => {
        const r = calculateGosi('emp_02', 1_000_000, 'EG');
        // 2% × 1,000,000 = 20,000
        assert.equal(r.employerContributionMinor, 20_000);
    });
    it('isSaudi flag is false', () => {
        const r = calculateGosi('emp_02', 500_000, 'BH');
        assert.equal(r.isSaudi, false);
    });
});
describe('GOSI: integer safety', () => {
    it('amounts are integers (no floats)', () => {
        const r = calculateGosi('emp_03', 133_333, 'SA');
        // 9.75% × 133,333 = 12,999.9675 → floor = 12,999
        assert.equal(Number.isInteger(r.employeeDeductionMinor), true);
        assert.equal(Number.isInteger(r.employerContributionMinor), true);
        assert.equal(r.employeeDeductionMinor, 12_999);
    });
    it('rejects negative basicMinor', () => {
        assert.throws(() => calculateGosi('emp_01', -1, 'SA'), (e) => e instanceof PayrollError && e.code === 'VALIDATION');
    });
});
// ── PayrollRun lifecycle ──────────────────────────────────────────────────────
const EMPLOYEES = [
    { employeeId: 'emp_mgr01', entityId: ENTITY, nationality: 'SA', basicMinor: 2_000_000, housingMinor: 800_000, transportMinor: 300_000, otherAllowancesMinor: 0, otherDeductionsMinor: 0 },
    { employeeId: 'emp_018f23', entityId: ENTITY, nationality: 'SA', basicMinor: 1_500_000, housingMinor: 600_000, transportMinor: 200_000, otherAllowancesMinor: 0, otherDeductionsMinor: 0 },
    { employeeId: 'emp_012e44', entityId: ENTITY, nationality: 'BH', basicMinor: 1_200_000, housingMinor: 480_000, transportMinor: 160_000, otherAllowancesMinor: 0, otherDeductionsMinor: 0 },
];
describe('createPayrollRun', () => {
    it('creates a draft run', async () => {
        const repo = makeRepo();
        const run = await createPayrollRun({ entityId: ENTITY, period: '2026-06', idempotencyKey: 'key_01' }, repo, CORR);
        assert.equal(run.status, 'draft');
        assert.equal(run.period, '2026-06');
        assert.equal(run.entityId, ENTITY);
        assert.equal(run.version, 1);
        assert.equal(run.headcount, 0);
    });
    it('idempotent — same key returns same run', async () => {
        const repo = makeRepo();
        const r1 = await createPayrollRun({ entityId: ENTITY, period: '2026-06', idempotencyKey: 'key_02' }, repo, CORR);
        const r2 = await createPayrollRun({ entityId: ENTITY, period: '2026-06', idempotencyKey: 'key_02' }, repo, CORR);
        assert.equal(r1.id, r2.id);
    });
    it('rejects invalid period format', async () => {
        const repo = makeRepo();
        await assert.rejects(() => createPayrollRun({ entityId: ENTITY, period: '06-2026', idempotencyKey: 'key_03' }, repo, CORR), (e) => e instanceof PayrollError && e.code === 'VALIDATION');
    });
});
describe('calculatePayrollRun', () => {
    async function withDraft() {
        const repo = makeRepo();
        const run = await createPayrollRun({ entityId: ENTITY, period: '2026-06', idempotencyKey: 'key_calc' }, repo, CORR);
        return { repo, run };
    }
    it('transitions to pending_approval and computes totals', async () => {
        const { repo, run } = await withDraft();
        const { run: r } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        assert.equal(r.status, 'pending_approval');
        assert.equal(r.headcount, 3);
        assert.ok(r.grossMinor > 0);
        assert.ok(r.netMinor > 0);
        assert.ok(r.netMinor < r.grossMinor); // deductions applied
    });
    it('gross = sum of all pay components', async () => {
        const { repo, run } = await withDraft();
        const { payslips } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        for (const slip of payslips) {
            const expected = slip.basicMinor + slip.housingMinor + slip.transportMinor + slip.otherAllowancesMinor;
            assert.equal(slip.grossMinor, expected);
        }
    });
    it('net = gross − GOSI employee − otherDeductions', async () => {
        const { repo, run } = await withDraft();
        const { payslips } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        for (const slip of payslips) {
            const expected = slip.grossMinor - slip.gosiDeductionEmployeeMinor - slip.otherDeductionsMinor;
            assert.equal(slip.netMinor, expected);
        }
    });
    it('all amounts are integers', async () => {
        const { repo, run } = await withDraft();
        const { run: r, payslips } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        assert.ok(Number.isInteger(r.grossMinor));
        assert.ok(Number.isInteger(r.netMinor));
        assert.ok(Number.isInteger(r.gosiEmployeeMinor));
        assert.ok(Number.isInteger(r.gosiEmployerMinor));
        for (const slip of payslips) {
            assert.ok(Number.isInteger(slip.grossMinor));
            assert.ok(Number.isInteger(slip.netMinor));
            assert.ok(Number.isInteger(slip.gosiDeductionEmployeeMinor));
            assert.ok(Number.isInteger(slip.gosiContributionEmployerMinor));
        }
    });
    it('Saudi employee has 9.75% GOSI deduction; expat has 0', async () => {
        const { repo, run } = await withDraft();
        const { payslips } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        const saudi = payslips.find((s) => s.nationality === 'SA');
        const expat = payslips.find((s) => s.nationality === 'BH');
        const expectedSaudi = Math.floor((saudi.basicMinor * 975) / 10_000);
        assert.equal(saudi.gosiDeductionEmployeeMinor, expectedSaudi);
        assert.equal(expat.gosiDeductionEmployeeMinor, 0);
    });
    it('employer pays 11.75% for Saudi, 2% for expat', async () => {
        const { repo, run } = await withDraft();
        const { payslips } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        const saudi = payslips.find((s) => s.nationality === 'SA');
        const expat = payslips.find((s) => s.nationality === 'BH');
        assert.equal(saudi.gosiContributionEmployerMinor, Math.floor((saudi.basicMinor * 1175) / 10_000));
        assert.equal(expat.gosiContributionEmployerMinor, Math.floor((expat.basicMinor * 200) / 10_000));
    });
    it('rejects non-draft run', async () => {
        const { repo, run } = await withDraft();
        const { run: approved } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        await assert.rejects(() => calculatePayrollRun(approved.id, EMPLOYEES, approved.version, repo, CORR), (e) => e instanceof PayrollError && e.code === 'INVALID_STATE');
    });
    it('rejects stale ETag', async () => {
        const { repo, run } = await withDraft();
        await assert.rejects(() => calculatePayrollRun(run.id, EMPLOYEES, 99, repo, CORR), (e) => e instanceof PayrollError && e.code === 'CONFLICT');
    });
    it('rejects empty employee list', async () => {
        const { repo, run } = await withDraft();
        await assert.rejects(() => calculatePayrollRun(run.id, [], run.version, repo, CORR), (e) => e instanceof PayrollError && e.code === 'VALIDATION');
    });
    it('rejects when net pay would be negative', async () => {
        const { repo, run } = await withDraft();
        const badEmployee = [{ ...EMPLOYEES[0], otherDeductionsMinor: 99_999_999 }];
        await assert.rejects(() => calculatePayrollRun(run.id, badEmployee, run.version, repo, CORR), (e) => e instanceof PayrollError && e.code === 'VALIDATION');
    });
});
describe('approvePayrollRun', () => {
    async function withPendingApproval() {
        const repo = makeRepo();
        const run = await createPayrollRun({ entityId: ENTITY, period: '2026-06', idempotencyKey: 'key_appr' }, repo, CORR);
        const { run: calculated } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        return { repo, run: calculated };
    }
    it('pending_approval → approved', async () => {
        const { repo, run } = await withPendingApproval();
        const approved = await approvePayrollRun(run.id, run.version, repo, CORR);
        assert.equal(approved.status, 'approved');
        assert.ok(approved.approvedAt);
        assert.equal(approved.version, run.version + 1);
    });
    it('rejects stale ETag', async () => {
        const { repo, run } = await withPendingApproval();
        await assert.rejects(() => approvePayrollRun(run.id, 99, repo, CORR), (e) => e instanceof PayrollError && e.code === 'CONFLICT');
    });
});
describe('submitWps + markRunPaid', () => {
    async function withApproved() {
        const repo = makeRepo();
        const run = await createPayrollRun({ entityId: ENTITY, period: '2026-06', idempotencyKey: 'key_wps' }, repo, CORR);
        const { run: calc } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        const approved = await approvePayrollRun(calc.id, calc.version, repo, CORR);
        return { repo, run: approved };
    }
    it('approved → processing_wps', async () => {
        const { repo, run } = await withApproved();
        const wps = await submitWps(run.id, run.version, repo, CORR);
        assert.equal(wps.status, 'processing_wps');
    });
    it('processing_wps → paid, payslips updated', async () => {
        const { repo, run } = await withApproved();
        const wps = await submitWps(run.id, run.version, repo, CORR);
        const paid = await markRunPaid(wps.id, wps.version, repo, CORR);
        assert.equal(paid.status, 'paid');
        assert.ok(paid.paidAt);
        const slips = await repo.listPayslipsByRun(paid.id);
        assert.ok(slips.every((s) => s.status === 'paid'));
    });
});
describe('cancelPayrollRun', () => {
    it('cancels from draft', async () => {
        const repo = makeRepo();
        const run = await createPayrollRun({ entityId: ENTITY, period: '2026-07', idempotencyKey: 'key_cncl' }, repo, CORR);
        const cancelled = await cancelPayrollRun(run.id, run.version, repo, CORR);
        assert.equal(cancelled.status, 'cancelled');
    });
    it('cancels from pending_approval', async () => {
        const repo = makeRepo();
        const run = await createPayrollRun({ entityId: ENTITY, period: '2026-07', idempotencyKey: 'key_cncl2' }, repo, CORR);
        const { run: calc } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        const cancelled = await cancelPayrollRun(calc.id, calc.version, repo, CORR);
        assert.equal(cancelled.status, 'cancelled');
    });
    it('rejects cancel from paid', async () => {
        const repo = makeRepo();
        const run = await createPayrollRun({ entityId: ENTITY, period: '2026-07', idempotencyKey: 'key_cncl3' }, repo, CORR);
        const { run: calc } = await calculatePayrollRun(run.id, EMPLOYEES, run.version, repo, CORR);
        const approved = await approvePayrollRun(calc.id, calc.version, repo, CORR);
        const wps = await submitWps(approved.id, approved.version, repo, CORR);
        const paid = await markRunPaid(wps.id, wps.version, repo, CORR);
        await assert.rejects(() => cancelPayrollRun(paid.id, paid.version, repo, CORR), (e) => e instanceof PayrollError && e.code === 'INVALID_STATE');
    });
});
describe('salary-change event: new compensation reflected in next calculation', () => {
    it('updated basicMinor changes GOSI and net on recalculation', async () => {
        const repo = makeRepo();
        // First run with original salary
        const run1 = await createPayrollRun({ entityId: ENTITY, period: '2026-07', idempotencyKey: 'key_sal1' }, repo, CORR);
        const emp = [{ employeeId: 'emp_018f23', entityId: ENTITY, nationality: 'SA', basicMinor: 1_500_000, housingMinor: 600_000, transportMinor: 200_000, otherAllowancesMinor: 0, otherDeductionsMinor: 0 }];
        const { payslips: slips1 } = await calculatePayrollRun(run1.id, emp, run1.version, repo, CORR);
        const gosiOld = slips1[0].gosiDeductionEmployeeMinor;
        // Compensation change event: basic raised to 2,000,000 (simulated by next run)
        const run2 = await createPayrollRun({ entityId: ENTITY, period: '2026-08', idempotencyKey: 'key_sal2' }, repo, CORR);
        const empUpdated = [{ ...emp[0], basicMinor: 2_000_000 }];
        const { payslips: slips2 } = await calculatePayrollRun(run2.id, empUpdated, run2.version, repo, CORR);
        const gosiNew = slips2[0].gosiDeductionEmployeeMinor;
        // 9.75% × 2,000,000 = 195,000  vs  9.75% × 1,500,000 = 146,250
        assert.ok(gosiNew > gosiOld);
        assert.equal(gosiNew, Math.floor((2_000_000 * 975) / 10_000));
    });
});
