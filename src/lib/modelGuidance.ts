import type { MessageKey } from '../i18n';
import type { AdminModel, PublicModel } from '../types';

type CatalogModel = PublicModel | AdminModel;

// Models the playground reaches for first, best choice first. The catalog is
// ordered by when each model was added, which is not the order a user wants to
// be offered: GPT Image 2.5 Flare is the fast, inexpensive default even though
// GPT Image 2 was seeded before it.
const preferredModelIDs = ['gpt-image-2.5-flare'];

// Where two models on the same page are a genuine trade-off rather than a
// newer-is-better replacement, the playground explains the choice next to the
// selector instead of leaving the user to guess from the name and the price.
const modelHints: Record<string, MessageKey> = {
  'gpt-image-2.5-flare': 'playground.hintFlare',
  'gpt-image-2.5-sunburst': 'playground.hintSunburst',
};

// defaultModelID picks the model the playground preselects: the first
// preference that the catalog actually serves, otherwise the first model.
export function defaultModelID(models: CatalogModel[]): string {
  for (const preferred of preferredModelIDs) {
    if (models.some((model) => model.id === preferred)) return preferred;
  }
  return models[0]?.id ?? '';
}

// modelHintKey returns the trade-off note for a model, when it has one.
export function modelHintKey(modelID: string): MessageKey | undefined {
  return modelHints[modelID];
}
