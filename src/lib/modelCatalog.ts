import type { ModelBilling } from '../types';
import { fallbackRate, unitAmount } from './requestForm';

// A provider key names a protocol profile, which is not always how people know
// the company behind it: "wan" is Alibaba's model family, "xai" is written
// xAI. Keys an administrator invented for a custom provider show as written.
const vendorNames: Record<string, string> = {
  minimax: 'MiniMax',
  xai: 'xAI',
  openai: 'OpenAI',
  wan: 'Alibaba Cloud',
};

export function vendorName(provider: string): string {
  return vendorNames[provider] ?? provider;
}

export type PriceRange = { min: number; max: number } | null;

// priceRange is the span of one billable unit across a model's tiers, in minor
// units, or null for a free model. The unit follows the billing mode rather
// than the modality: that is what the gateway actually charges by.
export function priceRange(billing: ModelBilling): PriceRange {
  if (billing.mode === 'free') return null;
  const rates = billing.rates ?? [];
  const prices = rates.length
    ? rates.map((rate) =>
        unitAmount({ ...rate, dimensions: rate.dimensions ?? {} }),
      )
    : [unitAmount(fallbackRate(billing))];
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function priceLabel(
  billing: ModelBilling,
  money: (minorUnits: number, currency?: string) => string,
  words: { free: string; perSecond: string; perImage: string },
): string {
  const range = priceRange(billing);
  if (!range) return words.free;
  const unit =
    billing.mode === 'per_output_second' ? words.perSecond : words.perImage;
  const amount =
    range.min === range.max
      ? money(range.min, billing.currency)
      : `${money(range.min, billing.currency)} ~ ${money(range.max, billing.currency)}`;
  return `${amount} / ${unit}`;
}

// Release dates are calendar days, not instants: read and compare them in UTC
// so a reader west of Greenwich does not see the day before.
function releaseTime(releasedOn?: string): number | null {
  if (!releasedOn || !/^\d{4}-\d{2}-\d{2}$/.test(releasedOn)) return null;
  const time = Date.parse(`${releasedOn}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

export function formatReleaseDate(
  releasedOn: string | undefined,
  locale: string | undefined,
): string {
  const time = releaseTime(releasedOn);
  if (time === null) return '';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(time);
}

// A model counts as new for its first month: long enough to be noticed by
// someone who opens the console weekly, short enough that the badge means
// something.
export const newModelDays = 30;

export function isNewModel(
  releasedOn: string | undefined,
  now: number = Date.now(),
): boolean {
  const time = releaseTime(releasedOn);
  if (time === null) return false;
  const age = now - time;
  return age >= 0 && age < newModelDays * 24 * 3600 * 1000;
}

// newestFirst orders models by release date, newest at the top, keeping the
// catalog's own order among models released the same day or with no date,
// which sort last.
export function newestFirst<T extends { released_on?: string }>(
  models: T[],
): T[] {
  return models
    .map((model, index) => ({
      model,
      index,
      time: releaseTime(model.released_on),
    }))
    .sort((left, right) => {
      if (left.time !== right.time) {
        if (left.time === null) return 1;
        if (right.time === null) return -1;
        return right.time - left.time;
      }
      return left.index - right.index;
    })
    .map(({ model }) => model);
}
