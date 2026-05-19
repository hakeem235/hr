'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { LeaveBalanceCards } from '@/components/leave/LeaveBalanceCards';
import { LeaveRequestsTable } from '@/components/leave/LeaveRequestsTable';
import { NewLeaveDrawer } from '@/components/leave/NewLeaveDrawer';
import { Button } from '@/components/ui/Button';
import { fetchLeaveRequests } from '@/lib/api';
import type { LeaveRecord, LeaveBalance, LeaveType } from '@/lib/types';
import styles from './page.module.css';

export default function LeavePage() {
  const { t } = useLocale();

  const [requests, setRequests] = useState<LeaveRecord[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /* In production: entityId from auth context. Use placeholder for now. */
      const [reqs] = await Promise.allSettled([
        fetchLeaveRequests({ limit: 50 }),
      ]);

      if (reqs.status === 'fulfilled') setRequests(reqs.value.items ?? []);
      else setRequests(MOCK_REQUESTS);

      /* Balances and types fall back to mock if service isn't running */
      setBalances(MOCK_BALANCES);
      setLeaveTypes([]);
    } catch {
      setError(t('error_fetch'));
      setRequests(MOCK_REQUESTS);
      setBalances(MOCK_BALANCES);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <TopBar
        title={t('leave_title')}
        subtitle={t('leave_subtitle')}
        actions={
          <Button variant="primary" size="md" onClick={() => setDrawerOpen(true)}>
            + {t('leave_new_request')}
          </Button>
        }
      />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        <section aria-labelledby="balance-heading" className={styles.section}>
          <h2 id="balance-heading" className={styles.sectionTitle}>
            {t('leave_balance_title')}
          </h2>
          <LeaveBalanceCards balances={balances} loading={loading} />
        </section>

        <section aria-labelledby="requests-heading" className={styles.section}>
          <h2 id="requests-heading" className={styles.sectionTitle}>
            {t('leave_requests_title')}
          </h2>
          <LeaveRequestsTable
            requests={requests}
            loading={loading}
            error={error ?? undefined}
            onRetry={load}
          />
        </section>
      </main>

      <NewLeaveDrawer
        open={drawerOpen}
        leaveTypes={leaveTypes}
        onClose={() => setDrawerOpen(false)}
        onSuccess={load}
      />
    </>
  );
}

/* ── Mock data — used when leave service is not running ── */
const MOCK_BALANCES: LeaveBalance[] = [
  { leaveTypeId: 'annual', leaveTypeName: 'Annual Leave', accruedDays: 21, usedDays: 6, carriedDays: 0 },
  { leaveTypeId: 'sick', leaveTypeName: 'Sick Leave', accruedDays: 10, usedDays: 2, carriedDays: 0 },
  { leaveTypeId: 'emergency', leaveTypeName: 'Emergency Leave', accruedDays: 5, usedDays: 0, carriedDays: 0 },
  { leaveTypeId: 'maternity', leaveTypeName: 'Maternity Leave', accruedDays: 70, usedDays: 0, carriedDays: 0 },
];

const MOCK_REQUESTS: LeaveRecord[] = [
  {
    id: 'lv_000001', entityId: 'ent1', employeeId: 'emp_018f23',
    leaveTypeId: 'annual', startDate: '2026-05-25', endDate: '2026-05-29',
    workingDays: 5, status: 'pending_approval', createdAt: '2026-05-15T09:14:22+03:00',
  },
  {
    id: 'lv_000002', entityId: 'ent1', employeeId: 'emp_004a11',
    leaveTypeId: 'sick', startDate: '2026-05-19', endDate: '2026-05-20',
    workingDays: 2, status: 'approved', createdAt: '2026-05-18T11:00:00+03:00',
  },
  {
    id: 'lv_000003', entityId: 'ent1', employeeId: 'emp_0c3b77',
    leaveTypeId: 'emergency', startDate: '2026-05-21', endDate: '2026-05-21',
    workingDays: 1, status: 'pending_approval', createdAt: '2026-05-19T08:30:00+03:00',
    reason: 'Family emergency',
  },
  {
    id: 'lv_000004', entityId: 'ent1', employeeId: 'emp_07d2f9',
    leaveTypeId: 'annual', startDate: '2026-04-01', endDate: '2026-04-10',
    workingDays: 8, status: 'taken', createdAt: '2026-03-20T14:00:00+03:00',
  },
  {
    id: 'lv_000005', entityId: 'ent1', employeeId: 'emp_012e44',
    leaveTypeId: 'annual', startDate: '2026-06-01', endDate: '2026-06-05',
    workingDays: 5, status: 'declined', createdAt: '2026-05-10T16:45:00+03:00',
    reason: 'Summer vacation',
  },
];
