'use client';
import { useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/components/ui/Button';
import type { OnboardingCase, OnboardingStage } from '@/lib/types';
import styles from './page.module.css';

const STAGES: OnboardingStage[] = ['offer', 'documents', 'accounts', 'orientation', 'active'];
const STAGE_INDEX: Record<OnboardingStage, number> = {
  offer: 0, documents: 1, accounts: 2, orientation: 3, active: 4,
};

export default function OnboardingPage() {
  const { t, locale } = useLocale();
  const [cases] = useState<OnboardingCase[]>(MOCK_CASES);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  function daysUntil(iso: string) {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  }

  function stageLabel(s: OnboardingStage) {
    return t(`onboarding_stage_${s}` as Parameters<typeof t>[0]);
  }

  return (
    <>
      <TopBar
        title={t('onboarding_title')}
        subtitle={t('onboarding_subtitle')}
        actions={<Button variant="primary" size="md" disabled>+ {t('onboarding_new')}</Button>}
      />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        {cases.length === 0 ? (
          <div className={styles.empty} role="status">
            <p className={styles.emptyTitle}>{t('onboarding_empty')}</p>
            <p className={styles.emptySub}>{t('onboarding_empty_sub')}</p>
          </div>
        ) : (
          <div className={styles.caseList}>
            {cases.map((c) => {
              const stageIdx = STAGE_INDEX[c.stage];
              const days     = daysUntil(c.startDate);
              const overdue  = days < 0;
              return (
                <article key={c.id} className={styles.caseCard}>
                  <div className={styles.caseHeader}>
                    <div>
                      <p className={styles.caseName}>{c.employeeName}</p>
                      <p className={styles.caseMeta}>{c.position} · {c.department}</p>
                    </div>
                    <div className={styles.caseDue} data-overdue={overdue ? '' : undefined}>
                      {overdue
                        ? t('onboarding_overdue')
                        : <><bdi className="ltr-isolate">{days}</bdi> {t('onboarding_days_until')}</>
                      }
                    </div>
                  </div>

                  <p className={styles.startDate}>
                    {t('onboarding_start')}: <bdi className="ltr-isolate">{formatDate(c.startDate)}</bdi>
                  </p>

                  {/* Stage progress track */}
                  <div className={styles.track} role="list" aria-label="Onboarding stages">
                    {STAGES.map((s, i) => (
                      <div
                        key={s}
                        role="listitem"
                        className={styles.trackStep}
                        data-done={i < stageIdx ? '' : undefined}
                        data-current={i === stageIdx ? '' : undefined}
                        title={stageLabel(s)}
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

const MOCK_CASES: OnboardingCase[] = [
  { id: 'ob_001', employeeName: 'Hassan Al-Shammari', position: 'Backend Engineer',    department: 'Engineering',  startDate: '2026-06-01', stage: 'accounts',     managerName: 'Ahmed Al-Rashidi' },
  { id: 'ob_002', employeeName: 'Noura Al-Sulami',    position: 'Marketing Analyst',   department: 'Marketing',    startDate: '2026-06-08', stage: 'documents',    managerName: 'Layla Al-Zahrani' },
  { id: 'ob_003', employeeName: 'Faris Al-Qahtani',   position: 'Financial Controller',department: 'Finance',      startDate: '2026-05-26', stage: 'orientation',  managerName: 'Nasser Al-Qahtani' },
  { id: 'ob_004', employeeName: 'Dana Al-Otaibi',     position: 'HR Business Partner', department: 'HR',           startDate: '2026-05-19', stage: 'offer',        managerName: 'Maha Al-Shehri' },
];
