'use client';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

interface ReportCard {
  titleKey: Parameters<ReturnType<typeof useLocale>['t']>[0];
  subKey:   Parameters<ReturnType<typeof useLocale>['t']>[0];
  icon: string;
  available: boolean;
}

const REPORTS: ReportCard[] = [
  { titleKey: 'reports_headcount',   subKey: 'reports_headcount_sub',   icon: '◎', available: false },
  { titleKey: 'reports_leave',       subKey: 'reports_leave_sub',       icon: '◷', available: false },
  { titleKey: 'reports_payroll',     subKey: 'reports_payroll_sub',     icon: '◈', available: false },
  { titleKey: 'reports_compliance',  subKey: 'reports_compliance_sub',  icon: '◻', available: false },
  { titleKey: 'reports_turnover',    subKey: 'reports_turnover_sub',    icon: '→', available: false },
];

export default function ReportsPage() {
  const { t } = useLocale();

  return (
    <>
      <TopBar title={t('reports_title')} subtitle={t('reports_subtitle')} />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        <div className={styles.grid}>
          {REPORTS.map(({ titleKey, subKey, icon, available }) => (
            <article key={titleKey} className={styles.reportCard}>
              <div className={styles.cardIcon} aria-hidden="true">{icon}</div>
              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>{t(titleKey)}</h2>
                <p className={styles.cardSub}>{t(subKey)}</p>
              </div>
              <div className={styles.cardAction}>
                {available ? (
                  <Button variant="secondary" size="sm">{t('reports_view')}</Button>
                ) : (
                  <span className={styles.comingSoon}>{t('reports_coming_soon')}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
