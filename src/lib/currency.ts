// Every workspace is billed in exactly one currency, chosen when the account is
// created and fixed after that: the balance, the quoted prices, and the payment
// are all in it, and the gateway resolves each amount before it leaves. So the
// console never converts anything at runtime — it formats what it was handed
// with the currency that came with it. What is left here is the small amount of
// currency knowledge the console genuinely owns: the symbol table, the currency
// a new account should default to, and the rate arithmetic the administrator
// console uses to preview a price it has not saved yet.

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

// `rate` is stated as base minor units per one hundred alternate minor units,
// so an integer carries a two-decimal rate without a float: USD 1.00 =
// CNY 7.00 is 700. A currency priced in itself is the identity rate, 100.
export const baseRate = 100;

// What the signed-out registration screen offers when it cannot ask the gateway
// which currencies a new account may be created in.
export const fallbackBillingCurrencies = ['CNY', 'USD'];

export const basePresentation: CurrencyPresentation = {
  object: 'presentation',
  currency: 'CNY',
  base_currency: 'CNY',
  rate: baseRate,
  currencies: fallbackBillingCurrencies,
};

function code(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim())
    ? value.trim().toUpperCase()
    : '';
}

// `GET /v1/billing/currency` is read for two things only: which currency this
// workspace is billed in, for the rare payload that carries no currency of its
// own, and which currencies a new account may pick. Anything unusable falls
// back to the base currency and the built-in choice list.
export function normalizePresentation(value: unknown): CurrencyPresentation {
  if (!value || typeof value !== 'object') return basePresentation;
  const record = value as Record<string, unknown>;
  const base = code(record.base_currency) || basePresentation.base_currency;
  const currency = code(record.currency) || base;
  const rate = record.rate;
  const choices = Array.isArray(record.currencies)
    ? record.currencies.map(code).filter(Boolean)
    : [];
  return {
    object: 'presentation',
    currency,
    base_currency: base,
    rate:
      typeof rate === 'number' && Number.isFinite(rate) && rate > 0
        ? Math.round(rate)
        : baseRate,
    currencies: choices.length ? choices : fallbackBillingCurrencies,
  };
}

// The region a locale names, if it names one: `zh-CN` and `zh-Hans-CN` are both
// CN, `zh` is nothing at all.
function localeRegion(locale: string): string {
  const parts = locale.trim().replace(/_/g, '-').split('-');
  for (const part of parts.slice(1)) {
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return '';
}

// A new workspace picks its billing currency once and keeps it, so the form is
// defaulted from the browser rather than left blank: mainland China is billed
// in yuan and everybody else in dollars. The first locale that names a region
// decides; a list that names none falls back to the language, because a plain
// `zh` reader is far more likely to be in the mainland than not.
export function defaultBillingCurrency(locales: readonly string[]): string {
  for (const locale of locales) {
    if (typeof locale !== 'string' || !locale.trim()) continue;
    const region = localeRegion(locale);
    if (region) return region === 'CN' ? 'CNY' : 'USD';
  }
  for (const locale of locales) {
    if (typeof locale === 'string' && locale.trim().toLowerCase() === 'zh')
      return 'CNY';
  }
  return 'USD';
}

// What the browser knows about itself, in preference order.
export function browserLocales(): string[] {
  const locales: string[] = [];
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().locale;
    if (resolved) locales.push(resolved);
  } catch {
    // A runtime without a resolvable locale still gets a working form.
  }
  if (typeof navigator !== 'undefined') {
    for (const value of navigator.languages ?? [navigator.language]) {
      if (value) locales.push(value);
    }
  }
  return locales;
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

// `¥7.00 = $1.00` — the sentence around it says the rate is fixed, so the label
// itself only has to be readable.
export function exchangeRateLabel(presentation: {
  currency: string;
  base_currency: string;
  rate: number;
}): string {
  const base = rateAmountLabel(presentation.rate, presentation.base_currency);
  const alternate = rateAmountLabel(baseRate, presentation.currency);
  return `${base} = ${alternate}`;
}

// A price left blank in the alternate currency is not unpriced: the gateway
// converts the base price at the configured rate. The administrator sees that
// number as placeholder text, so the same arithmetic lives here.
export function convertToAlternate(
  baseMinorUnits: number,
  rate: number,
): number {
  if (!Number.isFinite(baseMinorUnits) || !Number.isFinite(rate) || rate <= 0)
    return 0;
  return Math.round((baseMinorUnits * baseRate) / rate);
}

// The administrator types a human rate — 7.00 meaning ¥7.00 = $1.00 — and the
// gateway stores the integer 700, the same two-decimal scaling every other
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
