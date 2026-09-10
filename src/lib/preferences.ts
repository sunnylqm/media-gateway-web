// Settings an account keeps for itself. The gateway stores the document
// without reading inside it, so the shape lives here: the console owns the
// keys and adds an option without the server changing. Every read is
// defensive — an older console, a newer console, or a hand-edited document
// falls back to the default rather than rendering something broken.

export type PlaygroundLayout = 'input_left' | 'input_right';

export type Preferences = {
  // Which side of the playground the controls sit on. The preview takes the
  // other side. It covers both the image and the video page: this is a habit
  // about where someone's hands go, not a per-page choice.
  playgroundLayout: PlaygroundLayout;
};

export const defaultPreferences: Preferences = {
  playgroundLayout: 'input_left',
};

// The document as it travels: namespaced, so a later setting that is not about
// the interface has an obvious place to go that is not the top level.
export type PreferencesDocument = {
  ui?: {
    playground_layout?: string;
  } & Record<string, unknown>;
} & Record<string, unknown>;

const layouts: PlaygroundLayout[] = ['input_left', 'input_right'];

export function readPreferences(document: unknown): Preferences {
  const ui = section(document, 'ui');
  const layout = ui?.playground_layout;
  return {
    playgroundLayout: layouts.includes(layout as PlaygroundLayout)
      ? (layout as PlaygroundLayout)
      : defaultPreferences.playgroundLayout,
  };
}

// The patch names only what changed. The gateway merges it (RFC 7386), so a
// second tab saving a different setting does not erase this one, and a setting
// this console version does not know about survives untouched.
export function playgroundLayoutPatch(
  layout: PlaygroundLayout,
): PreferencesDocument {
  return { ui: { playground_layout: layout } };
}

function section(
  document: unknown,
  name: string,
): Record<string, string> | null {
  if (!document || typeof document !== 'object') return null;
  const value = (document as Record<string, unknown>)[name];
  if (!value || typeof value !== 'object') return null;
  const entries: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') entries[key] = item;
  }
  return entries;
}

const storageKey = 'media_gateway_preferences';

// The server is the authority; this mirror only spares the first paint. The
// profile arrives one request after the page renders, and repainting the
// layout at that point is exactly the flash the setting is meant to avoid.
export function readMirroredPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultPreferences;
    return readPreferences(JSON.parse(raw));
  } catch {
    // A browser with storage disabled still gets the defaults.
    return defaultPreferences;
  }
}

export function writeMirroredPreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(playgroundLayoutPatch(preferences.playgroundLayout)),
    );
  } catch {
    // The choice still holds for this page, and the server still has it.
  }
}
