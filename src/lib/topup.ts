// Stripe top-up amounts travel as currency minor units, the same as every other
// billing figure the gateway sends. The console shows major units, so parsing
// and formatting live here where they can be tested without a browser.

const currencySymbols: Record<string, string> = {
  AUD: 'A$',
  CAD: 'C$',
  CNY: '¥',
  EUR: '€',
  GBP: '£',
  HKD: 'HK$',
  JPY: '¥',
  KRW: '₩',
  SGD: 'S$',
  TWD: 'NT$',
  USD: '$',
};

// A currency with no symbol of its own keeps its code, printed after the value
// so `20 AED` still reads as an amount rather than a product name.
export function currencySymbol(currency: string): string {
  const code = currency.trim().toUpperCase();
  return currencySymbols[code] ?? code;
}

export function majorUnitsLabel(minorUnits: number): string {
  const major = minorUnits / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

export function topupAmountLabel(minorUnits: number, currency: string): string {
  const symbol = currencySymbol(currency);
  const value = majorUnitsLabel(minorUnits);
  const code = currency.trim().toUpperCase();
  return symbol === code ? `${value} ${code}` : `${symbol}${value}`;
}

export type TopupAmountBounds = { min: number; max: number };

export type TopupAmountResult =
  | { ok: true; amount: number }
  | { ok: false; reason: 'invalid' | 'below_min' | 'above_max' };

const majorUnitsPattern = /^\d+(\.\d{1,2})?$/;

function toMinorUnits(value: string): number | null {
  const text = value.trim();
  if (!majorUnitsPattern.test(text)) return null;
  const minorUnits = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) return null;
  return minorUnits;
}

// The tenant types major units with at most two decimals; the API takes the
// integer minor units and rejects anything outside the configured window.
export function parseTopupAmount(
  value: string,
  bounds: TopupAmountBounds,
): TopupAmountResult {
  const amount = toMinorUnits(value);
  if (amount === null) return { ok: false, reason: 'invalid' };
  if (bounds.min > 0 && amount < bounds.min)
    return { ok: false, reason: 'below_min' };
  if (bounds.max > 0 && amount > bounds.max)
    return { ok: false, reason: 'above_max' };
  return { ok: true, amount };
}

export type PresetAmountsResult =
  | { ok: true; amounts: number[] }
  | { ok: false; reason: 'empty' | 'invalid' | 'too_many' };

export const maxPresetAmounts = 20;

// The administrator edits presets as a comma separated list of major units.
// Duplicates collapse and the result is sorted, matching what the server stores.
export function parsePresetAmounts(value: string): PresetAmountsResult {
  const parts = value
    .split(/[,，、\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, reason: 'empty' };
  const amounts = new Set<number>();
  for (const part of parts) {
    const amount = toMinorUnits(part);
    if (amount === null) return { ok: false, reason: 'invalid' };
    amounts.add(amount);
  }
  if (amounts.size > maxPresetAmounts) return { ok: false, reason: 'too_many' };
  return {
    ok: true,
    amounts: [...amounts].sort((left, right) => left - right),
  };
}

export function formatPresetAmounts(amounts: number[]): string {
  return amounts.map(majorUnitsLabel).join(', ');
}

export type TopupConfigDraft = {
  amounts: number[];
  minAmount: number;
  maxAmount: number;
};

export type TopupConfigProblem = 'min' | 'range' | 'outside' | null;

// The gateway applies the same rules, but catching them here keeps the
// administrator from losing a form to a round trip.
export function validateTopupConfig(
  draft: TopupConfigDraft,
): TopupConfigProblem {
  if (!Number.isSafeInteger(draft.minAmount) || draft.minAmount <= 0)
    return 'min';
  if (!Number.isSafeInteger(draft.maxAmount) || draft.maxAmount <= 0)
    return 'min';
  if (draft.minAmount > draft.maxAmount) return 'range';
  if (
    draft.amounts.some(
      (amount) => amount < draft.minAmount || amount > draft.maxAmount,
    )
  )
    return 'outside';
  return null;
}

export function parseBoundAmount(value: string): number | null {
  return toMinorUnits(value);
}

// Stripe sends the browser back to this URL with its own query string, so the
// console hands over its location without one of its own.
export function topupReturnURL(location: {
  origin: string;
  pathname: string;
}): string {
  return `${location.origin}${location.pathname}`;
}

export function stripeWebhookURL(gateway: string): string {
  return `${gateway.replace(/\/$/, '')}/v1/billing/stripe/webhook`;
}

// Top-up states borrow the generic status badges: a paid order reads like an
// active record, a pending one like work in flight, and the rest like a stop.
export function topupStatusClass(status: string): string {
  if (status === 'paid') return 'status-active';
  if (status === 'pending') return 'status-submitted';
  return 'status-suspended';
}

export const topupStatuses = [
  'pending',
  'paid',
  'expired',
  'canceled',
] as const;

export const topupOrdersPageSize = 50;

// The tenant reads its own invoice through the path the gateway hands back;
// an administrator looking at somebody else's order needs the admin route,
// because the tenant one only answers the tenant's own session.
export function adminInvoicePath(topupID: string): string {
  return `/v1/admin/billing/topups/${encodeURIComponent(topupID)}/invoice.pdf`;
}
