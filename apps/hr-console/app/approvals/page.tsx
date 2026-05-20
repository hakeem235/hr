'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';
import { ApprovalHistoryTable } from '@/components/approvals/ApprovalHistoryTable';
import { fetchApprovals, postDecision, fetchWorkflowHistory } from '@/lib/api';
import type { ApprovalItem, WorkflowHistoryItem } from '@/lib/types';
import styles from './page.module.css';

type ModuleFilter = 'all' | 'leave' | 'letters' | 'payroll';
type PageView = 'pending' | 'history';

// HR Ops actor — in production this comes from the session/auth context
const ACTOR_ID = 'emp_hr01';

export default function ApprovalsPage() {
  const { t } = useLocale();

  // ── View: pending vs history ──────────────────────────────────────────────
  const [view, setView] = useState<PageView>('pending');

  // ── Pending state ─────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<ModuleFilter>('all');
  const [items, setItems] = useState<ApprovalItem[]>(MOCK_APPROVALS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // ── History state ─────────────────────────────────────────────────────────
  const [history, setHistory] = useState<WorkflowHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchApprovals()
      .then((live) => { if (live.length > 0) setItems(live); })
      .catch(() => { /* keep mock data */ });
  }, []);

  useEffect(() => {
    if (view !== 'history' || history.length > 0) return;
    setHistoryLoading(true);
    fetchWorkflowHistory({ limit: 50 })
      .then(({ items: h }) => setHistory(h))
      .catch(() => setHistory(MOCK_HISTORY))
      .finally(() => setHistoryLoading(false));
  }, [view, history.length]);

  const visible = filter === 'all' ? items : items.filter((i) => i.module === filter);

  // ── Single decision ───────────────────────────────────────────────────────
  const handleDecide = useCallback(async (
    instanceId: string,
    stepId: string,
    decision: 'approved' | 'declined',
    note?: string,
  ) => {
    setItems((prev) => prev.filter((i) => i.instanceId !== instanceId));
    setSelected((prev) => { const s = new Set(prev); s.delete(instanceId); return s; });

    try {
      await postDecision(instanceId, stepId, decision, ACTOR_ID, note);
    } catch {
      fetchApprovals().then((live) => setItems(live)).catch(() => {});
    }

    announce(decision === 'approved' ? t('approvals_approve') + '.' : t('approvals_decline') + '.');
  }, [t]);

  // ── Bulk approve ──────────────────────────────────────────────────────────
  const handleBulkApprove = useCallback(async () => {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);

    const toApprove = items.filter((i) => selected.has(i.instanceId));
    // Optimistic removal
    setItems((prev) => prev.filter((i) => !selected.has(i.instanceId)));
    setSelected(new Set());

    await Promise.allSettled(
      toApprove.map((i) => postDecision(i.instanceId, i.stepId, 'approved', ACTOR_ID)),
    );

    announce(t('approvals_bulk_done'));
    // Re-fetch to reconcile any partial failures
    fetchApprovals().then((live) => setItems(live)).catch(() => {});
    setBulkBusy(false);
  }, [selected, items, bulkBusy, t]);

  function toggleSelect(instanceId: string, checked: boolean) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (checked) s.add(instanceId); else s.delete(instanceId);
      return s;
    });
  }

  function toggleSelectAll() {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((i) => i.instanceId)));
    }
  }

  const FILTERS: { value: ModuleFilter; label: string }[] = [
    { value: 'all',     label: t('approvals_filter_all') },
    { value: 'leave',   label: t('approvals_filter_leave') },
    { value: 'letters', label: t('approvals_filter_letters') },
    { value: 'payroll', label: t('approvals_filter_payroll') },
  ];

  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.instanceId));

  return (
    <>
      <TopBar title={t('approvals_title')} subtitle={t('approvals_subtitle')} />

      <main className={styles.main}>
        <div id="approval-announcer" role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly} />

        {/* ── Top nav: Pending / History ── */}
        <div className={styles.viewTabs} role="tablist" aria-label="Approvals view">
          <button
            role="tab"
            className={styles.viewTab}
            aria-selected={view === 'pending'}
            onClick={() => setView('pending')}
          >
            {t('approvals_view_pending')}
            <span className={styles.viewCount}>{items.length}</span>
          </button>
          <button
            role="tab"
            className={styles.viewTab}
            aria-selected={view === 'history'}
            onClick={() => setView('history')}
          >
            {t('approvals_view_history')}
          </button>
        </div>

        {/* ── Pending view ── */}
        {view === 'pending' && (
          <>
            <div className={styles.filterRow}>
              <div className={styles.filterBar} role="group" aria-label="Filter by module">
                {FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    className={styles.filterBtn}
                    aria-pressed={filter === value}
                    onClick={() => { setFilter(value); setSelected(new Set()); }}
                  >
                    {label}
                    {value !== 'all' && (
                      <span className={styles.filterCount}>
                        {items.filter((i) => i.module === value).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Bulk action bar ── */}
            {visible.length > 0 && (
              <div className={styles.bulkBar} aria-label="Bulk actions">
                <label className={styles.selectAllLabel}>
                  <input
                    type="checkbox"
                    className={styles.bulkCheckbox}
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all visible"
                  />
                  <span>
                    {selected.size > 0
                      ? t('approvals_bulk_selected').replace('{n}', String(selected.size))
                      : 'Select all'}
                  </span>
                </label>

                {selected.size > 0 && (
                  <button
                    className={styles.bulkApproveBtn}
                    onClick={handleBulkApprove}
                    disabled={bulkBusy}
                    aria-busy={bulkBusy}
                  >
                    {bulkBusy ? t('approvals_bulk_approving') : t('approvals_bulk_approve')}
                  </button>
                )}
              </div>
            )}

            {visible.length === 0 ? (
              <div className={styles.empty} role="status">
                <div className={styles.emptyIcon} aria-hidden="true">✓</div>
                <p className={styles.emptyTitle}>{t('approvals_empty')}</p>
                <p className={styles.emptySub}>{t('approvals_empty_sub')}</p>
              </div>
            ) : (
              <div className={styles.list} aria-label="Pending approvals" aria-live="polite">
                {visible.map((item) => (
                  <ApprovalCard
                    key={item.instanceId}
                    item={item}
                    onDecide={handleDecide}
                    selectable
                    selected={selected.has(item.instanceId)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── History view ── */}
        {view === 'history' && (
          <ApprovalHistoryTable items={history} loading={historyLoading} />
        )}
      </main>
    </>
  );
}

function announce(msg: string) {
  const el = document.getElementById('approval-announcer');
  if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = msg; }); }
}

/* ── Mock data ─────────────────────────────────────────────────────────────── */
const MOCK_APPROVALS: ApprovalItem[] = [
  {
    instanceId: 'wf_000001', stepId: 'manager-review', module: 'leave',
    title: 'Annual Leave — 5 days', requesterName: 'Sara Al-Harbi',
    summary: 'May 25–29, 2026 · Annual leave · 5 working days · Balance: 21 days available',
    slaDueAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    submittedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    instanceId: 'wf_000002', stepId: 'manager-review', module: 'leave',
    title: 'Emergency Leave — 1 day', requesterName: 'Khalid Al-Otaibi',
    summary: 'May 21, 2026 · Emergency leave · Reason: Family emergency',
    slaDueAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    submittedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    instanceId: 'wf_000003', stepId: 'hr-confirm', module: 'letters',
    title: 'Employment Verification Letter', requesterName: 'Fatima Al-Dosari',
    summary: 'Requested for bank loan application · Arabic + English · Standard template',
    slaDueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    submittedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
  },
  {
    instanceId: 'wf_000004', stepId: 'finance-review', module: 'payroll',
    title: 'Salary Advance Request — SAR 5,000', requesterName: 'Mohammed Al-Ghamdi',
    summary: 'SAR 5,000 advance · Repayable over 3 months · First installment: Jun 2026',
    slaDueAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    submittedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];

const d = (offset: number) => new Date(Date.now() + offset).toISOString();
const MOCK_HISTORY: WorkflowHistoryItem[] = [
  {
    instanceId: 'wf_hist_001', workflowId: 'leave-approval', module: 'leave',
    status: 'completed', result: 'approved',
    decidedBy: 'emp_mgr01', decidedAt: d(-2 * 86400_000),
    startedAt: d(-3 * 86400_000),
    context: { employeeId: 'emp_018f23', leaveType: 'annual', days: 5 },
  },
  {
    instanceId: 'wf_hist_002', workflowId: 'leave-approval', module: 'leave',
    status: 'completed', result: 'declined',
    decidedBy: 'emp_mgr01', decidedAt: d(-5 * 86400_000 + 4 * 3600_000),
    note: 'Peak period — please reschedule.',
    startedAt: d(-5 * 86400_000),
    context: { employeeId: 'emp_004a11', leaveType: 'annual', days: 10 },
  },
  {
    instanceId: 'wf_hist_003', workflowId: 'letter-approval', module: 'letters',
    status: 'completed', result: 'approved',
    decidedBy: 'emp_hr01', decidedAt: d(-7 * 86400_000 + 2 * 3600_000),
    startedAt: d(-7 * 86400_000),
    context: { employeeId: 'emp_0c3b77', letterType: 'employment_verification' },
  },
  {
    instanceId: 'wf_hist_004', workflowId: 'leave-approval', module: 'leave',
    status: 'cancelled',
    startedAt: d(-10 * 86400_000),
    context: { employeeId: 'emp_004a11', leaveType: 'emergency', days: 2 },
  },
];
