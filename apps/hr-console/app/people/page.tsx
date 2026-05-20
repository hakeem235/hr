'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/components/ui/Button';
import { PeopleTable } from '@/components/people/PeopleTable';
import { fetchEmployees } from '@/lib/api';
import type { EmployeeListItem, EmploymentStatus } from '@/lib/types';
import styles from './page.module.css';

type StatusFilter = 'all' | 'active' | 'probation' | 'inactive';

export default function PeoplePage() {
  const { t } = useLocale();
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEmployees({ limit: 100 });
      setEmployees(res.items ?? []);
    } catch {
      setEmployees(MOCK_EMPLOYEES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all',       label: t('people_filter_all') },
    { value: 'active',    label: t('people_filter_active') },
    { value: 'probation', label: t('people_filter_probation') },
    { value: 'inactive',  label: t('people_filter_inactive') },
  ];

  const INACTIVE_STATUSES: EmploymentStatus[] = ['inactive', 'terminated', 'suspended'];

  const filtered = employees.filter((emp) => {
    const matchesSearch =
      search === '' ||
      emp.fullNameEn.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeNumber.toLowerCase().includes(search.toLowerCase()) ||
      (emp.positionTitle ?? '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'inactive' ? INACTIVE_STATUSES.includes(emp.status) : emp.status === statusFilter);

    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <TopBar
        title={t('people_title')}
        subtitle={t('people_subtitle')}
        actions={
          <Button variant="primary" size="md" disabled>
            + {t('people_new_employee')}
          </Button>
        }
      />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">⌕</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder={t('people_search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('people_search')}
            />
          </div>

          <div className={styles.filterBar} role="group" aria-label={t('filter')}>
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                className={styles.filterBtn}
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
              >
                {label}
                {value !== 'all' && (
                  <span className={styles.filterCount}>
                    {value === 'inactive'
                      ? employees.filter((e) => INACTIVE_STATUSES.includes(e.status)).length
                      : employees.filter((e) => e.status === value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <PeopleTable
          employees={filtered}
          loading={loading}
          error={error ?? undefined}
          onRetry={load}
        />
      </main>
    </>
  );
}

/* ── Mock data ── */
const MOCK_EMPLOYEES: EmployeeListItem[] = [
  { employeeId: 'emp_dir01',  employeeNumber: 'EMP-001', fullNameEn: 'Nasser Al-Qahtani',  nationality: 'SA', status: 'active',    hireDate: '2018-01-15', departmentName: 'Executive',         positionTitle: 'Chief HR Officer' },
  { employeeId: 'emp_mgr01',  employeeNumber: 'EMP-002', fullNameEn: 'Ahmed Al-Rashidi',   nationality: 'SA', status: 'active',    hireDate: '2019-03-01', departmentName: 'Engineering',       positionTitle: 'Engineering Manager' },
  { employeeId: 'emp_mgr02',  employeeNumber: 'EMP-003', fullNameEn: 'Layla Al-Zahrani',   nationality: 'SA', status: 'active',    hireDate: '2020-06-10', departmentName: 'Operations',        positionTitle: 'Operations Manager' },
  { employeeId: 'emp_hr01',   employeeNumber: 'EMP-004', fullNameEn: 'Maha Al-Shehri',     nationality: 'SA', status: 'active',    hireDate: '2021-01-20', departmentName: 'HR',                positionTitle: 'HR Specialist' },
  { employeeId: 'emp_hr02',   employeeNumber: 'EMP-005', fullNameEn: 'Tariq Al-Maliki',    nationality: 'SA', status: 'active',    hireDate: '2021-04-05', departmentName: 'HR',                positionTitle: 'HR Coordinator' },
  { employeeId: 'emp_018f23', employeeNumber: 'EMP-006', fullNameEn: 'Sara Al-Harbi',      nationality: 'SA', status: 'active',    hireDate: '2022-02-14', departmentName: 'Engineering',       positionTitle: 'Software Engineer' },
  { employeeId: 'emp_004a11', employeeNumber: 'EMP-007', fullNameEn: 'Khalid Al-Otaibi',   nationality: 'SA', status: 'on_leave',  hireDate: '2022-05-01', departmentName: 'Engineering',       positionTitle: 'Senior Engineer' },
  { employeeId: 'emp_0c3b77', employeeNumber: 'EMP-008', fullNameEn: 'Fatima Al-Dosari',   nationality: 'SA', status: 'active',    hireDate: '2023-01-08', departmentName: 'Operations',        positionTitle: 'Operations Analyst' },
  { employeeId: 'emp_07d2f9', employeeNumber: 'EMP-009', fullNameEn: 'Mohammed Al-Ghamdi', nationality: 'SA', status: 'probation', hireDate: '2026-03-01', departmentName: 'Finance',           positionTitle: 'Financial Analyst' },
  { employeeId: 'emp_012e44', employeeNumber: 'EMP-010', fullNameEn: 'Reem Al-Dawsari',    nationality: 'BH', status: 'active',    hireDate: '2023-09-15', departmentName: 'Product & Design',  positionTitle: 'UX Designer' },
];
