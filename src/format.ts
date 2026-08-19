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
