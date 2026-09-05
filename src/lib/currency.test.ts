import { describe, expect, it } from 'bun:test';
import {
  basePresentation,
  convertToAlternate,
  currencySymbol,
  defaultBillingCurrency,
  exchangeRateLabel,
  fallbackBillingCurrencies,
  formatExchangeRate,
  normalizePresentation,
  parseExchangeRate,
} from './currency';

describe('billing currency presentation', () => {
  it('keeps the workspace currency and the registration choices', () => {
    expect(
      normalizePresentation({
        object: 'presentation',
        currency: 'USD',
        base_currency: 'CNY',
        rate: 700,
        currencies: ['CNY', 'USD'],
      }),
    ).toEqual({
      object: 'presentation',
      currency: 'USD',
      base_currency: 'CNY',
      rate: 700,
      currencies: ['CNY', 'USD'],
    });
  });

  it('falls back to the base currency for unusable payloads', () => {
    expect(normalizePresentation(null)).toEqual(basePresentation);
    expect(normalizePresentation('nope')).toEqual(basePresentation);
    expect(
      normalizePresentation({ currency: 'US', base_currency: 'CNY' }).currency,
    ).toBe('CNY');
    expect(
      normalizePresentation({ currency: 'USD', base_currency: 'CNY' })
        .currencies,
    ).toEqual(fallbackBillingCurrencies);
  });
});

describe('default billing currency', () => {
  it('bills mainland China in yuan and everybody else in dollars', () => {
    expect(defaultBillingCurrency(['zh-CN'])).toBe('CNY');
    expect(defaultBillingCurrency(['zh-Hans-CN'])).toBe('CNY');
    expect(defaultBillingCurrency(['zh_CN'])).toBe('CNY');
    expect(defaultBillingCurrency(['en-US'])).toBe('USD');
    expect(defaultBillingCurrency(['zh-TW'])).toBe('USD');
    expect(defaultBillingCurrency(['de-DE'])).toBe('USD');
  });

  it('lets the first locale that names a region decide', () => {
    expect(defaultBillingCurrency(['en-US', 'zh-CN'])).toBe('USD');
    expect(defaultBillingCurrency(['zh', 'en-US'])).toBe('USD');
  });

  it('reads a region-less list by language', () => {
    expect(defaultBillingCurrency(['zh'])).toBe('CNY');
    expect(defaultBillingCurrency(['en'])).toBe('USD');
    expect(defaultBillingCurrency([])).toBe('USD');
    expect(defaultBillingCurrency([''])).toBe('USD');
  });
});

describe('currency labels', () => {
  it('prints a symbol when one exists and the code otherwise', () => {
    expect(currencySymbol('usd')).toBe('$');
    expect(currencySymbol('CNY')).toBe('¥');
    expect(currencySymbol('AED')).toBe('AED');
  });

  it('states the rate as one alternate unit', () => {
    expect(
      exchangeRateLabel({
        currency: 'USD',
        base_currency: 'CNY',
        rate: 700,
      }),
    ).toBe('¥7.00 = $1.00');
    expect(
      exchangeRateLabel({
        currency: 'AED',
        base_currency: 'CNY',
        rate: 195,
      }),
    ).toBe('¥1.95 = 1.00 AED');
  });
});

describe('alternate price default', () => {
  it('converts a base price at the configured rate, rounding half up', () => {
    expect(convertToAlternate(700, 700)).toBe(100);
    expect(convertToAlternate(14000, 700)).toBe(2000);
    expect(convertToAlternate(0, 700)).toBe(0);
    // 8 base minor units is 1.14… alternate minor units.
    expect(convertToAlternate(8, 700)).toBe(1);
    // 3 base minor units is 0.43… alternate minor units, which rounds to 0.
    expect(convertToAlternate(3, 700)).toBe(0);
  });

  it('has no answer without a rate', () => {
    expect(convertToAlternate(700, 0)).toBe(0);
  });
});

describe('exchange rate editing', () => {
  it('stores a human rate as base minor units per alternate unit', () => {
    expect(parseExchangeRate('7.00')).toBe(700);
    expect(parseExchangeRate(' 7 ')).toBe(700);
    expect(parseExchangeRate('0.5')).toBe(50);
  });

  it('rejects anything that is not a positive two-decimal rate', () => {
    expect(parseExchangeRate('')).toBeNull();
    expect(parseExchangeRate('0')).toBeNull();
    expect(parseExchangeRate('-1')).toBeNull();
    expect(parseExchangeRate('7.153')).toBeNull();
    expect(parseExchangeRate('abc')).toBeNull();
  });

  it('renders a stored rate back into the input', () => {
    expect(formatExchangeRate(715)).toBe('7.15');
    expect(formatExchangeRate(700)).toBe('7.00');
  });
});
