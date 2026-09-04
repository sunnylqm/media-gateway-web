import { getLocale, intlLocale, term } from './i18n';

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(intlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDay(value: string) {
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium' }).format(
    new Date(value),
  );
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
export function formatBytes(value: number) {
  let size = value;
  let unit = 0;
  while (size >= 1000 && unit < byteUnits.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(intlLocale(), {
    style: 'unit',
    unit: byteUnits[unit],
    unitDisplay: 'narrow',
    maximumFractionDigits: unit > 0 && size < 10 ? 1 : 0,
  }).format(size);
}

export function formatParameterName(value: string) {
  return term(value) ?? value.replaceAll('_', ' ');
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
export function formatStatus(value: string) {
  return term(value) ?? value.replaceAll('_', ' ');
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

export function formatLabel(value: string) {
  const translated = term(value);
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
export function formatAmount(minorUnits: number, currency: string) {
  try {
    const formatter = new Intl.NumberFormat(intlLocale(), {
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

export function formatDimensionOption(
  value: string,
  locale: string = getLocale(),
): string {
  const normalized = value.trim();
  const isZh = locale.toLowerCase().startsWith('zh');
  const explanations = isZh ? dimensionExplanationsZh : dimensionExplanationsEn;

  if (explanations[normalized]) {
    return explanations[normalized];
  }

  const lower = normalized.toLowerCase();
  if (lower === 'auto') return isZh ? '自动' : 'Auto';
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
