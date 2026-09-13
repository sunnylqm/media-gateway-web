import type { AdminModel, PublicModel } from '../types';

type CatalogModel = PublicModel | AdminModel;

// Models the playground reaches for first, best choice first. The catalog is
// ordered by when each model was added, which is not the order a user wants to
// be offered: GPT Image 2.5 Flare is the provider's default for most work even
// though GPT Image 2 was seeded before it.
const preferredModelIDs = ['gpt-image-2.5-flare'];

// defaultModelID picks the model the playground preselects: the first
// preference that the catalog actually serves, otherwise the first model.
export function defaultModelID(models: CatalogModel[]): string {
  for (const preferred of preferredModelIDs) {
    if (models.some((model) => model.id === preferred)) return preferred;
  }
  return models[0]?.id ?? '';
}
