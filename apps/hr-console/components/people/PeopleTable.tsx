'use client';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import { StatusPill } from '@/components/ui/StatusPill';
import type { EmployeeListItem } from '@/lib/types';
import styles from './PeopleTable.module.css';

interface Props {
  employees: EmployeeListItem[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function PeopleTable({ employees, loading, error, onRetry }: Props) {
  const { t, locale } = useLocale();

  if (error) {
    return (
      <div className={styles.error} role="alert">
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={onRetry}>{t('retry')}</button>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.th}>{t('col_name')}</th>
            <th scope="col" className={styles.th}>{t('col_id')}</th>
            <th scope="col" className={styles.th}>{t('col_position')}</th>
            <th scope="col" className={styles.th}>{t('col_department')}</th>
            <th scope="col" className={styles.th}>{t('col_hire_date')}</th>
            <th scope="col" className={styles.th}>{t('col_status')}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className={styles.skeletonRow} aria-hidden="true">
                {Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className={styles.td}><span className={styles.skeleton} /></td>
                ))}
              </tr>
            ))
          ) : employees.length === 0 ? (
            <tr>
              <td colSpan={6} className={styles.emptyCell}>
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>{t('people_empty')}</p>
                  <p className={styles.emptySub}>{t('people_empty_sub')}</p>
                </div>
              </td>
            </tr>
          ) : employees.map((emp) => (
            <tr key={emp.employeeId} className={styles.row}>
              <td className={styles.td}>
                <Link href={`/people/${emp.employeeId}`} className={styles.nameLink}>
                  <span className={styles.avatar} aria-hidden="true">
                    {emp.fullNameEn.split(' ').slice(0, 2).map(w => w[0]).join('')}
                  </span>
                  <span>{emp.fullNameEn}</span>
                </Link>
              </td>
              <td className={styles.td}>
                <bdi className="ltr-isolate">{emp.employeeNumber}</bdi>
              </td>
              <td className={styles.td}>{emp.positionTitle ?? t('not_available')}</td>
              <td className={styles.td}>{emp.departmentName ?? t('not_available')}</td>
              <td className={styles.td}>
                <bdi className="ltr-isolate">{formatDate(emp.hireDate, locale)}</bdi>
              </td>
              <td className={styles.td}>
                <StatusPill
                  status={emp.status}
                  label={t(`status_${emp.status}` as Parameters<typeof t>[0])}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
