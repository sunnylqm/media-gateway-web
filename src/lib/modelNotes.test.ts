import { afterEach, describe, expect, test } from 'bun:test';
import type { AdminModel, PublicModel } from '../types';
import {
  cachedModelNotes,
  coversModels,
  forgetModelNotes,
  localizeModel,
  modelListPath,
  notesFromCatalog,
  rememberModelNotes,
  withNotes,
} from './modelNotes';

const stored = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  },
});

afterEach(() => {
  forgetModelNotes();
  stored.clear();
});

const model = (id: string, notes?: string): PublicModel =>
  ({ id, notes, field_notes: notes && `## prompt\n\n${notes}` }) as PublicModel;

describe('model notes cache', () => {
  test('keeps each language for the session, surviving a reload', () => {
    rememberModelNotes('en', { a: { notes: 'About A' } });
    expect(cachedModelNotes('en')).toEqual({ a: { notes: 'About A' } });
    expect(cachedModelNotes('zh')).toBeUndefined();

    // A reload starts with nothing in memory but the session's storage.
    const copy = new Map(stored);
    forgetModelNotes();
    for (const [key, value] of copy) stored.set(key, value);
    expect(cachedModelNotes('en')).toEqual({ a: { notes: 'About A' } });
  });

  test('ignores a damaged entry rather than failing', () => {
    stored.set('media_gateway_model_notes_en', '{not json');
    expect(cachedModelNotes('en')).toBeUndefined();
  });

  test('counts notes incomplete once a model is added', () => {
    const notes = notesFromCatalog([model('a', 'A')]);
    expect(coversModels(notes, [{ id: 'a' }])).toBe(true);
    expect(coversModels(notes, [{ id: 'a' }, { id: 'b' }])).toBe(false);
    expect(coversModels(undefined, [])).toBe(false);
  });
});

describe('modelListPath', () => {
  test('leaves the notes out only when they are already held', () => {
    expect(modelListPath('en', false)).toBe('/v1/models?lang=en');
    expect(modelListPath('zh', true)).toBe('/v1/models?lang=zh&omit=notes');
  });
});

describe('withNotes', () => {
  test('puts the held notes on each model', () => {
    const [merged] = withNotes([model('a')], {
      a: { notes: 'About A', field_notes: '## prompt\n\nHelp' },
    });
    expect(merged.notes).toBe('About A');
    expect(merged.field_notes).toBe('## prompt\n\nHelp');
    const catalog = [model('a')];
    expect(withNotes(catalog, undefined)).toBe(catalog);
  });
});

describe('localizeModel', () => {
  const admin = {
    ...model('a', '中文说明'),
    translations: { en: { notes: 'English notes' } },
  } as AdminModel;

  test('reads the language out of the translations', () => {
    const english = localizeModel(admin, 'en');
    expect(english.notes).toBe('English notes');
    // No English field help was written, so the source stays.
    expect(english.field_notes).toBe(admin.field_notes);
  });

  test('keeps the source for its own language or a missing translation', () => {
    expect(localizeModel(admin, 'zh')).toBe(admin);
    expect(localizeModel(model('b', '说明'), 'en').notes).toBe('说明');
  });
});
