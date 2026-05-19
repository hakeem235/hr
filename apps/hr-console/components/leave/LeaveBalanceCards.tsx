'use client';
import { useLocale } from '@/lib/locale-context';
import type { LeaveBalance } from '@/lib/types';
import styles from './LeaveBalanceCards.module.css';

interface LeaveBalanceCardsProps {
  balances: LeaveBalance[];
  loading?: boolean;
}

const TYPE_LABEL_KEY: Record<string, 'leave_annual' | 'leave_sick' | 'leave_emergency' | 'leave_maternity'> = {
  annual: 'leave_annual',
  sick: 'leave_sick',
  emergency: 'leave_emergency',
  maternity: 'leave_maternity',
};

export function LeaveBalanceCards({ balances, loading }: LeaveBalanceCardsProps) {
  const { t } = useLocale();

  if (loading) {
    return (
      <div className={styles.grid} aria-busy="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={[styles.card, styles.skeleton].join(' ')} aria-hidden="true" />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {balances.map((bal) => {
        const available = bal.accruedDays + bal.carriedDays - bal.usedDays;
        const pct = bal.accruedDays > 0 ? Math.round((bal.usedDays / bal.accruedDays) * 100) : 0;
        const labelKey = TYPE_LABEL_KEY[bal.leaveTypeId];
        const label = labelKey ? t(labelKey) : bal.leaveTypeName;

        return (
          <article key={bal.leaveTypeId} className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>{label}</h3>
              <span className={styles.availableBadge}>
                <bdi className="ltr-isolate">{available}</bdi>
                {' '}{t('balance_available')}
              </span>
            </div>

            <div className={styles.track} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={styles.fill} style={{ width: `${pct}%` }} />
            </div>

            <dl className={styles.stats}>
              <div className={styles.stat}>
                <dt className={styles.statLabel}>{t('balance_accrued')}</dt>
                <dd className={styles.statValue}>
                  <bdi className="ltr-isolate">{bal.accruedDays}</bdi>
                </dd>
              </div>
              <div className={styles.stat}>
                <dt className={styles.statLabel}>{t('balance_used')}</dt>
                <dd className={styles.statValue}>
                  <bdi className="ltr-isolate">{bal.usedDays}</bdi>
                </dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
