import type { ModelNotes, PublicModel } from '../types';

// A model's notes and field help are written in Chinese, the source language,
// and the gateway serves them in whichever language the console asks for. The
// text only changes when an administrator edits it, so the console keeps what
// it fetched for each language for the rest of the browser session: switching
// language, or reloading the catalog after every generation, sends nothing
// the console already has.

export const noteSourceLanguage = 'zh';

// The languages an administrator may translate the notes into.
export const noteTranslationLanguages = ['en'];

export type NotesByModel = Record<string, ModelNotes>;

const storageKey = (language: string) =>
  `media_gateway_model_notes_${language}`;

const remembered = new Map<string, NotesByModel>();

export function cachedModelNotes(language: string): NotesByModel | undefined {
  const held = remembered.get(language);
  if (held) return held;
  try {
    const stored = globalThis.sessionStorage?.getItem(storageKey(language));
    if (!stored) return undefined;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    remembered.set(language, parsed as NotesByModel);
    return parsed as NotesByModel;
  } catch {
    // Storage disabled or a damaged entry: fetch the notes again.
    return undefined;
  }
}

export function rememberModelNotes(language: string, notes: NotesByModel) {
  remembered.set(language, notes);
  try {
    globalThis.sessionStorage?.setItem(
      storageKey(language),
      JSON.stringify(notes),
    );
  } catch {
    // The notes still hold for this page.
  }
}

// forgetModelNotes drops every language, for an administrator who has just
// changed what the notes say.
export function forgetModelNotes() {
  for (const language of remembered.keys()) {
    try {
      globalThis.sessionStorage?.removeItem(storageKey(language));
    } catch {
      // Nothing stored to remove.
    }
  }
  remembered.clear();
}

// coversModels reports whether the notes held account for every model listed;
// a model added since they were fetched needs them fetched again.
export function coversModels(
  notes: NotesByModel | undefined,
  models: { id: string }[],
): notes is NotesByModel {
  return Boolean(notes) && models.every((model) => notes && model.id in notes);
}

export function notesFromCatalog(models: PublicModel[]): NotesByModel {
  return Object.fromEntries(
    models.map((model) => [
      model.id,
      { notes: model.notes ?? '', field_notes: model.field_notes ?? '' },
    ]),
  );
}

// modelListPath asks for the catalog in the language, leaving the notes out
// when they are already held.
export function modelListPath(language: string, haveNotes: boolean): string {
  const query = new URLSearchParams({ lang: language });
  if (haveNotes) query.set('omit', 'notes');
  return `/v1/models?${query}`;
}

export function withNotes<T extends PublicModel>(
  models: T[],
  notes: NotesByModel | undefined,
): T[] {
  if (!notes) return models;
  return models.map((model) => {
    const held = notes[model.id];
    return held
      ? { ...model, notes: held.notes, field_notes: held.field_notes }
      : model;
  });
}

// localizeModel reads the language out of the translations an administrator's
// view of a model carries, the same way the gateway serves a tenant: each text
// without a translation stays in the source language.
export function localizeModel<T extends PublicModel>(
  model: T,
  language: string,
): T {
  const translation = model.translations?.[language];
  if (language === noteSourceLanguage || !translation) return model;
  return {
    ...model,
    notes: translation.notes || model.notes,
    field_notes: translation.field_notes || model.field_notes,
  };
}
