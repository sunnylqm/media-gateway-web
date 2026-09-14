import type { Locale } from './i18n';
import { translateTerm } from './i18n/terms';

// Every formatter here takes the locale it formats for rather than reading the
// active one. Components get these bound to the current locale from useI18n():
// the React Compiler caches a call by its arguments, so a formatter that read
// the locale on its own would keep showing the previous language.

// Dates, numbers, and currency follow the reader. An English reader keeps their
// own regional conventions rather than being pushed to one English region.
export function intlLocale(locale: Locale): string {
  if (locale === 'zh') return 'zh-CN';
  const preferred =
    typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
  return preferred.toLowerCase().startsWith('en') ? preferred : 'en-US';
}

export function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

// formatDateTime carries the year, for a single timestamp read on its own
// rather than scanned down a column of recent rows.
export function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDay(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
  }).format(new Date(value));
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

// The plaza reads better with "3 hours ago" than a timestamp, but anything
// older than a year is easier to place by its date.
export function formatRelativeTime(
  value: string,
  locale: Locale,
  now: number = Date.now(),
) {
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return value;
  const seconds = Math.round((at - now) / 1000);
  const magnitude = Math.abs(seconds);
  if (magnitude >= relativeUnits[0][1]) return formatDay(value, locale);
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: 'auto',
  });
  for (const [unit, size] of relativeUnits) {
    if (magnitude >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return formatter.format(Math.min(seconds, 0), 'second');
}

const byteUnits = [
  'byte',
  'kilobyte',
  'megabyte',
  'gigabyte',
  'terabyte',
] as const;

// The unit is chosen here rather than left to compact notation, which counts a
// file in 万 and 亿 for Chinese and in billions of bytes for English.
export function formatBytes(value: number, locale: Locale) {
  let size = value;
  let unit = 0;
  while (size >= 1000 && unit < byteUnits.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'unit',
    unit: byteUnits[unit],
    unitDisplay: 'narrow',
    maximumFractionDigits: unit > 0 && size < 10 ? 1 : 0,
  }).format(size);
}

export function formatParameterName(value: string, locale: Locale) {
  return translateTerm(locale, value) ?? value.replaceAll('_', ' ');
}

export function formatParameterValue(value: unknown) {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return String(value);
  return JSON.stringify(value);
}

// Statuses arrive as gateway vocabulary. A locale that has a word for one uses
// it; anything else keeps the value the API sent, spaced for reading.
export function formatStatus(value: string, locale: Locale) {
  return translateTerm(locale, value) ?? value.replaceAll('_', ' ');
}

const acronyms = new Set([
  'ai',
  'aigc',
  'api',
  'id',
  'url',
  'fps',
  'hd',
  'sd',
  'cfg',
]);

export function formatLabel(value: string, locale: Locale) {
  const translated = translateTerm(locale, value);
  if (translated) return translated;
  return value
    .split('_')
    .map((word, index) => {
      if (acronyms.has(word.toLowerCase())) return word.toUpperCase();
      return index === 0
        ? word.replace(/^./, (character) => character.toUpperCase())
        : word;
    })
    .join(' ');
}

// Billing amounts travel as currency minor units, so the divisor comes from the
// locale's own fraction digits for that currency rather than a fixed 100.
export function formatAmount(
  minorUnits: number,
  currency: string,
  locale: Locale,
) {
  try {
    const formatter = new Intl.NumberFormat(intlLocale(locale), {
      style: 'currency',
      currency,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(minorUnits / 10 ** digits);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}

const dimensionExplanationsZh: Record<string, string> = {
  '1024x1024': '1024x1024 (正方形)',
  '1536x1024': '1536x1024 (横版)',
  '1024x1536': '1024x1536 (竖版)',
  '2048x2048': '2048x2048 (2K 正方形)',
  '2048x1152': '2048x1152 (2K 横版)',
  '3840x2160': '3840x2160 (4K 横版)',
  '2160x3840': '2160x3840 (4K 竖版)',
};

const dimensionExplanationsEn: Record<string, string> = {
  '1024x1024': '1024x1024 (square)',
  '1536x1024': '1536x1024 (landscape)',
  '1024x1536': '1024x1536 (portrait)',
  '2048x2048': '2048x2048 (2K square)',
  '2048x1152': '2048x1152 (2K landscape)',
  '3840x2160': '3840x2160 (4K landscape)',
  '2160x3840': '2160x3840 (4K portrait)',
};

export function formatDimensionOption(value: string, locale: Locale): string {
  const normalized = value.trim();
  const isZh = locale === 'zh';
  const explanations = isZh ? dimensionExplanationsZh : dimensionExplanationsEn;

  if (explanations[normalized]) {
    return explanations[normalized];
  }

  const lower = normalized.toLowerCase();
  if (lower === 'auto') return isZh ? '自动' : 'Auto';
  if (lower === 'adaptive') return isZh ? 'adaptive (自适应)' : 'Adaptive';
  if (lower === 'square') return isZh ? '正方形' : 'Square';
  if (lower === 'landscape') return isZh ? '横版' : 'Landscape';
  if (lower === 'portrait') return isZh ? '竖版' : 'Portrait';

  const match = /^(\d+)[xX](\d+)$/.exec(normalized);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width === height)
      return `${normalized} (${isZh ? '正方形' : 'square'})`;
    if (width > height) return `${normalized} (${isZh ? '横版' : 'landscape'})`;
    return `${normalized} (${isZh ? '竖版' : 'portrait'})`;
  }

  const ratioMatch = /^(\d+):(\d+)$/.exec(normalized);
  if (ratioMatch) {
    const width = Number(ratioMatch[1]);
    const height = Number(ratioMatch[2]);
    if (width === height)
      return `${normalized} (${isZh ? '正方形' : 'square'})`;
    if (width > height) return `${normalized} (${isZh ? '横版' : 'landscape'})`;
    return `${normalized} (${isZh ? '竖版' : 'portrait'})`;
  }

  return value;
}

export function formatQuantity(name: string, value: number) {
  return /duration|second/i.test(name) ? `${value}s` : String(value);
}

// Option words a model's vocabulary shares across providers. A value with no
// entry is shown as sent, so a provider's new level still reads.
const optionWordsZh: Record<string, string> = {
  auto: '自动',
  adaptive: 'adaptive (自适应)',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
  max: '最高',
  standard: '标准',
  hd: '高清',
  opaque: '不透明',
  transparent: '透明',
};

const optionWordsEn: Record<string, string> = {
  auto: 'Auto',
  adaptive: 'Adaptive',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
  standard: 'Standard',
  hd: 'HD',
  opaque: 'Opaque',
  transparent: 'Transparent',
};

// Moderation levels say how strict the filter is, not how much of something
// there is, so they read differently from the shared words.
const moderationWordsZh: Record<string, string> = {
  auto: '标准',
  low: '宽松',
};

const moderationWordsEn: Record<string, string> = {
  auto: 'Standard',
  low: 'Relaxed',
};

const dimensionParameter =
  /^(resolution|size|dimensions?|aspect_ratio|aspectratio|ar|ratio)$/i;

// formatOptionValue is how one accepted value of a parameter is shown in a
// form: sizes and ratios with their orientation, and shared option words in
// the reader's language. The value sent upstream never changes.
export function formatOptionValue(
  name: string,
  value: string,
  locale: Locale,
): string {
  if (dimensionParameter.test(name) || /^\d+[xX:]\d+$/.test(value.trim()))
    return formatDimensionOption(value, locale);
  const isZh = locale === 'zh';
  const key = value.trim().toLowerCase();
  if (/moderation/i.test(name)) {
    const word = (isZh ? moderationWordsZh : moderationWordsEn)[key];
    if (word) return word;
  }
  return (isZh ? optionWordsZh : optionWordsEn)[key] ?? value;
}

// A number worth typing rather than dragging to: a seed, or any range too wide
// for a slider to land on a chosen value.
export function isFreeNumber(name: string, minimum?: number, maximum?: number) {
  if (/seed/i.test(name)) return true;
  return (
    minimum !== undefined && maximum !== undefined && maximum - minimum > 1000
  );
}

export function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export type Formatters = ReturnType<typeof formatters>;

// formatters binds every locale-aware formatter to one locale. useI18n() hands
// out a fresh set whenever the language changes, which is what lets compiled
// components see that their cached output is stale.
export function formatters(locale: Locale) {
  return {
    // The locale in Intl's terms, for Intl APIs called outside this module.
    intl: intlLocale(locale),
    date: (value: string) => formatDate(value, locale),
    dateTime: (value: string) => formatDateTime(value, locale),
    day: (value: string) => formatDay(value, locale),
    relativeTime: (value: string, now?: number) =>
      formatRelativeTime(value, locale, now),
    bytes: (value: number) => formatBytes(value, locale),
    number: (value: number) => formatNumber(value, locale),
    amount: (minorUnits: number, currency: string) =>
      formatAmount(minorUnits, currency, locale),
    parameterName: (value: string) => formatParameterName(value, locale),
    status: (value: string) => formatStatus(value, locale),
    label: (value: string) => formatLabel(value, locale),
    dimensionOption: (value: string) => formatDimensionOption(value, locale),
    optionValue: (name: string, value: string) =>
      formatOptionValue(name, value, locale),
  };
}
