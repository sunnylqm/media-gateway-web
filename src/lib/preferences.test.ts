import { describe, expect, it } from 'bun:test';
import {
  defaultPreferences,
  playgroundLayoutPatch,
  readPreferences,
} from './preferences';

describe('readPreferences', () => {
  it('reads the layout the account saved', () => {
    expect(
      readPreferences({ ui: { playground_layout: 'input_right' } }),
    ).toEqual({ playgroundLayout: 'input_right' });
  });

  it('falls back to the default for an account that never chose', () => {
    expect(readPreferences(undefined)).toEqual(defaultPreferences);
    expect(readPreferences({})).toEqual(defaultPreferences);
    expect(readPreferences({ ui: {} })).toEqual(defaultPreferences);
  });

  // The gateway stores the document without reading it, so anything can come
  // back: an older console's value, a newer console's, or a hand-edited one.
  it('falls back rather than trusting a value it does not know', () => {
    expect(readPreferences({ ui: { playground_layout: 'sideways' } })).toEqual(
      defaultPreferences,
    );
    expect(readPreferences({ ui: { playground_layout: 7 } })).toEqual(
      defaultPreferences,
    );
    expect(readPreferences({ ui: 'input_right' })).toEqual(defaultPreferences);
    expect(readPreferences('input_right')).toEqual(defaultPreferences);
    expect(readPreferences(null)).toEqual(defaultPreferences);
  });
});

describe('playgroundLayoutPatch', () => {
  // The patch names one key, so a setting saved from another tab — or one this
  // console version does not know about — survives the merge untouched.
  it('names only the setting that changed', () => {
    expect(playgroundLayoutPatch('input_right')).toEqual({
      ui: { playground_layout: 'input_right' },
    });
  });

  it('round-trips through a read', () => {
    expect(readPreferences(playgroundLayoutPatch('input_left'))).toEqual({
      playgroundLayout: 'input_left',
    });
  });
});
