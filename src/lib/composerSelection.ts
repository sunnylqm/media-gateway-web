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

  // If the currently selected modality is not allowed for this account,
  // find the first allowed modality from models, or fallback to an allowed modality.
  if (!allowed(selection.modality)) {
    const allowedModel = models.find((item) => allowed(item.modality));
    if (allowedModel) {
      return { modality: allowedModel.modality, model: allowedModel.id };
    }
    const fallbackModality = videoAllowed ? 'video' : 'image';
    const fallbackModel = models.find(
      (item) => item.modality === fallbackModality && allowed(item.modality),
    );
    return {
      modality: fallbackModality,
      model: fallbackModel?.id ?? '',
    };
  }

  // The requested modality is allowed. Keep selection.modality.
  const current = models.find((item) => item.id === selection.model);
  if (current && current.modality === selection.modality) {
    return selection;
  }

  const firstForModality = models.find(
    (item) => item.modality === selection.modality,
  );
  return {
    modality: selection.modality,
    model: firstForModality?.id ?? '',
  };
}
