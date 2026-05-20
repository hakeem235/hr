'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchEmployee, fetchCurrentPosition, fetchCurrentCompensation, fetchLeaveRequests } from '@/lib/api';
import type { EmployeeListItem, PositionRecord, CompensationRecord, LeaveRecord } from '@/lib/types';
import styles from './page.module.css';

function formatMoney(minor: number, currency = 'SAR') {
  return `${currency} ${(minor / 100).toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useLocale();

  const [employee, setEmployee]       = useState<EmployeeListItem | null>(null);
  const [position, setPosition]       = useState<PositionRecord | null>(null);
  const [compensation, setComp]       = useState<CompensationRecord | null>(null);
  const [leaveHistory, setLeave]      = useState<LeaveRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<'overview' | 'leave'>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emp, pos, comp, leaveRes] = await Promise.allSettled([
        fetchEmployee(id),
        fetchCurrentPosition(id),
        fetchCurrentCompensation(id),
        fetchLeaveRequests({ employeeId: id, limit: 10 }),
      ]);
      setEmployee(emp.status === 'fulfilled' ? emp.value : MOCK_EMPLOYEE);
      setPosition(pos.status === 'fulfilled' ? pos.value : MOCK_POSITION);
      setComp(comp.status === 'fulfilled' ? comp.value : MOCK_COMP);
      setLeave(leaveRes.status === 'fulfilled' ? (leaveRes.value.items ?? []) : MOCK_LEAVE);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const emp = employee ?? MOCK_EMPLOYEE;

  return (
    <>
      <TopBar
        title={loading ? t('loading') : emp.fullNameEn}
        subtitle={position?.title ?? ''}
        actions={
          <Button variant="ghost" size="md" onClick={() => router.push('/people')}>
            ← {t('profile_back')}
          </Button>
        }
      />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        {/* Header card */}
        <div className={styles.headerCard}>
          <div className={styles.avatarLg} aria-hidden="true">
            {emp.fullNameEn.split(' ').slice(0, 2).map(w => w[0]).join('')}
          </div>
          <div className={styles.headerInfo}>
            <h2 className={styles.empName}>{emp.fullNameEn}</h2>
            <p className={styles.empMeta}>
              <bdi className="ltr-isolate">{emp.employeeNumber}</bdi>
              {' · '}
              {position?.departmentName ?? emp.departmentName ?? t('not_available')}
            </p>
          </div>
          <div className={styles.headerStatus}>
            <StatusPill
              status={emp.status}
              label={t(`status_${emp.status}` as Parameters<typeof t>[0])}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs} role="tablist">
          {(['overview', 'leave'] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={styles.tab}
              onClick={() => setActiveTab(tab)}
            >
              {t(tab === 'overview' ? 'profile_overview' : 'profile_leave')}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className={styles.panelGrid}>
            {/* Position */}
            <section className={styles.card} aria-labelledby="pos-heading">
              <h3 id="pos-heading" className={styles.cardTitle}>{t('profile_position')}</h3>
              {position ? (
                <dl className={styles.dl}>
                  <div className={styles.dlRow}>
                    <dt className={styles.dt}>{t('col_position')}</dt>
                    <dd className={styles.dd}>{position.title}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt className={styles.dt}>{t('col_department')}</dt>
                    <dd className={styles.dd}>{position.departmentName ?? t('not_available')}</dd>
                  </div>
                  {position.grade && (
                    <div className={styles.dlRow}>
                      <dt className={styles.dt}>Grade</dt>
                      <dd className={styles.dd}><bdi className="ltr-isolate">{position.grade}</bdi></dd>
                    </div>
                  )}
                  <div className={styles.dlRow}>
                    <dt className={styles.dt}>{t('profile_effective_from')}</dt>
                    <dd className={styles.dd}><bdi className="ltr-isolate">{formatDate(position.effectiveFrom, locale)}</bdi></dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.noData}>{t('not_available')}</p>
              )}
            </section>

            {/* Compensation */}
            <section className={styles.card} aria-labelledby="comp-heading">
              <h3 id="comp-heading" className={styles.cardTitle}>{t('profile_compensation')}</h3>
              {compensation ? (
                <dl className={styles.dl}>
                  <div className={styles.dlRow}>
                    <dt className={styles.dt}>{t('profile_basic_salary')}</dt>
                    <dd className={styles.dd}><bdi className="ltr-isolate">{formatMoney(compensation.basicMinor, compensation.currency)}</bdi></dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt className={styles.dt}>{t('profile_housing')}</dt>
                    <dd className={styles.dd}><bdi className="ltr-isolate">{formatMoney(compensation.housingMinor, compensation.currency)}</bdi></dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt className={styles.dt}>{t('profile_transport')}</dt>
                    <dd className={styles.dd}><bdi className="ltr-isolate">{formatMoney(compensation.transportMinor, compensation.currency)}</bdi></dd>
                  </div>
                  <div className={`${styles.dlRow} ${styles.dlTotal}`}>
                    <dt className={styles.dt}>{t('profile_total')}</dt>
                    <dd className={styles.dd}>
                      <bdi className="ltr-isolate">
                        {formatMoney(compensation.basicMinor + compensation.housingMinor + compensation.transportMinor, compensation.currency)}
                      </bdi>
                    </dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt className={styles.dt}>{t('profile_effective_from')}</dt>
                    <dd className={styles.dd}><bdi className="ltr-isolate">{formatDate(compensation.effectiveFrom, locale)}</bdi></dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.noData}>{t('not_available')}</p>
              )}
            </section>

            {/* Employee details */}
            <section className={styles.card} aria-labelledby="details-heading">
              <h3 id="details-heading" className={styles.cardTitle}>{t('profile_overview')}</h3>
              <dl className={styles.dl}>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>{t('col_id')}</dt>
                  <dd className={styles.dd}><bdi className="ltr-isolate">{emp.employeeNumber}</bdi></dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>{t('col_nationality')}</dt>
                  <dd className={styles.dd}>{emp.nationality}</dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>{t('col_hire_date')}</dt>
                  <dd className={styles.dd}><bdi className="ltr-isolate">{formatDate(emp.hireDate, locale)}</bdi></dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>{t('col_status')}</dt>
                  <dd className={styles.dd}>
                    <StatusPill status={emp.status} label={t(`status_${emp.status}` as Parameters<typeof t>[0])} />
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        )}

        {activeTab === 'leave' && (
          <div className={styles.leavePanel}>
            {leaveHistory.length === 0 ? (
              <p className={styles.noData}>{t('leave_empty')}</p>
            ) : (
              <table className={styles.leaveTable}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.lth}>{t('col_type')}</th>
                    <th scope="col" className={styles.lth}>{t('col_dates')}</th>
                    <th scope="col" className={styles.lth}>{t('col_days')}</th>
                    <th scope="col" className={styles.lth}>{t('col_status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveHistory.map((req) => (
                    <tr key={req.id}>
                      <td className={styles.ltd}>{req.leaveTypeId}</td>
                      <td className={styles.ltd}>
                        <bdi className="ltr-isolate">
                          {formatDate(req.startDate, locale)} – {formatDate(req.endDate, locale)}
                        </bdi>
                      </td>
                      <td className={styles.ltd}><bdi className="ltr-isolate">{req.workingDays}</bdi></td>
                      <td className={styles.ltd}>
                        <StatusPill status={req.status} label={t(`status_${req.status}` as Parameters<typeof t>[0])} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </>
  );
}

/* ── Mock fallbacks ── */
const MOCK_EMPLOYEE: EmployeeListItem = {
  employeeId: 'emp_018f23', employeeNumber: 'EMP-006', fullNameEn: 'Sara Al-Harbi',
  nationality: 'SA', status: 'active', hireDate: '2022-02-14',
  departmentName: 'Engineering', positionTitle: 'Software Engineer',
};

const MOCK_POSITION: PositionRecord = {
  id: 'pos_01', employeeId: 'emp_018f23', title: 'Software Engineer',
  departmentId: 'dept_eng', departmentName: 'Engineering', grade: 'E3',
  workflowRole: 'employee', effectiveFrom: '2022-02-14',
};

const MOCK_COMP: CompensationRecord = {
  id: 'comp_01', employeeId: 'emp_018f23',
  basicMinor: 1500000, housingMinor: 600000, transportMinor: 200000,
  currency: 'SAR', effectiveFrom: '2022-02-14',
};

const MOCK_LEAVE: LeaveRecord[] = [
  { id: 'lv_000001', entityId: 'ent1', employeeId: 'emp_018f23', leaveTypeId: 'annual',
    startDate: '2026-05-25', endDate: '2026-05-29', workingDays: 5, status: 'pending_approval',
    createdAt: '2026-05-15T09:14:22+03:00' },
];
