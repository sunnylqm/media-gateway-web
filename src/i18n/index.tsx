import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type MessageKey } from './en';
import { zh } from './zh';
import { translateTerm } from './terms';

export type Locale = 'en' | 'zh';
export type { MessageKey };

export const locales: Locale[] = ['en', 'zh'];

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, zh };
const storageKey = 'media_gateway_locale';

function isLocale(value: string | null): value is Locale {
  return value === 'en' || value === 'zh';
}

function storedLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    return isLocale(value) ? value : null;
  } catch {
    // A browser with storage disabled still gets a working console.
    return null;
  }
}

function preferredLocale(): Locale {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    if (candidate?.toLowerCase().startsWith('zh')) return 'zh';
    if (candidate?.toLowerCase().startsWith('en')) return 'en';
  }
  return 'en';
}

// The active locale is module state as well as React state: formatters and the
// API client translate outside the component tree, and both are read during a
// render that the provider has already re-run.
let active: Locale = storedLocale() ?? preferredLocale();

export function getLocale(): Locale {
  return active;
}

// Dates, numbers, and currency follow the reader. An English reader keeps their
// own regional conventions rather than being pushed to one English region.
export function intlLocale(): string | undefined {
  if (active === 'zh') return 'zh-CN';
  const preferred = navigator.language ?? '';
  return preferred.toLowerCase().startsWith('en') ? preferred : 'en-US';
}

export function t(key: MessageKey, values?: Record<string, string | number>): string {
  const message = dictionaries[active][key] ?? en[key] ?? key;
  if (!values) return message;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    message,
  );
}

// Vocabulary the gateway sends — statuses, media roles, parameter names — has
// no key of its own; an untranslated term keeps the value the API returned.
export function term(value: string): string | undefined {
  return translateTerm(active, value);
}

function apply(locale: Locale) {
  active = locale;
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.title');
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof t;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setCurrent] = useState<Locale>(active);

  useEffect(() => { apply(locale); }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    active = next;
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // The choice still holds for this tab.
    }
    setCurrent(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useI18n must be used inside LocaleProvider');
  return value;
}

export function localeName(locale: Locale) {
  return t(locale === 'zh' ? 'language.zh' : 'language.en');
}
