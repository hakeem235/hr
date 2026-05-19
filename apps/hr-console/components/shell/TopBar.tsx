'use client';
import { useLocale } from '@/lib/locale-context';
import styles from './TopBar.module.css';

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  const { locale, toggle } = useLocale();

  return (
    <header className={styles.topBar}>
      <div className={styles.headingGroup}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      <div className={styles.controls}>
        {actions}

        <button
          className={styles.localeToggle}
          onClick={toggle}
          aria-label={locale === 'en' ? 'Switch to Arabic' : 'Switch to English'}
          title={locale === 'en' ? 'عربي' : 'English'}
        >
          {locale === 'en' ? 'ع' : 'EN'}
        </button>
      </div>
    </header>
  );
}
