'use client';
import { useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/components/ui/Button';
import type { OffboardingCase, OffboardingStage } from '@/lib/types';
import styles from './page.module.css';

const STAGES: OffboardingStage[] = ['notice', 'clearance', 'documents', 'settlement', 'completed'];
const STAGE_INDEX: Record<OffboardingStage, number> = {
  notice: 0, clearance: 1, documents: 2, settlement: 3, completed: 4,
};

export default function OffboardingPage() {
  const { t, locale } = useLocale();
  const [cases] = useState<OffboardingCase[]>(MOCK_CASES);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  function daysRemaining(iso: string) {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  }

  function stageLabel(s: OffboardingStage) {
    return t(`offboarding_stage_${s}` as Parameters<typeof t>[0]);
  }

  return (
    <>
      <TopBar
        title={t('offboarding_title')}
        subtitle={t('offboarding_subtitle')}
        actions={<Button variant="primary" size="md" disabled>+ {t('offboarding_new')}</Button>}
      />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        {cases.length === 0 ? (
          <div className={styles.empty} role="status">
            <p className={styles.emptyTitle}>{t('offboarding_empty')}</p>
            <p className={styles.emptySub}>{t('offboarding_empty_sub')}</p>
          </div>
        ) : (
          <div className={styles.caseList}>
            {cases.map((c) => {
              const stageIdx  = STAGE_INDEX[c.stage];
              const days      = daysRemaining(c.lastDay);
              const completed = c.stage === 'completed';
              return (
                <article key={c.id} className={styles.caseCard} data-completed={completed ? '' : undefined}>
                  <div className={styles.caseHeader}>
                    <div>
                      <p className={styles.caseName}>{c.employeeName}</p>
                      <p className={styles.caseMeta}>
                        {c.position}
                        {' · '}
                        {c.resignationType === 'voluntary' ? 'Voluntary' : 'Employer Termination'}
                      </p>
                    </div>
                    {!completed && (
                      <div className={styles.caseDue} data-past={days < 0 ? '' : undefined}>
                        {days < 0
                          ? `${Math.abs(days)}d past last day`
                          : <><bdi className="ltr-isolate">{days}</bdi> {t('offboarding_days_remaining')}</>
                        }
                      </div>
                    )}
                  </div>

                  <p className={styles.lastDay}>
                    {t('offboarding_last_day')}: <bdi className="ltr-isolate">{formatDate(c.lastDay)}</bdi>
                  </p>

                  <div className={styles.track} role="list" aria-label="Offboarding stages">
                    {STAGES.map((s, i) => (
                      <div
                        key={s}
                        role="listitem"
                        className={styles.trackStep}
                        data-done={i < stageIdx ? '' : undefined}
                        data-current={i === stageIdx && !completed ? '' : undefined}
                        aria-label={`${stageLabel(s)}${i < stageIdx ? ' — completed' : i === stageIdx ? ' — current' : ''}`}
                      >
                        <div className={styles.trackDot} aria-hidden="true">
                          {i < stageIdx ? '✓' : i + 1}
                        </div>
                        <span className={styles.trackLabel}>{stageLabel(s)}</span>
                        {i < STAGES.length - 1 && <div className={styles.trackLine} data-done={i < stageIdx ? '' : undefined} aria-hidden="true" />}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

const MOCK_CASES: OffboardingCase[] = [
  { id: 'off_001', employeeId: 'emp_004a11', employeeName: 'Khalid Al-Otaibi',   position: 'Senior Engineer',    lastDay: '2026-06-15', stage: 'clearance',  resignationType: 'voluntary' },
  { id: 'off_002', employeeId: 'emp_07d2f9', employeeName: 'Mohammed Al-Ghamdi', position: 'Financial Analyst',  lastDay: '2026-05-31', stage: 'notice',     resignationType: 'voluntary' },
  { id: 'off_003', employeeId: 'emp_012e44', employeeName: 'Reem Al-Dawsari',    position: 'UX Designer',        lastDay: '2026-04-30', stage: 'completed',  resignationType: 'voluntary' },
];
