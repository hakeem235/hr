import type { Metadata } from 'next';
import { LocaleProvider } from '@/lib/locale-context';
import { AppShell } from '@/components/shell/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'HR Platform — Console',
  description: 'HR Ops and Admin console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* dir/lang are set dynamically by AppShell via useEffect */
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <LocaleProvider>
          <AppShell>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
