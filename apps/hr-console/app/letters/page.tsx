'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { NewLetterDrawer } from '@/components/letters/NewLetterDrawer';
import { fetchLetterRequests } from '@/lib/api';
import type { LetterRecord, LetterStatus } from '@/lib/types';
import styles from './page.module.css';

type StatusFilter = 'all' | 'pending' | 'issued';

export default function LettersPage() {
  const { t, locale } = useLocale();
  const [letters, setLetters]   = useState<LetterRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [drawerOpen, setDrawer] = useState(false);
  const [filter, setFilter]     = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLetterRequests({ limit: 50 });
      setLetters(res.items ?? []);
    } catch {
      setLetters(MOCK_LETTERS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const PENDING: LetterStatus[] = ['draft', 'pending_approval', 'approved', 'generating'];
  const ISSUED:  LetterStatus[] = ['issued'];

  const visible = letters.filter((l) => {
    if (filter === 'pending') return PENDING.includes(l.status);
    if (filter === 'issued')  return ISSUED.includes(l.status);
    return true;
  });

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  const FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all',     label: t('letters_filter_all') },
    { value: 'pending', label: t('letters_filter_pending') },
    { value: 'issued',  label: t('letters_filter_issued') },
  ];

  return (
    <>
      <TopBar
        title={t('letters_title')}
        subtitle={t('letters_subtitle')}
        actions={
          <Button variant="primary" size="md" onClick={() => setDrawer(true)}>
            + {t('letters_new')}
          </Button>
        }
      />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        <div className={styles.filterBar} role="group" aria-label={t('filter')}>
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
                  {value === 'pending'
                    ? letters.filter((l) => PENDING.includes(l.status)).length
                    : letters.filter((l) => ISSUED.includes(l.status)).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.th}>{t('col_employee')}</th>
                <th scope="col" className={styles.th}>{t('col_type')}</th>
                <th scope="col" className={styles.th}>{t('col_language')}</th>
                <th scope="col" className={styles.th}>{t('col_status')}</th>
                <th scope="col" className={styles.th}>{t('col_requested')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className={styles.td}><span className={styles.skeleton} /></td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    <p className={styles.emptyTitle}>{t('letters_empty')}</p>
                    <p className={styles.emptySub}>{t('letters_empty_sub')}</p>
                  </td>
                </tr>
              ) : visible.map((l) => (
                <tr key={l.id}>
                  <td className={styles.td}><bdi className="ltr-isolate">{l.employeeId}</bdi></td>
                  <td className={styles.td}>{t(`letter_type_${l.letterType}` as Parameters<typeof t>[0])}</td>
                  <td className={styles.td}>{t(`letters_lang_${l.language}` as Parameters<typeof t>[0])}</td>
                  <td className={styles.td}>
                    <StatusPill status={l.status} label={t(`status_${l.status}` as Parameters<typeof t>[0])} />
                  </td>
                  <td className={styles.td}><bdi className="ltr-isolate">{formatDate(l.createdAt)}</bdi></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <NewLetterDrawer open={drawerOpen} onClose={() => setDrawer(false)} onSuccess={load} />
    </>
  );
}

/* ── Mock ── */
const MOCK_LETTERS: LetterRecord[] = [
  { id: 'lt_001', entityId: 'ent_default', employeeId: 'emp_018f23', letterType: 'salary_certificate',
    language: 'ar', status: 'issued', version: 1, createdAt: '2026-04-10T10:00:00+03:00', issuedAt: '2026-04-11T09:00:00+03:00' },
  { id: 'lt_002', entityId: 'ent_default', employeeId: 'emp_004a11', letterType: 'employment_certificate',
    language: 'bilingual', status: 'pending_approval', version: 1, createdAt: '2026-05-14T14:30:00+03:00' },
  { id: 'lt_003', entityId: 'ent_default', employeeId: 'emp_0c3b77', letterType: 'bank_letter',
    language: 'ar', purpose: 'Car loan', status: 'approved', version: 1, createdAt: '2026-05-16T08:00:00+03:00' },
  { id: 'lt_004', entityId: 'ent_default', employeeId: 'emp_07d2f9', letterType: 'noc',
    language: 'en', status: 'draft', version: 1, createdAt: '2026-05-18T11:00:00+03:00' },
  { id: 'lt_005', entityId: 'ent_default', employeeId: 'emp_012e44', letterType: 'embassy_letter',
    language: 'bilingual', recipientName: 'French Embassy', status: 'issued', version: 1,
    createdAt: '2026-03-05T09:00:00+03:00', issuedAt: '2026-03-06T10:00:00+03:00' },
];
