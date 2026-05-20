import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BenefitRepo, BenefitPlan, EnrollmentRecord, Dependent, DomainEvent, EnrollmentFilter, EnrollmentStatus } from '../src/domain/types.js';
import { BenefitError } from '../src/domain/errors.js';
import { calculateEosb } from '../src/domain/eosb.js';
import { createEnrollment, activateEnrollment, cancelEnrollment, addDependent, removeDependent } from '../src/domain/enrollment.js';
import { DEFAULT_PLANS } from '../src/domain/plans.js';

/* ─── Fake repo ───────────────────────────────────────────────── */

function makeRepo(planOverrides: BenefitPlan[] = []): BenefitRepo {
  const plans = new Map<string, BenefitPlan>();
  const enrollments = new Map<string, EnrollmentRecord>();

  // Load default + override plans
  for (const p of planOverrides) plans.set(p.id, p);

  return {
    findPlanById:    async (id) => plans.get(id) ?? null,
    listPlans:       async ()   => [...plans.values()],
    savePlan:        async (p)  => { plans.set(p.id, p); },
    findEnrollmentById: async (id) => enrollments.get(id) ?? null,
    findEnrollmentByIdempotencyKey: async (k) => [...enrollments.values()].find((e) => e.idempotencyKey === k) ?? null,
    findActiveEnrollment: async (empId, planId) =>
      [...enrollments.values()].find((e) => e.employeeId === empId && e.planId === planId && (e.status === 'active' || e.status === 'pending')) ?? null,
    listEnrollments: async (f: EnrollmentFilter) => ({ items: [...enrollments.values()].slice(0, f.limit) }),
    saveWithEvent:   async (rec) => { enrollments.set(rec.id, rec); },
    updateStatus:    async (id, status, effectiveTo, _ev, _event) => {
      const rec = enrollments.get(id)!;
      const updated = { ...rec, status, effectiveTo: effectiveTo ?? rec.effectiveTo, version: rec.version + 1, updatedAt: new Date().toISOString() };
      enrollments.set(id, updated);
      return updated;
    },
    addDependent:    async (enrollmentId, dep) => {
      const rec = enrollments.get(enrollmentId)!;
      const updated = { ...rec, dependents: [...rec.dependents, dep], version: rec.version + 1, updatedAt: new Date().toISOString() };
      enrollments.set(enrollmentId, updated);
      return updated;
    },
    removeDependent: async (enrollmentId, depId) => {
      const rec = enrollments.get(enrollmentId)!;
      const updated = { ...rec, dependents: rec.dependents.filter((d) => d.id !== depId), version: rec.version + 1, updatedAt: new Date().toISOString() };
      enrollments.set(enrollmentId, updated);
      return updated;
    },
  };
}

function repoWithPlan(plan: BenefitPlan = DEFAULT_PLANS[0]) {
  return makeRepo([plan]);
}

/* ─── EOSB calculator ─────────────────────────────────────────── */

test('EOSB: voluntary < 2 years → no entitlement', () => {
  const r = calculateEosb('emp1', '2025-01-01', '2026-01-01', 900000, 'voluntary');
  assert.equal(r.totalEosbMinor, 0);
  assert.equal(r.yearsOfService, 0);
  assert.ok(r.breakdown[0].label.includes('no entitlement'));
});

test('EOSB: voluntary 3 years → 1/3 entitlement', () => {
  const r = calculateEosb('emp1', '2023-01-01', '2026-01-01', 900000, 'voluntary');
  // daily = 900000/30 = 30000; 21-day = 630000; ~3yrs × 630000 × 1/3
  assert.ok(r.totalEosbMinor > 0);
  assert.ok(r.yearsOfService >= 2 && r.yearsOfService <= 3); // 1096 days ÷ 365.25
  assert.ok(r.breakdown[0].label.includes('1/3'));
});

test('EOSB: voluntary 7 years → 2/3 entitlement', () => {
  const r = calculateEosb('emp1', '2019-01-01', '2026-01-01', 900000, 'voluntary');
  assert.ok(r.totalEosbMinor > 0);
  assert.ok(r.breakdown[0].label.includes('2/3'));
});

test('EOSB: voluntary > 10 years → full entitlement', () => {
  const r = calculateEosb('emp1', '2015-01-01', '2026-01-01', 900000, 'voluntary');
  assert.ok(r.totalEosbMinor > 0);
  assert.ok(r.breakdown[0].label.includes('full'));
});

test('EOSB: employer termination 3 years → half-month/year tier only', () => {
  const r = calculateEosb('emp1', '2023-01-01', '2026-01-01', 900000, 'employer_termination');
  assert.ok(r.totalEosbMinor > 0);
  assert.equal(r.breakdown.length, 1);
  assert.ok(r.breakdown[0].label.includes('½ month'));
});

test('EOSB: employer termination 8 years → two tiers', () => {
  const r = calculateEosb('emp1', '2018-01-01', '2026-01-01', 900000, 'employer_termination');
  assert.equal(r.breakdown.length, 2);
  assert.ok(r.breakdown[0].label.includes('½ month'));
  assert.ok(r.breakdown[1].label.includes('1 month'));
});

test('EOSB: amounts are integers (no floats)', () => {
  const r = calculateEosb('emp1', '2020-06-15', '2026-01-01', 750000, 'voluntary');
  assert.equal(r.totalEosbMinor, Math.floor(r.totalEosbMinor));
  for (const tier of r.breakdown) {
    assert.equal(tier.amountMinor, Math.floor(tier.amountMinor));
  }
});

test('EOSB: rejects exitDate before hireDate', () => {
  assert.throws(
    () => calculateEosb('emp1', '2026-01-01', '2025-01-01', 900000, 'voluntary'),
    (e: BenefitError) => e.code === 'VALIDATION',
  );
});

test('EOSB: rejects negative salary', () => {
  assert.throws(
    () => calculateEosb('emp1', '2020-01-01', '2026-01-01', -1, 'voluntary'),
    (e: BenefitError) => e.code === 'VALIDATION',
  );
});

/* ─── Default plans ───────────────────────────────────────────── */

test('DEFAULT_PLANS: has 6 plans for ent_default', () => {
  assert.equal(DEFAULT_PLANS.length, 6);
});

test('DEFAULT_PLANS: medical tiers present', () => {
  const tiers = DEFAULT_PLANS.filter((p) => p.category === 'medical_insurance').map((p) => p.medicalTier);
  assert.ok(tiers.includes('basic'));
  assert.ok(tiers.includes('enhanced'));
  assert.ok(tiers.includes('executive'));
});

test('DEFAULT_PLANS: CCHI provider codes on medical plans', () => {
  const medical = DEFAULT_PLANS.filter((p) => p.category === 'medical_insurance');
  assert.ok(medical.every((p) => p.cchiProviderCode));
});

test('DEFAULT_PLANS: amounts stored in minor units (no floats)', () => {
  for (const p of DEFAULT_PLANS) {
    assert.equal(p.employerContributionMinor, Math.floor(p.employerContributionMinor));
  }
});

/* ─── createEnrollment ────────────────────────────────────────── */

test('createEnrollment: happy path creates pending enrollment', async () => {
  const repo = repoWithPlan();
  const rec = await createEnrollment(
    { entityId: 'ent1', employeeId: 'emp1', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k1' },
    repo, 'corr',
  );
  assert.equal(rec.status, 'pending');
  assert.equal(rec.version, 1);
  assert.ok(rec.id.startsWith('enr_'));
  assert.deepEqual(rec.dependents, []);
});

test('createEnrollment: idempotent', async () => {
  const repo = repoWithPlan();
  const a = await createEnrollment({ entityId: 'ent1', employeeId: 'emp1', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k2' }, repo, 'corr');
  const b = await createEnrollment({ entityId: 'ent1', employeeId: 'emp1', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k2' }, repo, 'corr');
  assert.equal(a.id, b.id);
});

test('createEnrollment: rejects missing plan', async () => {
  const repo = makeRepo([]);
  await assert.rejects(
    () => createEnrollment({ entityId: 'ent1', employeeId: 'emp1', planId: 'plan_ghost', effectiveFrom: '2026-01-01', idempotencyKey: 'k3' }, repo, 'corr'),
    (e: BenefitError) => e.code === 'NOT_FOUND',
  );
});

test('createEnrollment: rejects inactive plan', async () => {
  const inactive = { ...DEFAULT_PLANS[0], id: 'plan_inactive', isActive: false };
  const repo = makeRepo([inactive]);
  await assert.rejects(
    () => createEnrollment({ entityId: 'ent1', employeeId: 'emp1', planId: 'plan_inactive', effectiveFrom: '2026-01-01', idempotencyKey: 'k4' }, repo, 'corr'),
    (e: BenefitError) => e.code === 'INELIGIBLE',
  );
});

test('createEnrollment: rejects duplicate active enrollment', async () => {
  const repo = repoWithPlan();
  await createEnrollment({ entityId: 'ent1', employeeId: 'emp1', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k5' }, repo, 'corr');
  await assert.rejects(
    () => createEnrollment({ entityId: 'ent1', employeeId: 'emp1', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-02-01', idempotencyKey: 'k6' }, repo, 'corr'),
    (e: BenefitError) => e.code === 'ALREADY_ENROLLED',
  );
});

/* ─── activateEnrollment ──────────────────────────────────────── */

test('activateEnrollment: pending → active', async () => {
  const repo = repoWithPlan();
  const enr = await createEnrollment({ entityId: 'ent1', employeeId: 'emp1', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k7' }, repo, 'corr');
  const activated = await activateEnrollment(enr.id, 1, repo, 'corr');
  assert.equal(activated.status, 'active');
  assert.equal(activated.version, 2);
});

test('activateEnrollment: rejects non-pending status', async () => {
  const repo = repoWithPlan();
  const enr = await createEnrollment({ entityId: 'ent1', employeeId: 'emp1', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k8' }, repo, 'corr');
  await activateEnrollment(enr.id, 1, repo, 'corr');
  await assert.rejects(
    () => activateEnrollment(enr.id, 2, repo, 'corr'),
    (e: BenefitError) => e.code === 'INVALID_STATE',
  );
});

/* ─── cancelEnrollment ────────────────────────────────────────── */

test('cancelEnrollment: active → terminated with effectiveTo', async () => {
  const repo = repoWithPlan();
  const enr = await createEnrollment({ entityId: 'ent1', employeeId: 'emp2', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k9' }, repo, 'corr');
  await activateEnrollment(enr.id, 1, repo, 'corr');
  const cancelled = await cancelEnrollment(enr.id, '2026-12-31', 2, repo, 'corr');
  assert.equal(cancelled.status, 'terminated');
  assert.equal(cancelled.effectiveTo, '2026-12-31');
});

test('cancelEnrollment: rejects stale ETag', async () => {
  const repo = repoWithPlan();
  const enr = await createEnrollment({ entityId: 'ent1', employeeId: 'emp3', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k10' }, repo, 'corr');
  await assert.rejects(
    () => cancelEnrollment(enr.id, '2026-12-31', 99, repo, 'corr'),
    (e: BenefitError) => e.code === 'CONFLICT',
  );
});

/* ─── Dependents ──────────────────────────────────────────────── */

test('addDependent: adds spouse to medical enrollment', async () => {
  const repo = repoWithPlan(); // basic plan: allowsDependents=true, max=4
  const enr = await createEnrollment({ entityId: 'ent1', employeeId: 'emp4', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k11' }, repo, 'corr');
  const updated = await addDependent(enr.id, { nameEn: 'Nour Al-Ali', relationship: 'spouse', dateOfBirth: '1992-05-10' }, repo);
  assert.equal(updated.dependents.length, 1);
  assert.equal(updated.dependents[0].nameEn, 'Nour Al-Ali');
  assert.ok(updated.dependents[0].id.startsWith('dep_'));
});

test('addDependent: rejects plan that does not allow dependents', async () => {
  const lifePlan = DEFAULT_PLANS.find((p) => p.category === 'life_insurance')!;
  const repo = makeRepo([lifePlan]);
  const enr = await createEnrollment({ entityId: 'ent1', employeeId: 'emp5', planId: lifePlan.id, effectiveFrom: '2026-01-01', idempotencyKey: 'k12' }, repo, 'corr');
  await assert.rejects(
    () => addDependent(enr.id, { nameEn: 'X', relationship: 'spouse', dateOfBirth: '1990-01-01' }, repo),
    (e: BenefitError) => e.code === 'INELIGIBLE',
  );
});

test('addDependent: rejects when max dependents reached', async () => {
  const plan: BenefitPlan = { ...DEFAULT_PLANS[0], id: 'plan_max1', maxDependents: 1 };
  const repo = makeRepo([plan]);
  const enr = await createEnrollment({ entityId: 'ent1', employeeId: 'emp6', planId: plan.id, effectiveFrom: '2026-01-01', idempotencyKey: 'k13' }, repo, 'corr');
  await addDependent(enr.id, { nameEn: 'Dep1', relationship: 'spouse', dateOfBirth: '1991-01-01' }, repo);
  await assert.rejects(
    () => addDependent(enr.id, { nameEn: 'Dep2', relationship: 'child', dateOfBirth: '2015-01-01' }, repo),
    (e: BenefitError) => e.code === 'INELIGIBLE' && e.details?.max === 1,
  );
});

test('removeDependent: removes by id', async () => {
  const repo = repoWithPlan();
  const enr = await createEnrollment({ entityId: 'ent1', employeeId: 'emp7', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k14' }, repo, 'corr');
  const withDep = await addDependent(enr.id, { nameEn: 'Rem', relationship: 'child', dateOfBirth: '2010-01-01' }, repo);
  const depId = withDep.dependents[0].id;
  const removed = await removeDependent(enr.id, depId, repo);
  assert.equal(removed.dependents.length, 0);
});

test('removeDependent: rejects unknown dependent id', async () => {
  const repo = repoWithPlan();
  const enr = await createEnrollment({ entityId: 'ent1', employeeId: 'emp8', planId: DEFAULT_PLANS[0].id, effectiveFrom: '2026-01-01', idempotencyKey: 'k15' }, repo, 'corr');
  await assert.rejects(
    () => removeDependent(enr.id, 'dep_ghost', repo),
    (e: BenefitError) => e.code === 'NOT_FOUND',
  );
});
