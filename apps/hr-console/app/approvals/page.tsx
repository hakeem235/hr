'use client';
import { useCallback, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';
import type { ApprovalItem } from '@/lib/types';
import styles from './page.module.css';

type ModuleFilter = 'all' | 'leave' | 'letters' | 'payroll';

export default function ApprovalsPage() {
  const { t } = useLocale();
  const [filter, setFilter] = useState<ModuleFilter>('all');
  const [items, setItems] = useState<ApprovalItem[]>(MOCK_APPROVALS);

  const visible = filter === 'all' ? items : items.filter((i) => i.module === filter);

  const handleDecide = useCallback(async (
    instanceId: string,
    _stepId: string,
    decision: 'approved' | 'declined',
  ) => {
    /* In production: POST /api/v1/workflow-instances/{id}/steps/{stepId}/decision */
    await new Promise((r) => setTimeout(r, 600));
    setItems((prev) => prev.filter((i) => i.instanceId !== instanceId));

    /* Screen reader announcement */
    const msg = decision === 'approved' ? 'Request approved.' : 'Request declined.';
    announce(msg);
  }, []);

  const FILTERS: { value: ModuleFilter; label: string }[] = [
    { value: 'all', label: t('approvals_filter_all') },
    { value: 'leave', label: t('approvals_filter_leave') },
    { value: 'letters', label: t('approvals_filter_letters') },
    { value: 'payroll', label: t('approvals_filter_payroll') },
  ];

  return (
    <>
      <TopBar title={t('approvals_title')} subtitle={t('approvals_subtitle')} />

      <main className={styles.main}>
        {/* Live region for decision announcements */}
        <div id="approval-announcer" role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly} />

        <div className={styles.filterBar} role="group" aria-label="Filter by module">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              className={styles.filterBtn}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
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

        {visible.length === 0 ? (
          <div className={styles.empty} role="status">
            <div className={styles.emptyIcon} aria-hidden="true">✓</div>
            <p className={styles.emptyTitle}>{t('approvals_empty')}</p>
            <p className={styles.emptySub}>{t('approvals_empty_sub')}</p>
          </div>
        ) : (
          <div className={styles.list} aria-label="Pending approvals" aria-live="polite">
            {visible.map((item) => (
              <ApprovalCard key={item.instanceId} item={item} onDecide={handleDecide} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function announce(msg: string) {
  const el = document.getElementById('approval-announcer');
  if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = msg; }); }
}

const MOCK_APPROVALS: ApprovalItem[] = [
  {
    instanceId: 'wf_000001', stepId: 'manager-review',
    module: 'leave',
    title: 'Annual Leave — 5 days',
    requesterName: 'Sara Al-Harbi',
    summary: 'May 25–29, 2026 · Annual leave · 5 working days · Balance: 21 days available',
    slaDueAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    submittedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    instanceId: 'wf_000002', stepId: 'manager-review',
    module: 'leave',
    title: 'Emergency Leave — 1 day',
    requesterName: 'Khalid Al-Otaibi',
    summary: 'May 21, 2026 · Emergency leave · Reason: Family emergency',
    slaDueAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), // overdue
    submittedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    instanceId: 'wf_000003', stepId: 'hr-confirm',
    module: 'letters',
    title: 'Employment Verification Letter',
    requesterName: 'Fatima Al-Dosari',
    summary: 'Requested for bank loan application · Arabic + English · Standard template',
    slaDueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    submittedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
  },
  {
    instanceId: 'wf_000004', stepId: 'finance-review',
    module: 'payroll',
    title: 'Salary Advance Request — SAR 5,000',
    requesterName: 'Mohammed Al-Ghamdi',
    summary: 'SAR 5,000 advance · Repayable over 3 months · First installment: Jun 2026',
    slaDueAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    submittedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];
