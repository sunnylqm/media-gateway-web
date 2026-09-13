import { describe, expect, it } from 'bun:test';
import type { ModelBilling } from '../types';
import {
  formatReleaseDate,
  isNewModel,
  newestFirst,
  priceLabel,
  providerLabel,
} from './modelCatalog';

const words = { free: 'Free', perSecond: 'second', perImage: 'image' };
const money = (minor: number, currency?: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;
const flat = {
  label: 'Standard',
  dimensions: {},
  unit_price: 15,
  unit_scale: 1,
  minimum_charge: 0,
};
const billing = (patch: Partial<ModelBilling>): ModelBilling => ({
  mode: 'per_request',
  currency: 'CNY',
  rates: [flat],
  ...patch,
});

describe('model catalog presentation', () => {
  it('shows the provider name the administrator gave, else the key', () => {
    expect(
      providerLabel({ provider: 'wan', provider_name: 'Alibaba Cloud' }),
    ).toBe('Alibaba Cloud');
    expect(providerLabel({ provider: 'wan', provider_name: '  ' })).toBe('wan');
    expect(providerLabel({ provider: 'acme' })).toBe('acme');
  });

  it('labels a price by what the model is billed on', () => {
    expect(priceLabel(billing({ mode: 'free' }), money, words)).toBe('Free');
    expect(priceLabel(billing({}), money, words)).toBe('CNY 0.15 / image');
    expect(priceLabel(billing({ rates: [] }), money, words)).toBe('—');
    expect(
      priceLabel(
        billing({
          mode: 'per_output_second',
          rates: [
            {
              label: '720P',
              dimensions: { resolution: '720P' },
              unit_price: 50,
              unit_scale: 1,
              minimum_charge: 0,
            },
            {
              label: '1080P',
              dimensions: { resolution: '1080P' },
              unit_price: 80,
              unit_scale: 1,
              minimum_charge: 0,
            },
          ],
        }),
        money,
        words,
      ),
    ).toBe('CNY 0.50 ~ CNY 0.80 / second');
  });

  it('reads a release date as a calendar day', () => {
    expect(formatReleaseDate('2026-09-08', 'en-US')).toBe('Sep 8, 2026');
    expect(formatReleaseDate('', 'en-US')).toBe('');
    expect(formatReleaseDate('Sept 8', 'en-US')).toBe('');
  });

  it('marks a model new for its first month only', () => {
    const now = Date.parse('2026-09-13T12:00:00Z');
    expect(isNewModel('2026-09-08', now)).toBe(true);
    expect(isNewModel('2026-08-01', now)).toBe(false);
    expect(isNewModel('2026-10-01', now)).toBe(false);
    expect(isNewModel(undefined, now)).toBe(false);
  });

  it('puts the newest models first and undated ones last', () => {
    expect(
      newestFirst([
        { id: 'a', released_on: '2026-04-21' },
        { id: 'b' },
        { id: 'c', released_on: '2026-09-08' },
        { id: 'd', released_on: '2026-09-08' },
      ]).map((model) => model.id),
    ).toEqual(['c', 'd', 'a', 'b']);
  });
});
