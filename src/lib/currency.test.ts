import { describe, expect, it } from 'bun:test';
import {
  basePresentation,
  currencySymbol,
  exchangeRateLabel,
  formatExchangeRate,
  isConverted,
  normalizePresentation,
  parseExchangeRate,
  toBase,
  toDisplay,
} from './currency';

const usd = normalizePresentation({
  object: 'presentation',
  country: 'US',
  currency: 'USD',
  base_currency: 'CNY',
  rate: 715,
});

describe('currency presentation', () => {
  it('keeps a well formed presentation', () => {
    expect(usd).toEqual({
      object: 'presentation',
      country: 'US',
      currency: 'USD',
      base_currency: 'CNY',
      rate: 715,
    });
    expect(isConverted(usd)).toBe(true);
  });

  it('falls back to the base currency for unusable payloads', () => {
    expect(normalizePresentation(null)).toEqual(basePresentation);
    expect(normalizePresentation('nope')).toEqual(basePresentation);
    expect(
      normalizePresentation({ currency: 'USD', base_currency: 'CNY', rate: 0 })
        .currency,
    ).toBe('CNY');
    expect(
      normalizePresentation({ currency: 'US', base_currency: 'CNY', rate: 715 })
        .currency,
    ).toBe('CNY');
  });

  it('treats a base-currency viewer as unconverted', () => {
    const cny = normalizePresentation({
      country: 'CN',
      currency: 'CNY',
      base_currency: 'CNY',
      rate: 100,
    });
    expect(isConverted(cny)).toBe(false);
    expect(cny.rate).toBe(100);
    expect(toDisplay(1234, cny)).toBe(1234);
    expect(toBase(1234, cny)).toBe(1234);
  });
});

describe('currency conversion', () => {
  it('converts base minor units to display minor units', () => {
    expect(toDisplay(715, usd)).toBe(100);
    expect(toDisplay(14300, usd)).toBe(2000);
    expect(toDisplay(0, usd)).toBe(0);
  });

  it('converts display minor units back to base minor units', () => {
    expect(toBase(100, usd)).toBe(715);
    expect(toBase(2000, usd)).toBe(14300);
  });

  it('rounds half up on both directions', () => {
    // 8 base minor units is 1.118… display minor units.
    expect(toDisplay(8, usd)).toBe(1);
    // 4 base minor units is 0.559… display minor units, which rounds to 1.
    expect(toDisplay(4, usd)).toBe(1);
    // 3 base minor units is 0.419… display minor units, which rounds to 0.
    expect(toDisplay(3, usd)).toBe(0);
    expect(toBase(1, usd)).toBe(7);
    expect(toBase(3, usd)).toBe(21);
  });
});

describe('currency labels', () => {
  it('prints a symbol when one exists and the code otherwise', () => {
    expect(currencySymbol('usd')).toBe('$');
    expect(currencySymbol('CNY')).toBe('¥');
    expect(currencySymbol('AED')).toBe('AED');
  });

  it('states the rate as one display unit', () => {
    expect(exchangeRateLabel(usd)).toBe('¥7.15 = $1.00');
    expect(
      exchangeRateLabel(
        normalizePresentation({
          currency: 'AED',
          base_currency: 'CNY',
          rate: 195,
        }),
      ),
    ).toBe('¥1.95 = 1.00 AED');
  });
});

describe('exchange rate editing', () => {
  it('stores a human rate as base minor units per display unit', () => {
    expect(parseExchangeRate('7.15')).toBe(715);
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
