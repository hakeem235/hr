'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/locale-context';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { key: 'leave' as const, href: '/leave', icon: '◷', labelKey: 'nav_leave' as const },
  { key: 'approvals' as const, href: '/approvals', icon: '✓', labelKey: 'nav_approvals' as const },
  { key: 'people' as const, href: '/people', icon: '◎', labelKey: 'nav_people' as const },
  { key: 'payroll' as const, href: '/payroll', icon: '◈', labelKey: 'nav_payroll' as const },
  { key: 'compliance' as const, href: '/compliance', icon: '◻', labelKey: 'nav_compliance' as const },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <nav className={styles.sidebar} aria-label="Primary navigation">
      <div className={styles.logo}>
        <span className={styles.logoMark} aria-hidden="true">HR</span>
        <span className={styles.logoText}>Platform</span>
      </div>

      <ul className={styles.navList} role="list">
        {NAV_ITEMS.map(({ href, icon, labelKey }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={styles.navItem}
                aria-current={active ? 'page' : undefined}
                data-active={active ? '' : undefined}
              >
                <span className={styles.navIcon} aria-hidden="true">{icon}</span>
                <span className={styles.navLabel}>{t(labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.sidebarFooter}>
        <Link href="/settings" className={styles.navItem} aria-label={t('nav_settings')}>
          <span className={styles.navIcon} aria-hidden="true">⚙</span>
          <span className={styles.navLabel}>{t('nav_settings')}</span>
        </Link>
      </div>
    </nav>
  );
}
