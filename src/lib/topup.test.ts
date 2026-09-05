import { describe, expect, it } from 'bun:test';
import {
  currencySymbol,
  formatPaymentMethods,
  formatPresetAmounts,
  majorUnitsLabel,
  parseBoundAmount,
  parsePaymentMethods,
  parsePresetAmounts,
  parseTopupAmount,
  stripeWebhookURL,
  topupAmountLabel,
  topupReturnURL,
  validateTopupConfig,
} from './topup';

describe('currency presentation', () => {
  it('maps known currencies to their symbol', () => {
    expect(currencySymbol('CNY')).toBe('¥');
    expect(currencySymbol('usd')).toBe('$');
  });

  it('falls back to the currency code', () => {
    expect(currencySymbol('AED')).toBe('AED');
  });

  it('labels amounts in major units', () => {
    expect(majorUnitsLabel(2000)).toBe('20');
    expect(majorUnitsLabel(2050)).toBe('20.50');
    expect(topupAmountLabel(2000, 'CNY')).toBe('¥20');
    expect(topupAmountLabel(199, 'USD')).toBe('$1.99');
    expect(topupAmountLabel(2000, 'AED')).toBe('20 AED');
  });
});

describe('parseTopupAmount', () => {
  const bounds = { min: 100, max: 1_000_000 };

  it('accepts whole and two-decimal major units', () => {
    expect(parseTopupAmount('20', bounds)).toEqual({ ok: true, amount: 2000 });
    expect(parseTopupAmount(' 20.05 ', bounds)).toEqual({
      ok: true,
      amount: 2005,
    });
  });

  it('rejects values that are not a positive amount', () => {
    for (const value of ['', 'abc', '-5', '0', '1.234', '1e3', '1,5']) {
      expect(parseTopupAmount(value, bounds).ok).toBe(false);
    }
  });

  it('reports which bound was missed', () => {
    expect(parseTopupAmount('0.50', bounds)).toEqual({
      ok: false,
      reason: 'below_min',
    });
    expect(parseTopupAmount('20000', bounds)).toEqual({
      ok: false,
      reason: 'above_max',
    });
  });

  it('ignores a bound that is not set', () => {
    expect(parseTopupAmount('99999', { min: 0, max: 0 })).toEqual({
      ok: true,
      amount: 9_999_900,
    });
  });
});

describe('parsePresetAmounts', () => {
  it('sorts, dedupes, and converts to minor units', () => {
    expect(parsePresetAmounts('100, 20,50, 20')).toEqual({
      ok: true,
      amounts: [2000, 5000, 10000],
    });
    expect(parsePresetAmounts('20 50\n100')).toEqual({
      ok: true,
      amounts: [2000, 5000, 10000],
    });
  });

  it('rejects an empty or invalid list', () => {
    expect(parsePresetAmounts('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parsePresetAmounts('20, -5')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(parsePresetAmounts('20, 0')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rejects more than twenty presets', () => {
    const many = Array.from({ length: 21 }, (_, index) => index + 1).join(',');
    expect(parsePresetAmounts(many)).toEqual({ ok: false, reason: 'too_many' });
  });

  it('round-trips through the editable text', () => {
    expect(formatPresetAmounts([2000, 5000, 10050])).toBe('20, 50, 100.50');
  });
});

describe('validateTopupConfig', () => {
  it('accepts a consistent configuration', () => {
    expect(
      validateTopupConfig({
        amounts: [2000, 5000],
        minAmount: 100,
        maxAmount: 10000,
      }),
    ).toBeNull();
  });

  it('rejects a non-positive minimum', () => {
    expect(
      validateTopupConfig({ amounts: [], minAmount: 0, maxAmount: 100 }),
    ).toBe('min');
  });

  it('rejects an inverted range', () => {
    expect(
      validateTopupConfig({ amounts: [], minAmount: 500, maxAmount: 100 }),
    ).toBe('range');
  });

  it('rejects a preset outside the range', () => {
    expect(
      validateTopupConfig({
        amounts: [50, 5000],
        minAmount: 100,
        maxAmount: 10000,
      }),
    ).toBe('outside');
  });
});

describe('bounds and urls', () => {
  it('parses a bound in major units', () => {
    expect(parseBoundAmount('1')).toBe(100);
    expect(parseBoundAmount('0')).toBeNull();
  });

  it('builds a return url without a query string', () => {
    expect(
      topupReturnURL({
        origin: 'https://console.example.com',
        pathname: '/app/billing',
      }),
    ).toBe('https://console.example.com/app/billing');
  });

  it('builds the stripe webhook url', () => {
    expect(stripeWebhookURL('https://sg.cresc.dev/')).toBe(
      'https://sg.cresc.dev/v1/billing/stripe/webhook',
    );
  });
});

describe('payment methods', () => {
  it('reads a comma separated list of Stripe identifiers', () => {
    expect(parsePaymentMethods('card, link')).toEqual(['card', 'link']);
    expect(parsePaymentMethods('Card WeChat_Pay,alipay')).toEqual([
      'card',
      'wechat_pay',
      'alipay',
    ]);
  });

  it('treats an empty list as no restriction rather than an error', () => {
    expect(parsePaymentMethods('')).toEqual([]);
    expect(parsePaymentMethods('  ,, ')).toEqual([]);
  });

  it('collapses duplicates and renders the list back', () => {
    expect(parsePaymentMethods('card, card')).toEqual(['card']);
    expect(formatPaymentMethods(['card', 'link'])).toBe('card, link');
    expect(formatPaymentMethods(undefined)).toBe('');
  });
});
