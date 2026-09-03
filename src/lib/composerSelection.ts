import type { PublicModel } from '../types';

export type ComposerSelection = {
  modality: PublicModel['modality'];
  model: string;
};

export function modalityAllowed(
  modality: PublicModel['modality'],
  imageAllowed: boolean,
  videoAllowed: boolean,
): boolean {
  return modality === 'image' ? imageAllowed : videoAllowed;
}

export function selectComposerModel(
  models: Array<Pick<PublicModel, 'id' | 'modality'>>,
  selection: ComposerSelection,
  imageAllowed: boolean,
  videoAllowed: boolean,
): ComposerSelection {
  const allowed = (modality: PublicModel['modality']) =>
    modalityAllowed(modality, imageAllowed, videoAllowed);
  const current = models.find((item) => item.id === selection.model);
  if (
    current &&
    current.modality === selection.modality &&
    allowed(current.modality)
  ) {
    return selection;
  }

  const fallback =
    (allowed(selection.modality)
      ? models.find((item) => item.modality === selection.modality)
      : undefined) ?? models.find((item) => allowed(item.modality));

  return fallback
    ? { modality: fallback.modality, model: fallback.id }
    : { modality: selection.modality, model: '' };
}
