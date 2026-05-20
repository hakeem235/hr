'use client';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import { TopBar } from '@/components/shell/TopBar';
import styles from './page.module.css';

interface SettingSection {
  titleKey: Parameters<ReturnType<typeof useLocale>['t']>[0];
  subKey:   Parameters<ReturnType<typeof useLocale>['t']>[0];
  icon: string;
  href?: string;
}

const SECTIONS: SettingSection[] = [
  { titleKey: 'settings_general',        subKey: 'settings_general_sub',        icon: '⚙' },
  { titleKey: 'settings_workflows',      subKey: 'settings_workflows_sub',      icon: '◈', href: '/settings/workflows' },
  { titleKey: 'settings_leave_policies', subKey: 'settings_leave_policies_sub', icon: '◷' },
  { titleKey: 'settings_integrations',   subKey: 'settings_integrations_sub',   icon: '⇌' },
  { titleKey: 'settings_notifications',  subKey: 'settings_notifications_sub',  icon: '◌' },
];

export default function SettingsPage() {
  const { t } = useLocale();

  return (
    <>
      <TopBar title={t('settings_title')} subtitle={t('settings_subtitle')} />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        <div className={styles.sectionList}>
          {SECTIONS.map(({ titleKey, subKey, icon, href }) => (
            <article key={titleKey} className={styles.section}>
              <div className={styles.sectionIcon} aria-hidden="true">{icon}</div>
              <div className={styles.sectionBody}>
                <h2 className={styles.sectionTitle}>{t(titleKey)}</h2>
                <p className={styles.sectionSub}>{t(subKey)}</p>
              </div>
              <div className={styles.sectionAction}>
                {href ? (
                  <Link href={href} className={styles.openLink}>Open →</Link>
                ) : (
                  <span className={styles.comingSoon}>{t('settings_coming_soon')}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
