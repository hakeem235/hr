/**
 * Integrations service — domain tests.
 * Tests for GOSI, Mudad, Qiwa, Muqeem, CCHI, and event routing.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import type {
  GovSubmission, DomainEvent, IntegrationsRepo, SubmissionFilter, SubmissionType,
} from '../src/domain/types.js';
import { previewGosiContributions, gosiEnroll, gosiExit, gosiRecalculate } from '../src/domain/gosi.js';
import { mudadSubmitWps, validateWpsLines } from '../src/domain/mudad.js';
import {
  qiwaRegisterContract, qiwaTerminateContract,
  muqeemProcessIqama, cchiEnroll,
} from '../src/domain/qiwa-muqeem-cchi.js';
import { handleDomainEvent } from '../src/domain/events.js';

// ── Test repository ────────────────────────────────────────────────────────────

class TestRepo implements IntegrationsRepo {
  readonly submissions = new Map<string, GovSubmission>();
  readonly byIdem     = new Map<string, string>();
  readonly events: DomainEvent[] = [];

  async findByIdempotencyKey(key: string) {
    const id = this.byIdem.get(key);
    return id ? (this.submissions.get(id) ?? null) : null;
  }
  async save(s: GovSubmission, e: DomainEvent) {
    this.submissions.set(s.id, s);
    this.byIdem.set(s.idempotencyKey, s.id);
    this.events.push(e);
    return s;
  }
  async update(s: GovSubmission, e: DomainEvent) {
    this.submissions.set(s.id, s);
    this.events.push(e);
    return s;
  }
  async findById(id: string) { return this.submissions.get(id) ?? null; }
  async list(_f: SubmissionFilter) { return { items: [...this.submissions.values()], nextCursor: null }; }
  async findByEmployee(empId: string, type?: SubmissionType) {
    return [...this.submissions.values()].filter(s => s.employeeId === empId && (!type || s.type === type));
  }
}

// ── GOSI contribution preview ─────────────────────────────────────────────────

describe('GOSI contribution preview', () => {
  it('Saudi national: 9.75% employee + 11.75% employer', () => {
    const p = previewGosiContributions('SA', 1_000_000); // SAR 10,000.00 basic
    assert.equal(p.employeeContributionMinor, 97_500);   // 9.75%
    assert.equal(p.employerContributionMinor, 117_500);  // 11.75%
    assert.equal(p.totalMinor, 215_000);
  });

  it('Expat: 0% employee + 2% employer (occupational hazard only)', () => {
    const p = previewGosiContributions('PK', 1_000_000);
    assert.equal(p.employeeContributionMinor, 0);
    assert.equal(p.employerContributionMinor, 20_000);   // 2%
    assert.equal(p.totalMinor, 20_000);
  });

  it('integer arithmetic — no floats (SAR 1,000.01 basic = 100001 halalas)', () => {
    const p = previewGosiContributions('SA', 100_001);
    // 100001 × 975 / 10000 = 9750.0975 → floor = 9750
    assert.equal(p.employeeContributionMinor, 9_750);
    // 100001 × 1175 / 10000 = 11750.1175 → floor = 11750
    assert.equal(p.employerContributionMinor, 11_750);
  });

  it('employer rate is higher for Saudis (tax on employment)', () => {
    const saudi = previewGosiContributions('SA', 500_000);
    const expat = previewGosiContributions('US', 500_000);
    assert.ok(saudi.employerContributionMinor > expat.employerContributionMinor);
  });
});

// ── GOSI enrollment ───────────────────────────────────────────────────────────

describe('gosiEnroll', () => {
  let repo: TestRepo;
  before(() => { repo = new TestRepo(); });

  it('creates a confirmed submission', async () => {
    const result = await gosiEnroll({
      idempotencyKey: 'enroll-test-001',
      entityId: 'ent_default',
      employeeId: 'emp_001',
      nationality: 'SA',
      basicMinor: 1_200_000,
      hireDate: '2026-05-01',
    }, repo);

    assert.equal(result.status, 'confirmed');
    assert.equal(result.system, 'gosi');
    assert.equal(result.type, 'gosi_enroll');
    assert.ok(result.referenceNumber?.startsWith('GOSI-ENR'));
    assert.ok(result.confirmedAt);
  });

  it('idempotent — returns same record on duplicate key', async () => {
    const first = await gosiEnroll({
      idempotencyKey: 'enroll-idem-001',
      entityId: 'ent_default', employeeId: 'emp_002',
      nationality: 'SA', basicMinor: 800_000, hireDate: '2026-05-01',
    }, repo);
    const second = await gosiEnroll({
      idempotencyKey: 'enroll-idem-001',
      entityId: 'ent_default', employeeId: 'emp_002',
      nationality: 'SA', basicMinor: 800_000, hireDate: '2026-05-01',
    }, repo);
    assert.equal(first.id, second.id);
    // Only 1 submission created, not 2
    const subs = await repo.findByEmployee('emp_002', 'gosi_enroll');
    assert.equal(subs.length, 1);
  });

  it('stores GOSI contribution breakdown in payload', async () => {
    const result = await gosiEnroll({
      idempotencyKey: 'enroll-payload-001',
      entityId: 'ent_default', employeeId: 'emp_003',
      nationality: 'SA', basicMinor: 1_000_000, hireDate: '2026-05-01',
    }, repo);
    const contributions = result.payload.contributions as any;
    assert.equal(contributions.employeeContributionMinor, 97_500);
    assert.equal(contributions.employerContributionMinor, 117_500);
  });

  it('expat enrollment has 0 employee contribution', async () => {
    const result = await gosiEnroll({
      idempotencyKey: 'enroll-expat-001',
      entityId: 'ent_default', employeeId: 'emp_004',
      nationality: 'IN', basicMinor: 600_000, hireDate: '2026-05-01',
    }, repo);
    const contributions = result.payload.contributions as any;
    assert.equal(contributions.employeeContributionMinor, 0);
    assert.ok(contributions.employerContributionMinor > 0);
  });
});

// ── GOSI exit ─────────────────────────────────────────────────────────────────

describe('gosiExit', () => {
  it('creates confirmed exit submission', async () => {
    const repo = new TestRepo();
    const result = await gosiExit({
      idempotencyKey: 'exit-test-001',
      entityId: 'ent_default',
      employeeId: 'emp_001',
      exitDate: '2026-05-31',
      lastBasicMinor: 1_200_000,
    }, repo);

    assert.equal(result.status, 'confirmed');
    assert.equal(result.type, 'gosi_exit');
    assert.ok(result.referenceNumber?.startsWith('GOSI-EXI'));
  });

  it('idempotent on duplicate key', async () => {
    const repo = new TestRepo();
    const first = await gosiExit({ idempotencyKey: 'exit-idem-001', entityId: 'ent_default', employeeId: 'emp_002', exitDate: '2026-05-31', lastBasicMinor: 500_000 }, repo);
    const second = await gosiExit({ idempotencyKey: 'exit-idem-001', entityId: 'ent_default', employeeId: 'emp_002', exitDate: '2026-05-31', lastBasicMinor: 500_000 }, repo);
    assert.equal(first.id, second.id);
  });
});

// ── GOSI recalculate ──────────────────────────────────────────────────────────

describe('gosiRecalculate', () => {
  it('captures delta between old and new contributions', async () => {
    const repo = new TestRepo();
    const result = await gosiRecalculate({
      idempotencyKey: 'recalc-test-001',
      entityId: 'ent_default',
      employeeId: 'emp_001',
      nationality: 'SA',
      oldBasicMinor: 1_000_000,
      newBasicMinor: 1_200_000,
      effectiveDate: '2026-06-01',
    }, repo);

    assert.equal(result.type, 'gosi_recalculate');
    assert.equal(result.status, 'confirmed');
    const delta = result.payload.delta as any;
    // New employee: 1_200_000 × 975/10000 = 117_000; Old: 97_500; delta = 19_500
    assert.equal(delta.employeeContributionMinor, 19_500);
    assert.equal(delta.employerContributionMinor, 23_500); // 141_000 - 117_500
  });
});

// ── Mudad / WPS ───────────────────────────────────────────────────────────────

describe('validateWpsLines', () => {
  it('rejects empty lines array', () => {
    const err = validateWpsLines([]);
    assert.ok(err?.includes('at least one'));
  });

  it('rejects invalid IBAN format', () => {
    const err = validateWpsLines([
      { employeeId: 'emp_001', employeeIban: 'INVALID', netMinor: 100_000, gosiDeductionMinor: 9_750, currency: 'SAR' },
    ]);
    assert.ok(err?.includes('Invalid IBAN'));
  });

  it('rejects zero or negative net pay', () => {
    const err = validateWpsLines([
      { employeeId: 'emp_001', employeeIban: 'SA0380000000608010167519', netMinor: 0, gosiDeductionMinor: 0, currency: 'SAR' },
    ]);
    assert.ok(err?.includes('positive'));
  });

  it('accepts valid Saudi IBAN and positive net pay', () => {
    const err = validateWpsLines([
      { employeeId: 'emp_001', employeeIban: 'SA0380000000608010167519', netMinor: 100_000, gosiDeductionMinor: 9_750, currency: 'SAR' },
    ]);
    assert.equal(err, null);
  });
});

describe('mudadSubmitWps', () => {
  it('creates confirmed WPS submission', async () => {
    const repo = new TestRepo();
    const result = await mudadSubmitWps({
      idempotencyKey: 'wps-test-001',
      entityId: 'ent_default',
      payrollRunId: 'pr_005',
      period: '2026-05',
      lines: [
        { employeeId: 'emp_001', employeeIban: 'SA0380000000608010167519', netMinor: 100_000, gosiDeductionMinor: 9_750, currency: 'SAR' },
        { employeeId: 'emp_002', employeeIban: 'SA4420000001234567891234', netMinor: 90_000, gosiDeductionMinor: 8_775, currency: 'SAR' },
      ],
    }, repo);

    assert.equal(result.status, 'confirmed');
    assert.equal(result.system, 'mudad');
    assert.ok(result.referenceNumber?.startsWith('MUDAD-WPS'));
    assert.equal(result.payload.employeeCount, 2);
    assert.equal(result.payload.totalNetMinor, 190_000);
  });

  it('throws on invalid WPS lines', async () => {
    const repo = new TestRepo();
    await assert.rejects(
      mudadSubmitWps({
        idempotencyKey: 'wps-invalid-001',
        entityId: 'ent_default', payrollRunId: 'pr_006', period: '2026-06',
        lines: [{ employeeId: 'emp_001', employeeIban: 'BADIBN', netMinor: 100, gosiDeductionMinor: 0, currency: 'SAR' }],
      }, repo),
      /Invalid IBAN/,
    );
  });
});

// ── Qiwa ──────────────────────────────────────────────────────────────────────

describe('qiwaRegisterContract', () => {
  it('creates confirmed Qiwa contract registration', async () => {
    const repo = new TestRepo();
    const result = await qiwaRegisterContract({
      idempotencyKey: 'qiwa-reg-001',
      entityId: 'ent_default',
      employeeId: 'emp_001',
      nationalId: '1000000001',
      position: 'Software Engineer',
      startDate: '2026-05-01',
      contractType: 'indefinite',
    }, repo);
    assert.equal(result.status, 'confirmed');
    assert.equal(result.system, 'qiwa');
    assert.ok(result.referenceNumber?.startsWith('QIWA'));
  });

  it('idempotent on duplicate key', async () => {
    const repo = new TestRepo();
    const input = { idempotencyKey: 'qiwa-idem-001', entityId: 'ent_default', employeeId: 'emp_002', nationalId: '1000000002', position: 'Analyst', startDate: '2026-05-01', contractType: 'indefinite' as const };
    const first = await qiwaRegisterContract(input, repo);
    const second = await qiwaRegisterContract(input, repo);
    assert.equal(first.id, second.id);
  });
});

describe('qiwaTerminateContract', () => {
  it('creates confirmed Qiwa termination', async () => {
    const repo = new TestRepo();
    const result = await qiwaTerminateContract({
      idempotencyKey: 'qiwa-term-001',
      entityId: 'ent_default',
      employeeId: 'emp_001',
      exitDate: '2026-05-31',
      reason: 'Resignation',
    }, repo);
    assert.equal(result.status, 'confirmed');
    assert.equal(result.type, 'qiwa_contract_terminate');
  });
});

// ── Muqeem ────────────────────────────────────────────────────────────────────

describe('muqeemProcessIqama', () => {
  it('processes iqama renewal for expat', async () => {
    const repo = new TestRepo();
    const result = await muqeemProcessIqama({
      idempotencyKey: 'muqeem-renew-001',
      entityId: 'ent_default',
      employeeId: 'emp_004',
      iqamaNumber: '2000000001',
      passportNumber: 'P1234567',
      expiryDate: '2026-09-30',
      action: 'renew',
    }, repo);
    assert.equal(result.status, 'confirmed');
    assert.equal(result.type, 'muqeem_iqama_renew');
    assert.ok(result.referenceNumber?.startsWith('MUQEEM'));
  });

  it('processes iqama exit notification', async () => {
    const repo = new TestRepo();
    const result = await muqeemProcessIqama({
      idempotencyKey: 'muqeem-exit-001',
      entityId: 'ent_default',
      employeeId: 'emp_004',
      iqamaNumber: '2000000001',
      passportNumber: 'P1234567',
      expiryDate: '2026-09-30',
      action: 'exit',
    }, repo);
    assert.equal(result.type, 'muqeem_iqama_exit');
  });
});

// ── CCHI ──────────────────────────────────────────────────────────────────────

describe('cchiEnroll', () => {
  it('creates confirmed CCHI enrollment', async () => {
    const repo = new TestRepo();
    const result = await cchiEnroll({
      idempotencyKey: 'cchi-enroll-001',
      entityId: 'ent_default',
      employeeId: 'emp_001',
      enrollmentId: 'enr_001',
      planCode: 'CCHI-002',
      memberId: 'MBR-001',
      dependents: [{ name: 'Spouse', relation: 'spouse', dob: '1990-01-01' }],
    }, repo);
    assert.equal(result.status, 'confirmed');
    assert.equal(result.system, 'cchi');
    assert.ok(result.referenceNumber?.startsWith('CCHI'));
    assert.equal((result.payload.dependents as any[]).length, 1);
  });
});

// ── Domain event routing ──────────────────────────────────────────────────────

describe('handleDomainEvent', () => {
  it('EmployeeOnboarded triggers GOSI enroll + Qiwa contract', async () => {
    const repo = new TestRepo();
    const result = await handleDomainEvent({
      eventId: 'evt_onboard_001',
      eventType: 'EmployeeOnboarded',
      entityId: 'ent_default',
      correlationId: 'corr_001',
      occurredAt: '2026-05-20T08:00:00+03:00',
      aggregateType: 'employee',
      aggregateId: 'emp_new_001',
      payload: {
        employeeId: 'emp_new_001',
        nationality: 'SA',
        basicMinor: 900_000,
        hireDate: '2026-05-20',
        nationalId: '1000099999',
        position: 'Analyst',
      },
    }, repo);

    assert.ok(result.handled);
    assert.ok(result.actions.includes('gosi_enroll'));
    assert.ok(result.actions.includes('qiwa_register'));

    // Verify submissions were created
    const empSubs = await repo.findByEmployee('emp_new_001');
    assert.equal(empSubs.length, 2);
    assert.ok(empSubs.some(s => s.type === 'gosi_enroll'));
    assert.ok(empSubs.some(s => s.type === 'qiwa_contract_register'));
  });

  it('EmployeeTerminated triggers GOSI exit + Qiwa termination', async () => {
    const repo = new TestRepo();
    const result = await handleDomainEvent({
      eventId: 'evt_term_001',
      eventType: 'EmployeeTerminated',
      entityId: 'ent_default',
      correlationId: 'corr_002',
      occurredAt: '2026-05-31T17:00:00+03:00',
      aggregateType: 'employee',
      aggregateId: 'emp_exit_001',
      payload: {
        employeeId: 'emp_exit_001',
        exitDate: '2026-05-31',
        reason: 'Resignation',
        lastBasicMinor: 1_100_000,
      },
    }, repo);

    assert.ok(result.handled);
    assert.ok(result.actions.includes('gosi_exit'));
    assert.ok(result.actions.includes('qiwa_terminate'));
  });

  it('CompensationChanged triggers GOSI recalculation', async () => {
    const repo = new TestRepo();
    const result = await handleDomainEvent({
      eventId: 'evt_comp_001',
      eventType: 'CompensationChanged',
      entityId: 'ent_default',
      correlationId: 'corr_003',
      occurredAt: '2026-06-01T00:00:00+03:00',
      aggregateType: 'compensation',
      aggregateId: 'emp_001',
      payload: {
        employeeId: 'emp_001',
        nationality: 'SA',
        oldBasicMinor: 1_000_000,
        newBasicMinor: 1_200_000,
        effectiveDate: '2026-06-01',
      },
    }, repo);

    assert.ok(result.handled);
    assert.ok(result.actions.includes('gosi_recalc'));
    const subs = await repo.findByEmployee('emp_001', 'gosi_recalculate');
    assert.equal(subs.length, 1);
  });

  it('unknown event type returns handled=false', async () => {
    const repo = new TestRepo();
    const result = await handleDomainEvent({
      eventId: 'evt_unknown_001',
      eventType: 'SomeOtherEvent',
      entityId: 'ent_default',
      correlationId: 'corr_004',
      occurredAt: '2026-05-20T08:00:00+03:00',
      aggregateType: 'other',
      aggregateId: 'agg_001',
      payload: {},
    }, repo);
    assert.equal(result.handled, false);
    assert.equal(result.actions.length, 0);
  });

  it('duplicate event (same eventId) is idempotent', async () => {
    const repo = new TestRepo();
    const event = {
      eventId: 'evt_idem_001',
      eventType: 'EmployeeOnboarded',
      entityId: 'ent_default',
      correlationId: 'corr_005',
      occurredAt: '2026-05-20T08:00:00+03:00',
      aggregateType: 'employee',
      aggregateId: 'emp_idem_001',
      payload: { employeeId: 'emp_idem_001', nationality: 'SA', basicMinor: 700_000, hireDate: '2026-05-20' },
    };
    await handleDomainEvent(event, repo);
    await handleDomainEvent(event, repo); // second delivery

    // Still only 1 GOSI enroll submission (idempotency key is eventId:gosi_enroll)
    const subs = await repo.findByEmployee('emp_idem_001', 'gosi_enroll');
    assert.equal(subs.length, 1);
  });
});
