'use client';
import { useEffect } from 'react';
import { useLocale } from '@/lib/locale-context';
import { Sidebar } from './Sidebar';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { dir, locale } = useLocale();

  /* Sync dir + lang onto <html> so logical CSS and screen readers work */
  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', locale);
  }, [dir, locale]);

  return (
    <div className={styles.shell} data-density="compact">
      <a href="#main-content" className="skip-link">
        {locale === 'ar' ? 'انتقل إلى المحتوى الرئيسي' : 'Skip to main content'}
      </a>
      <Sidebar />
      <div className={styles.content} id="main-content">
        {children}
      </div>
    </div>
  );
}
