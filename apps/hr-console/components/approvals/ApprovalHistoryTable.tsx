'use client';
import { useLocale } from '@/lib/locale-context';
import { StatusPill } from '@/components/ui/StatusPill';
import type { WorkflowHistoryItem } from '@/lib/types';
import styles from './ApprovalHistoryTable.module.css';

interface ApprovalHistoryTableProps {
  items: WorkflowHistoryItem[];
  loading?: boolean;
}

const MODULE_LABEL: Record<string, string> = {
  leave: 'Leave', letters: 'Letter', payroll: 'Payroll', benefits: 'Benefits',
};

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function buildTitle(item: WorkflowHistoryItem): string {
  const ctx = item.context as Record<string, string | number>;
  if (item.module === 'leave') {
    const type = String(ctx.leaveType ?? '').replace(/_/g, ' ');
    return `${type.charAt(0).toUpperCase()}${type.slice(1)} Leave${ctx.days ? ` — ${ctx.days} days` : ''}`;
  }
  if (item.module === 'letters') {
    return String(ctx.letterType ?? 'Letter').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return item.workflowId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ApprovalHistoryTable({ items, loading }: ApprovalHistoryTableProps) {
  const { t, locale } = useLocale();

  if (loading) {
    return (
      <div className={styles.tableWrap} aria-busy="true">
        <table className={styles.table}>
          <thead><tr>
            {['Module', 'Request', 'Outcome', 'Decided by', 'Date'].map((h) => (
              <th key={h} scope="col">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[1,2,3,4].map((i) => (
              <tr key={i} aria-hidden="true">
                {[1,2,3,4,5].map((j) => <td key={j}><span className={styles.skel} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty} role="status">
        <p className={styles.emptyTitle}>{t('approvals_history_empty')}</p>
        <p className={styles.emptySub}>{t('approvals_history_empty_sub')}</p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('approvals_filter_all').replace('All', 'Module')}</th>
            <th scope="col">{t('col_employee')}</th>
            <th scope="col">Request</th>
            <th scope="col">Outcome</th>
            <th scope="col">Decided by</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const outcomeStatus = item.status === 'cancelled'
              ? 'cancelled'
              : (item.result ?? 'pending_approval');

            return (
              <tr key={item.instanceId}>
                <td>
                  <span className={styles.modulePill} data-module={item.module}>
                    {MODULE_LABEL[item.module] ?? item.module}
                  </span>
                </td>
                <td>
                  <bdi className="ltr-isolate">
                    {String((item.context as Record<string, unknown>).employeeId ?? '—')}
                  </bdi>
                </td>
                <td className={styles.titleCell}>{buildTitle(item)}</td>
                <td>
                  <StatusPill
                    status={outcomeStatus}
                    label={
                      item.status === 'cancelled'
                        ? t('approvals_history_cancelled')
                        : t(`status_${outcomeStatus}` as Parameters<typeof t>[0])
                    }
                  />
                  {item.note && (
                    <p className={styles.note} title={item.note}>
                      "{item.note.length > 50 ? item.note.slice(0, 47) + '…' : item.note}"
                    </p>
                  )}
                </td>
                <td>
                  {item.decidedBy
                    ? <bdi className="ltr-isolate">{item.decidedBy}</bdi>
                    : <span className={styles.dim}>—</span>
                  }
                </td>
                <td>
                  {item.decidedAt
                    ? <bdi className="ltr-isolate">{formatDate(item.decidedAt, locale)}</bdi>
                    : <bdi className="ltr-isolate">{formatDate(item.startedAt, locale)}</bdi>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
