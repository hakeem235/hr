'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Locale } from './i18n';
import { t as translate, type TranslationKey } from './i18n';

interface LocaleCtx {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: (key: TranslationKey) => string;
  toggle: () => void;
}

const Ctx = createContext<LocaleCtx>({
  locale: 'en',
  dir: 'ltr',
  t: (k) => k,
  toggle: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  function toggle() {
    setLocale((l) => (l === 'en' ? 'ar' : 'en'));
  }

  const value: LocaleCtx = {
    locale,
    dir,
    t: (key: TranslationKey) => translate(locale, key),
    toggle,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale() {
  return useContext(Ctx);
}
