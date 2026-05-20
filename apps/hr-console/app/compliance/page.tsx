'use client';
import { useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import type { DocExpiryItem, NitaqatStats, DocType } from '@/lib/types';
import styles from './page.module.css';

type DocFilter = 'all' | 'expiring' | 'expired';

export default function CompliancePage() {
  const { t, locale } = useLocale();
  const [docFilter, setDocFilter] = useState<DocFilter>('all');

  const nitaqat = MOCK_NITAQAT;
  const saudiPct = Math.round((nitaqat.saudiNationals / nitaqat.totalEmployees) * 100);
  const gap = nitaqat.targetPercent - saudiPct;

  const DOC_FILTERS: { value: DocFilter; label: string }[] = [
    { value: 'all',      label: t('compliance_filter_all') },
    { value: 'expiring', label: t('compliance_filter_expiring') },
    { value: 'expired',  label: t('compliance_filter_expired') },
  ];

  const filteredDocs = MOCK_DOCS.filter((d) => {
    if (docFilter === 'expired')  return d.daysUntilExpiry < 0;
    if (docFilter === 'expiring') return d.daysUntilExpiry >= 0 && d.daysUntilExpiry <= 30;
    return true;
  });

  function docTypeLabel(dt: DocType) {
    return t(`compliance_${dt}` as Parameters<typeof t>[0]);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  const BAND_COLOR: Record<string, string> = {
    platinum:     'var(--color-text-success)',
    high_green:   'var(--color-text-success)',
    medium_green: 'var(--color-text-success)',
    low_green:    'var(--color-text-warning)',
    yellow:       'var(--color-text-warning)',
    red:          'var(--color-text-danger)',
  };

  return (
    <>
      <TopBar title={t('compliance_title')} subtitle={t('compliance_subtitle')} />

      <main className={styles.main} id="main-content" tabIndex={-1}>

        {/* Nitaqat card */}
        <section className={styles.card} aria-labelledby="nitaqat-heading">
          <h2 id="nitaqat-heading" className={styles.cardTitle}>{t('compliance_nitaqat')}</h2>

          <div className={styles.nitaqatGrid}>
            <div className={styles.nitaqatStat}>
              <span className={styles.statValue} style={{ color: BAND_COLOR[nitaqat.band] }}>
                <bdi className="ltr-isolate">{saudiPct}%</bdi>
              </span>
              <span className={styles.statLabel}>{t('compliance_nitaqat_current')}</span>
            </div>
            <div className={styles.nitaqatStat}>
              <span className={styles.statValue}>
                <bdi className="ltr-isolate">{nitaqat.targetPercent}%</bdi>
              </span>
              <span className={styles.statLabel}>{t('compliance_nitaqat_target')}</span>
            </div>
            <div className={styles.nitaqatStat}>
              <span className={styles.statValue} style={{ color: gap > 0 ? 'var(--color-text-danger)' : 'var(--color-text-success)' }}>
                <bdi className="ltr-isolate">{gap > 0 ? `−${gap}%` : `+${Math.abs(gap)}%`}</bdi>
              </span>
              <span className={styles.statLabel}>{t('compliance_nitaqat_gap')}</span>
            </div>
          </div>

          <div className={styles.meterWrap}>
            <div
              className={styles.meter}
              role="progressbar"
              aria-valuenow={saudiPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${saudiPct}% Saudization`}
            >
              <div
                className={styles.meterFill}
                style={{ width: `${saudiPct}%`, background: BAND_COLOR[nitaqat.band] }}
              />
              <div
                className={styles.meterTarget}
                style={{ insetInlineStart: `${nitaqat.targetPercent}%` }}
                aria-hidden="true"
              />
            </div>
          </div>

          <p className={styles.nitaqatSub}>
            <bdi className="ltr-isolate">{nitaqat.saudiNationals}</bdi>
            {' '}{t('compliance_nitaqat_saudis')}{' '}
            {t('of')}{' '}
            <bdi className="ltr-isolate">{nitaqat.totalEmployees}</bdi>
            {' '}{t('compliance_nitaqat_total')}
          </p>
        </section>

        {/* Document expiry */}
        <section aria-labelledby="doc-heading">
          <div className={styles.sectionHeader}>
            <h2 id="doc-heading" className={styles.cardTitle}>{t('compliance_doc_expiry')}</h2>
            <div className={styles.filterBar} role="group" aria-label={t('filter')}>
              {DOC_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  className={styles.filterBtn}
                  aria-pressed={docFilter === value}
                  onClick={() => setDocFilter(value)}
                >
                  {label}
                  {value !== 'all' && (
                    <span className={styles.filterCount}>
                      {value === 'expired'
                        ? MOCK_DOCS.filter((d) => d.daysUntilExpiry < 0).length
                        : MOCK_DOCS.filter((d) => d.daysUntilExpiry >= 0 && d.daysUntilExpiry <= 30).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div className={styles.docEmpty} role="status">
              <p className={styles.docEmptyTitle}>{t('compliance_doc_empty')}</p>
              <p className={styles.docEmptySub}>{t('compliance_doc_empty_sub')}</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.th}>{t('col_employee')}</th>
                    <th scope="col" className={styles.th}>{t('col_document')}</th>
                    <th scope="col" className={styles.th}>{t('col_expiry')}</th>
                    <th scope="col" className={styles.th}>{t('col_expires_in')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc, i) => {
                    const expired = doc.daysUntilExpiry < 0;
                    const urgent  = !expired && doc.daysUntilExpiry <= 14;
                    return (
                      <tr key={i} className={styles.docRow}>
                        <td className={styles.td}>{doc.employeeName}</td>
                        <td className={styles.td}>{docTypeLabel(doc.docType)}</td>
                        <td className={styles.td}><bdi className="ltr-isolate">{formatDate(doc.expiryDate)}</bdi></td>
                        <td className={styles.td}>
                          <span
                            className={styles.expiryBadge}
                            data-expired={expired ? '' : undefined}
                            data-urgent={urgent ? '' : undefined}
                          >
                            {expired
                              ? t('compliance_expired')
                              : <><bdi className="ltr-isolate">{doc.daysUntilExpiry}</bdi>{' '}{t('compliance_days_left')}</>
                            }
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

/* ── Mock ── */
const MOCK_NITAQAT: NitaqatStats = {
  totalEmployees: 248, saudiNationals: 44, targetPercent: 20, band: 'medium_green',
};

const TODAY = new Date();
function daysFrom(days: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const MOCK_DOCS: DocExpiryItem[] = [
  { employeeId: 'emp_012e44', employeeName: 'Reem Al-Dawsari',    docType: 'iqama',    expiryDate: daysFrom(-5),  daysUntilExpiry: -5 },
  { employeeId: 'emp_004a11', employeeName: 'Khalid Al-Otaibi',   docType: 'passport', expiryDate: daysFrom(8),   daysUntilExpiry: 8 },
  { employeeId: 'emp_0c3b77', employeeName: 'Fatima Al-Dosari',   docType: 'iqama',    expiryDate: daysFrom(12),  daysUntilExpiry: 12 },
  { employeeId: 'emp_07d2f9', employeeName: 'Mohammed Al-Ghamdi', docType: 'contract', expiryDate: daysFrom(22),  daysUntilExpiry: 22 },
  { employeeId: 'emp_018f23', employeeName: 'Sara Al-Harbi',      docType: 'cchi',     expiryDate: daysFrom(45),  daysUntilExpiry: 45 },
  { employeeId: 'emp_hr02',   employeeName: 'Tariq Al-Maliki',    docType: 'driving',  expiryDate: daysFrom(90),  daysUntilExpiry: 90 },
];
