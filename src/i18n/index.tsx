import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type Formatters, formatters } from '../format';
import { brandEn, type BrandMessageKey, brandZh } from './brand';
import { en, type MessageKey as CoreMessageKey } from './en';
import { zh } from './zh';

export type Locale = 'en' | 'zh';
export type MessageKey = CoreMessageKey | BrandMessageKey;

export const locales: Locale[] = ['en', 'zh'];

const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en: { ...en, ...brandEn },
  zh: { ...zh, ...brandZh },
};
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
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const candidate of candidates) {
    if (candidate?.toLowerCase().startsWith('zh')) return 'zh';
    if (candidate?.toLowerCase().startsWith('en')) return 'en';
  }
  return 'en';
}

// The active locale is also module state, for code that runs outside a render:
// the API client's errors, validation thrown from a submit handler, the
// document title. Rendering must never read it. The React Compiler caches what a
// component renders by the values it can see, and module state is invisible to
// it, so text read from here would survive a language change. Components use
// useI18n(), whose translator and formatters change identity with the locale.
let active: Locale = storedLocale() ?? preferredLocale();

export function getLocale(): Locale {
  return active;
}

type Values = Record<string, string | number>;

function message(locale: Locale, key: MessageKey, values?: Values): string {
  const text = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  if (!values) return text;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    text,
  );
}

// translate is for code outside a render; see `active` above.
export function translate(key: MessageKey, values?: Values): string {
  return message(active, key, values);
}

function apply(locale: Locale) {
  active = locale;
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = translate('app.title');
  const metadata = {
    'meta[name="description"]': translate('app.description'),
    'meta[property="og:title"]': translate('app.title'),
    'meta[property="og:description"]': translate('app.description'),
  };
  for (const [selector, content] of Object.entries(metadata)) {
    document.querySelector(selector)?.setAttribute('content', content);
  }
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Values) => string;
  format: Formatters;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setCurrent] = useState<Locale>(active);

  useEffect(() => {
    apply(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    active = next;
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // The choice still holds for this tab.
    }
    setCurrent(next);
  }, []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: MessageKey, values?: Values) => message(locale, key, values),
      format: formatters(locale),
    }),
    [locale, setLocale],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useI18n(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useI18n must be used inside LocaleProvider');
  return value;
}
