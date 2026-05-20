'use client';
import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchPayrollRuns } from '@/lib/api';
import type { PayrollRun } from '@/lib/types';
import styles from './page.module.css';

function formatMoney(minor: number) {
  return `SAR ${(minor / 100).toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function PayrollPage() {
  const { t, locale } = useLocale();
  const [runs, setRuns] = useState<PayrollRun[]>(MOCK_RUNS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayrollRuns({ entityId: 'ent_default', limit: 20 })
      .then((r) => { if (r.items.length > 0) setRuns(r.items); })
      .catch(() => { /* keep mock data */ })
      .finally(() => setLoading(false));
  }, []);

  function formatPeriod(period: string) {
    const [y, m] = period.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString(
      locale === 'ar' ? 'ar-SA' : 'en-GB',
      { year: 'numeric', month: 'long' },
    );
  }

  return (
    <>
      <TopBar
        title={t('payroll_title')}
        subtitle={t('payroll_subtitle')}
        actions={
          <Button variant="primary" size="md" disabled>
            {t('payroll_run')}
          </Button>
        }
      />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        <section aria-labelledby="runs-heading">
          <h2 id="runs-heading" className={styles.sectionTitle}>{t('payroll_runs_title')}</h2>

          {loading ? (
            <div className={styles.tableWrap} aria-busy="true" aria-label="Loading payroll runs">
              <table className={styles.table}>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className={styles.row}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className={styles.td}><span className={styles.skeleton} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : runs.length === 0 ? (
            <div className={styles.empty} role="status">
              <p className={styles.emptyTitle}>{t('payroll_empty')}</p>
              <p className={styles.emptySub}>{t('payroll_empty_sub')}</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.th}>{t('col_period')}</th>
                    <th scope="col" className={styles.th}>{t('col_headcount')}</th>
                    <th scope="col" className={styles.th}>{t('col_gross')}</th>
                    <th scope="col" className={styles.th}>{t('col_net')}</th>
                    <th scope="col" className={styles.th}>{t('col_status')}</th>
                    <th scope="col" className={styles.th}>{t('col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className={styles.row}>
                      <td className={styles.td}>
                        <span className={styles.period}>{formatPeriod(run.period)}</span>
                      </td>
                      <td className={styles.td}>
                        <bdi className="ltr-isolate">{run.headcount}</bdi>
                        <span className={styles.sub}> {t('payroll_employees')}</span>
                      </td>
                      <td className={styles.td}>
                        <bdi className="ltr-isolate">{formatMoney(run.grossMinor)}</bdi>
                      </td>
                      <td className={styles.td}>
                        <bdi className="ltr-isolate">{formatMoney(run.netMinor)}</bdi>
                      </td>
                      <td className={styles.td}>
                        <StatusPill
                          status={run.status}
                          label={t(`status_${run.status}` as Parameters<typeof t>[0])}
                        />
                      </td>
                      <td className={styles.td}>
                        <Button variant="ghost" size="sm" disabled={run.status !== 'paid'}>
                          {t('download')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

const MOCK_RUNS: PayrollRun[] = [
  { id: 'pr_005', entityId: 'ent_default', period: '2026-05', headcount: 248, grossMinor: 148_750_000, netMinor: 126_437_500, status: 'draft', createdAt: '2026-05-18T08:00:00+03:00' },
  { id: 'pr_004', entityId: 'ent_default', period: '2026-04', headcount: 246, grossMinor: 147_200_000, netMinor: 125_120_000, status: 'paid',       createdAt: '2026-04-18T08:00:00+03:00', paidAt: '2026-04-25T10:00:00+03:00' },
  { id: 'pr_003', entityId: 'ent_default', period: '2026-03', headcount: 244, grossMinor: 146_400_000, netMinor: 124_440_000, status: 'paid',       createdAt: '2026-03-18T08:00:00+03:00', paidAt: '2026-03-25T10:00:00+03:00' },
  { id: 'pr_002', entityId: 'ent_default', period: '2026-02', headcount: 241, grossMinor: 144_600_000, netMinor: 122_910_000, status: 'paid',       createdAt: '2026-02-18T08:00:00+03:00', paidAt: '2026-02-25T10:00:00+03:00' },
  { id: 'pr_001', entityId: 'ent_default', period: '2026-01', headcount: 238, grossMinor: 142_800_000, netMinor: 121_380_000, status: 'paid',       createdAt: '2026-01-18T08:00:00+03:00', paidAt: '2026-01-25T10:00:00+03:00' },
];
