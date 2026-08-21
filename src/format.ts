export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export function formatBytes(value: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', style: 'unit', unit: 'byte', unitDisplay: 'narrow' }).format(value);
}

export function formatParameterName(value: string) {
  return value.replaceAll('_', ' ');
}

export function formatParameterValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

const acronyms = new Set(['ai', 'aigc', 'api', 'id', 'url', 'fps', 'hd', 'sd', 'cfg']);

export function formatLabel(value: string) {
  return value.split('_')
    .map((word, index) => {
      if (acronyms.has(word.toLowerCase())) return word.toUpperCase();
      return index === 0 ? word.replace(/^./, (character) => character.toUpperCase()) : word;
    })
    .join(' ');
}

// Billing amounts travel as currency minor units, so the divisor comes from the
// locale's own fraction digits for that currency rather than a fixed 100.
export function formatAmount(minorUnits: number, currency: string) {
  try {
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(minorUnits / 10 ** digits);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}
