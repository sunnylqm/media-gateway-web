// The gateway settles everything in one base currency: model prices, the
// balance ledger, and every capture are minor units of that currency. A viewer
// outside the base region is shown — and charged — in a display currency the
// gateway picks from the request's country, converted at a fixed rate it hands
// back with the presentation. The arithmetic lives here so it can be tested
// without a browser, and so the rounding rule is written down exactly once.

import type { CurrencyPresentation } from '../types';

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

// `rate` is stated as base minor units per one hundred display minor units, so
// an integer carries a two-decimal exchange rate without a float: USD 1.00 =
// CNY 7.15 is 715. Display equal to base is the identity rate, 100.
export const baseRate = 100;

export const basePresentation: CurrencyPresentation = {
  object: 'presentation',
  currency: 'CNY',
  base_currency: 'CNY',
  rate: baseRate,
};

function code(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim())
    ? value.trim().toUpperCase()
    : '';
}

// The endpoint never fails hard: anything unusable — a missing field, a zero
// rate, a currency that is not a currency — falls back to the base currency,
// which is always safe because every stored amount already is base minor units.
export function normalizePresentation(value: unknown): CurrencyPresentation {
  if (!value || typeof value !== 'object') return basePresentation;
  const record = value as Record<string, unknown>;
  const base = code(record.base_currency) || basePresentation.base_currency;
  const display = code(record.currency) || base;
  const rate = record.rate;
  const country = typeof record.country === 'string' ? record.country : '';
  if (display === base) {
    return {
      object: 'presentation',
      country,
      currency: base,
      base_currency: base,
      rate: baseRate,
    };
  }
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return {
      object: 'presentation',
      country,
      currency: base,
      base_currency: base,
      rate: baseRate,
    };
  }
  return {
    object: 'presentation',
    country,
    currency: display,
    base_currency: base,
    rate: Math.round(rate),
  };
}

// A presentation only converts when the two currencies differ; the identity
// case is checked everywhere a note or a symbol depends on it.
export function isConverted(presentation: CurrencyPresentation): boolean {
  return (
    presentation.currency !== presentation.base_currency &&
    presentation.rate > 0
  );
}

// Both directions round half up on integer minor units, matching the gateway.
export function toDisplay(
  baseMinorUnits: number,
  presentation: CurrencyPresentation,
): number {
  if (!isConverted(presentation)) return baseMinorUnits;
  return Math.round((baseMinorUnits * baseRate) / presentation.rate);
}

export function toBase(
  displayMinorUnits: number,
  presentation: CurrencyPresentation,
): number {
  if (!isConverted(presentation)) return displayMinorUnits;
  return Math.round((displayMinorUnits * presentation.rate) / baseRate);
}

// Two decimals always, because this label states an exchange rate rather than a
// price: `$1` would read as a rounded rate where `$1.00` reads as the unit.
function rateAmountLabel(minorUnits: number, currency: string): string {
  const symbol = currencySymbol(currency);
  const value = (minorUnits / 100).toFixed(2);
  return symbol === currency.trim().toUpperCase()
    ? `${value} ${symbol}`
    : `${symbol}${value}`;
}

// `¥7.15 = $1.00` — the sentence around it says the rate is fixed, so the label
// itself only has to be readable.
export function exchangeRateLabel(presentation: CurrencyPresentation): string {
  const base = rateAmountLabel(presentation.rate, presentation.base_currency);
  const display = rateAmountLabel(baseRate, presentation.currency);
  return `${base} = ${display}`;
}

// The administrator types a human rate — 7.15 meaning ¥7.15 = $1.00 — and the
// gateway stores the integer 715, the same two-decimal scaling every other
// amount uses.
const ratePattern = /^\d+(\.\d{1,2})?$/;

export function parseExchangeRate(value: string): number | null {
  const text = value.trim();
  if (!ratePattern.test(text)) return null;
  const stored = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(stored) || stored <= 0) return null;
  return stored;
}

export function formatExchangeRate(rate: number): string {
  return (rate / 100).toFixed(2);
}
