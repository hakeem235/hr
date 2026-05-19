'use client';
import { useLocale } from '@/lib/locale-context';
import { StatusPill } from '@/components/ui/StatusPill';
import type { LeaveRecord } from '@/lib/types';
import styles from './LeaveRequestsTable.module.css';

interface LeaveRequestsTableProps {
  requests: LeaveRecord[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function LeaveRequestsTable({
  requests,
  loading,
  error,
  onRetry,
}: LeaveRequestsTableProps) {
  const { t, locale } = useLocale();

  if (loading) {
    return (
      <div className={styles.tableWrap} aria-busy="true">
        <table className={styles.table}>
          <thead>
            <tr>
              {[t('col_employee'), t('col_type'), t('col_dates'), t('col_days'), t('col_status'), t('col_submitted')].map((h) => (
                <th key={h} scope="col">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1,2,3,4,5].map((i) => (
              <tr key={i} aria-hidden="true">
                {[1,2,3,4,5,6].map((j) => (
                  <td key={j}><span className={styles.skelCell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.empty} role="alert">
        <p className={styles.emptyTitle}>{t('error_fetch')}</p>
        {onRetry && (
          <button className={styles.retryBtn} onClick={onRetry}>{t('retry')}</button>
        )}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>{t('leave_empty')}</p>
        <p className={styles.emptySub}>{t('leave_empty_sub')}</p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('col_employee')}</th>
            <th scope="col">{t('col_type')}</th>
            <th scope="col">{t('col_dates')}</th>
            <th scope="col">{t('col_days')}</th>
            <th scope="col">{t('col_status')}</th>
            <th scope="col">{t('col_submitted')}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <tr key={req.id}>
              <td>
                <span className={styles.employeeId}>
                  <bdi className="ltr-isolate">{req.employeeId}</bdi>
                </span>
              </td>
              <td className={styles.typeCell}>{req.leaveTypeId}</td>
              <td>
                <span className={styles.dates}>
                  <bdi className="ltr-isolate">{formatDate(req.startDate, locale)}</bdi>
                  <span aria-hidden="true"> – </span>
                  <bdi className="ltr-isolate">{formatDate(req.endDate, locale)}</bdi>
                </span>
              </td>
              <td>
                <bdi className="ltr-isolate">
                  {req.workingDays} {req.workingDays === 1 ? t('day') : t('days')}
                </bdi>
              </td>
              <td>
                <StatusPill
                  status={req.status}
                  label={t(`status_${req.status}` as Parameters<typeof t>[0])}
                />
              </td>
              <td>
                <bdi className="ltr-isolate">{formatDate(req.createdAt, locale)}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
