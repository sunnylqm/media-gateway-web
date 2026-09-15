export const SKY_PRESETS = [
  { id: 'cliffs', shader: 0, period: 64, travel: [4.8, 0.9, 6.5] },
  { id: 'halo', shader: 1, period: 58, travel: [-5.8, 1.5, 7.2] },
  { id: 'pillars', shader: 2, period: 70, travel: [6.4, 2.2, 5.8] },
  { id: 'veil', shader: 3, period: 60, travel: [-6.2, -1.3, 7.8] },
] as const;

export type SkyPreset = (typeof SKY_PRESETS)[number];
export const SKY_HISTORY_KEY = 'mypub_previous_sky_v1';

export function findSkyPreset(id: string | null | undefined) {
  return SKY_PRESETS.find((preset) => preset.id === id);
}

// Equal-width buckets. Excluding the previous scene prevents consecutive
// repeats when tab storage is available. A bad sample cannot escape the list.
export function pickSkyPreset(sample: number, previous?: string | null) {
  const choices = SKY_PRESETS.filter((preset) => preset.id !== previous);
  const value = Number.isFinite(sample)
    ? Math.max(0, Math.min(1 - Number.EPSILON, sample))
    : 0;
  return choices[Math.floor(value * choices.length)];
}

type SkyStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Explicit ?sky= links are for sharing/review, not an unvalidated shader input.
// Forced scenes do not alter the visitor's random-history preference.
export function resolveSkyPreset(
  search: string,
  storage?: SkyStorage,
  random: () => number = Math.random,
): SkyPreset {
  const requested = findSkyPreset(new URLSearchParams(search).get('sky'));
  if (requested) return requested;
  let previous: string | null = null;
  try {
    previous = storage?.getItem(SKY_HISTORY_KEY) ?? null;
  } catch {
    // Private/blocked storage must not prevent the homepage from opening.
  }
  const preset = pickSkyPreset(random(), previous);
  try {
    storage?.setItem(SKY_HISTORY_KEY, preset.id);
  } catch {
    // Random selection still works; only non-repetition across reloads is lost.
  }
  return preset;
}

let selected: SkyPreset | undefined;

// One choice per document, shared by shaders, camera, and canvas metadata.
// Locale changes, pause, SPA remounts and context recovery never reroll it.
export function getSkyPreset(): SkyPreset {
  if (typeof window === 'undefined') return SKY_PRESETS[0];
  if (selected) return selected;
  let storage: SkyStorage | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    // Accessing the property itself can throw, before getItem is called.
  }
  selected = resolveSkyPreset(window.location.search, storage);
  return selected;
}
