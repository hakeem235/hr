'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { LeaveBalanceCards } from '@/components/leave/LeaveBalanceCards';
import { LeaveRequestsTable } from '@/components/leave/LeaveRequestsTable';
import { NewLeaveDrawer } from '@/components/leave/NewLeaveDrawer';
import { LeaveDetailDrawer } from '@/components/leave/LeaveDetailDrawer';
import { Button } from '@/components/ui/Button';
import { fetchLeaveRequests } from '@/lib/api';
import type { LeaveRecord, LeaveBalance, LeaveStatus } from '@/lib/types';
import styles from './page.module.css';

const STATUS_FILTERS: Array<{ value: '' | LeaveStatus; labelKey: string }> = [
  { value: '',                labelKey: 'leave_filter_all' },
  { value: 'pending_approval', labelKey: 'status_pending_approval' },
  { value: 'approved',         labelKey: 'status_approved' },
  { value: 'scheduled',        labelKey: 'status_scheduled' },
  { value: 'taken',            labelKey: 'status_taken' },
  { value: 'declined',         labelKey: 'status_declined' },
  { value: 'cancelled',        labelKey: 'status_cancelled' },
];

const PAGE_SIZE = 20;

export default function LeavePage() {
  const { t } = useLocale();

  const [requests, setRequests] = useState<LeaveRecord[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>(MOCK_BALANCES);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | LeaveStatus>('');
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (employeeId?: string, status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLeaveRequests({
        employeeId: employeeId || undefined,
        status: status || undefined,
        limit: PAGE_SIZE,
      });
      setRequests(result.items.length > 0 ? result.items : MOCK_REQUESTS);
      setNextCursor(result.nextCursor);
    } catch {
      setError(t('error_fetch'));
      setRequests(MOCK_REQUESTS);
      setNextCursor(undefined);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // Debounce search input
  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      load(val, statusFilter);
    }, 350);
  }

  function handleStatusChange(val: '' | LeaveStatus) {
    setStatusFilter(val);
    load(search, val);
  }

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchLeaveRequests({
        employeeId: search || undefined,
        status: statusFilter || undefined,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setRequests((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch {
      /* silently ignore load-more failures */
    } finally {
      setLoadingMore(false);
    }
  }

  function handleCancelled() {
    setDetailId(null);
    load(search, statusFilter);
  }

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
          <div className={styles.tableHeader}>
            <h2 id="requests-heading" className={styles.sectionTitle}>
              {t('leave_requests_title')}
            </h2>

            <div className={styles.filterBar} role="search">
              <input
                type="search"
                className={styles.searchInput}
                placeholder={t('leave_search_placeholder')}
                value={search}
                onChange={handleSearchChange}
                aria-label={t('leave_search_placeholder')}
              />
              <div className={styles.statusFilters} role="group" aria-label={t('leave_filter_all')}>
                {STATUS_FILTERS.map(({ value, labelKey }) => (
                  <button
                    key={value}
                    className={styles.filterBtn}
                    aria-pressed={statusFilter === value}
                    onClick={() => handleStatusChange(value)}
                  >
                    {t(labelKey as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <LeaveRequestsTable
            requests={requests}
            loading={loading}
            error={error ?? undefined}
            onRetry={() => load(search, statusFilter)}
            onRowClick={(req) => setDetailId(req.id)}
          />

          {nextCursor && !loading && (
            <div className={styles.loadMore}>
              <button
                className={styles.loadMoreBtn}
                onClick={handleLoadMore}
                disabled={loadingMore}
                aria-busy={loadingMore}
              >
                {loadingMore ? t('leave_loading_more') : t('leave_load_more')}
              </button>
            </div>
          )}
        </section>
      </main>

      <NewLeaveDrawer
        open={drawerOpen}
        leaveTypes={[]}
        onClose={() => setDrawerOpen(false)}
        onSuccess={() => { setDrawerOpen(false); load(search, statusFilter); }}
      />

      <LeaveDetailDrawer
        requestId={detailId}
        onClose={() => setDetailId(null)}
        onCancelled={handleCancelled}
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
