import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  cachedModelNotes,
  coversModels,
  type NotesByModel,
  rememberModelNotes,
} from './modelNotes';

const inFlight = new Map<string, Promise<NotesByModel>>();

// fetchModelNotes loads every model's notes in one language once, however many
// components ask for them at the same moment.
export function fetchModelNotes(language: string): Promise<NotesByModel> {
  const pending = inFlight.get(language);
  if (pending) return pending;
  const request = api<{ data: NotesByModel }>(
    `/v1/model-notes?${new URLSearchParams({ lang: language })}`,
  )
    .then((response) => {
      rememberModelNotes(language, response.data ?? {});
      return response.data ?? {};
    })
    .finally(() => inFlight.delete(language));
  inFlight.set(language, request);
  return request;
}

// useModelNotes returns the notes of the listed models in the language, from
// the session's copy when it has them and fetched once when it does not.
export function useModelNotes(
  language: string,
  models: { id: string }[],
): NotesByModel | undefined {
  const [, setFetched] = useState(0);
  const notes = cachedModelNotes(language);
  const complete = coversModels(notes, models);
  const listed = models.length > 0;
  useEffect(() => {
    if (complete || !listed) return;
    let live = true;
    fetchModelNotes(language).then(
      () => live && setFetched((count) => count + 1),
      // Without the notes a model still works; its picker says it has none.
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language, complete, listed]);
  return notes;
}
