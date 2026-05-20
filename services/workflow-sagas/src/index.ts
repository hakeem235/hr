/**
 * Workflow Sagas service — entry point.
 * Port 3009.
 */
import Fastify from 'fastify';
import type { SagaInstance, ActivityContext } from './domain/types.js';
import { InMemorySagaRepo } from './repo.js';
import { registerSagaRoutes } from './routes/saga-routes.js';

export { InMemorySagaRepo } from './repo.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowStr(offset = 0): string {
  return new Date(Date.now() + offset).toISOString().replace('Z', '+00:00');
}

// ── Seed data ─────────────────────────────────────────────────────────────────

function makeSeedSagas(): SagaInstance[] {
  const onboarding: SagaInstance = {
    id: 'saga_seed_001',
    sagaName: 'onboarding',
    entityId: 'ent_default',
    employeeId: 'emp_007',
    correlationId: 'corr_onboarding_seed_001',
    idempotencyKey: 'seed:onboarding:emp_007',
    status: 'completed',
    context: {
      employeeId: 'emp_007',
      entityId: 'ent_default',
      nationality: 'SA',
      basicMinor: 1200000,
      hireDate: '2026-05-01',
      position: 'Software Engineer',
      employeeRecord: { employeeNumber: 'EMP-007', nationality: 'SA', status: 'active' },
      gosiSubmissionId: 'sub_gosi_seed_001',
      gosiRef: 'GOSI-2026-0501-EMP007',
      qiwaSubmissionId: 'sub_qiwa_seed_001',
      qiwaRef: 'QIWA-2026-0501-EMP007',
      activatedEnrollments: ['enr_medical_007', 'enr_life_007'],
      welcomeNotificationId: 'notif_seed_001',
      itProvisioningStatus: 'stub_provisioned',
      adAccount: 'emp_007@company.sa',
      email: 'emp_007@company.sa',
    },
    activities: [
      { name: 'validateEmployee',        state: 'completed', attempt: 1, input: {}, output: { employeeRecord: { employeeNumber: 'EMP-007', nationality: 'SA', status: 'active' } }, startedAt: nowStr(-5 * 86400_000), completedAt: nowStr(-5 * 86400_000 + 1000) },
      { name: 'enrollGosi',              state: 'completed', attempt: 1, input: {}, output: { gosiSubmissionId: 'sub_gosi_seed_001', gosiRef: 'GOSI-2026-0501-EMP007' }, startedAt: nowStr(-5 * 86400_000 + 2000), completedAt: nowStr(-5 * 86400_000 + 3500) },
      { name: 'registerQiwaContract',    state: 'completed', attempt: 1, input: {}, output: { qiwaSubmissionId: 'sub_qiwa_seed_001', qiwaRef: 'QIWA-2026-0501-EMP007' }, startedAt: nowStr(-5 * 86400_000 + 4000), completedAt: nowStr(-5 * 86400_000 + 5500) },
      { name: 'activateBenefits',        state: 'completed', attempt: 1, input: {}, output: { activatedEnrollments: ['enr_medical_007', 'enr_life_007'] }, startedAt: nowStr(-5 * 86400_000 + 6000), completedAt: nowStr(-5 * 86400_000 + 7200) },
      { name: 'sendWelcomeNotification', state: 'completed', attempt: 1, input: {}, output: { welcomeNotificationId: 'notif_seed_001' }, startedAt: nowStr(-5 * 86400_000 + 7500), completedAt: nowStr(-5 * 86400_000 + 8000) },
      { name: 'provisionItAccess',       state: 'completed', attempt: 1, input: {}, output: { itProvisioningStatus: 'stub_provisioned', adAccount: 'emp_007@company.sa', email: 'emp_007@company.sa' }, startedAt: nowStr(-5 * 86400_000 + 8200), completedAt: nowStr(-5 * 86400_000 + 8500) },
    ],
    currentActivityIndex: 6,
    createdAt: nowStr(-5 * 86400_000),
    completedAt: nowStr(-5 * 86400_000 + 8500),
  };

  const offboarding: SagaInstance = {
    id: 'saga_seed_002',
    sagaName: 'offboarding',
    entityId: 'ent_default',
    employeeId: 'emp_003',
    correlationId: 'corr_offboarding_seed_002',
    idempotencyKey: 'seed:offboarding:emp_003',
    status: 'completed',
    context: {
      employeeId: 'emp_003',
      entityId: 'ent_default',
      exitDate: '2026-04-30',
      terminationReason: 'resignation',
      lastBasicMinor: 900000,
      gosiExitSubmissionId: 'sub_gosi_exit_seed_002',
      qiwaTerminateSubmissionId: 'sub_qiwa_term_seed_002',
      cancelledEnrollments: ['enr_medical_003'],
      finalSettlementRunId: 'run_final_003',
      offboardingNotificationId: 'notif_seed_002',
    },
    activities: [
      { name: 'submitGosiExit',              state: 'completed', attempt: 1, input: {}, output: { gosiExitSubmissionId: 'sub_gosi_exit_seed_002' }, startedAt: nowStr(-20 * 86400_000), completedAt: nowStr(-20 * 86400_000 + 1200) },
      { name: 'terminateQiwaContract',       state: 'completed', attempt: 1, input: {}, output: { qiwaTerminateSubmissionId: 'sub_qiwa_term_seed_002' }, startedAt: nowStr(-20 * 86400_000 + 1500), completedAt: nowStr(-20 * 86400_000 + 2800) },
      { name: 'cancelBenefits',              state: 'completed', attempt: 1, input: {}, output: { cancelledEnrollments: ['enr_medical_003'] }, startedAt: nowStr(-20 * 86400_000 + 3000), completedAt: nowStr(-20 * 86400_000 + 4100) },
      { name: 'calculateFinalSettlement',    state: 'completed', attempt: 1, input: {}, output: { finalSettlementRunId: 'run_final_003' }, startedAt: nowStr(-20 * 86400_000 + 4500), completedAt: nowStr(-20 * 86400_000 + 5800) },
      { name: 'revokeItAccess',              state: 'completed', attempt: 1, input: {}, output: { itRevocationStatus: 'stub_revoked' }, startedAt: nowStr(-20 * 86400_000 + 6000), completedAt: nowStr(-20 * 86400_000 + 6200) },
      { name: 'sendOffboardingNotification', state: 'completed', attempt: 1, input: {}, output: { offboardingNotificationId: 'notif_seed_002' }, startedAt: nowStr(-20 * 86400_000 + 6500), completedAt: nowStr(-20 * 86400_000 + 7000) },
    ],
    currentActivityIndex: 6,
    createdAt: nowStr(-20 * 86400_000),
    completedAt: nowStr(-20 * 86400_000 + 7000),
  };

  return [onboarding, offboarding];
}

// ── Activity context ──────────────────────────────────────────────────────────

const activityContext: ActivityContext = {
  services: {
    people:        'http://localhost:3003/api/v1',
    integrations:  'http://localhost:3008/api/v1',
    benefits:      'http://localhost:3006/api/v1',
    notifications: 'http://localhost:3005/api/v1',
    payroll:       'http://localhost:3007/api/v1',
  },
  correlationId: 'system',
};

// ── Server ────────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  const repo = new InMemorySagaRepo();

  for (const seed of makeSeedSagas()) {
    await repo.save(seed);
  }

  const app = Fastify({ logger: { level: 'info' } });

  registerSagaRoutes(app, repo, activityContext);

  const port = Number(process.env['PORT'] ?? 3009);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`workflow-sagas listening on :${port}`);
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
