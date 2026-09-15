// Four art-directed grammars, not four finished background images.
export const SKY_PRESETS = [
  { id: 'cliffs', shader: 0, period: 64, travel: [4.8, 0.9, 6.5] },
  { id: 'halo', shader: 1, period: 58, travel: [-5.8, 1.5, 7.2] },
  { id: 'pillars', shader: 2, period: 70, travel: [6.4, 2.2, 5.8] },
  { id: 'veil', shader: 3, period: 60, travel: [-6.2, -1.3, 7.8] },
] as const;

type Vec3 = readonly [number, number, number];
export type SkyPreset = {
  readonly id: (typeof SKY_PRESETS)[number]['id'];
  readonly shader: number;
  readonly period: number;
  readonly travel: Vec3;
};
export type SkyRecipe = {
  readonly version: 'g1';
  readonly seed: number | null;
  readonly preset: SkyPreset;
  readonly offset: Vec3;
  readonly scale: Vec3;
  readonly roll: number;
  readonly detail: Vec3;
  readonly roughness: number;
  readonly thickness: number;
  readonly density: number;
  readonly curl: number;
  readonly exposure: number;
  readonly rimGain: number;
  readonly dustA: Vec3;
  readonly dustB: Vec3;
  readonly rimA: Vec3;
  readonly rimB: Vec3;
  readonly starSeed: number;
};
export const SKY_HISTORY_KEY = 'mypub_previous_sky_v1';
export const SKY_SEED_HISTORY_KEY = 'mypub_previous_sky_seed_g1';

export function findSkyPreset(id: string | null | undefined) {
  return SKY_PRESETS.find((preset) => preset.id === id);
}

// Versioned, bounded input. Never splice URL text into a shader.
export function parseSkySeed(value: string | null | undefined) {
  return value && /^g1-[0-9a-f]{8}$/i.test(value)
    ? Number.parseInt(value.slice(3), 16)
    : undefined;
}

export function skySeedToken(seed: number) {
  return `g1-${(seed >>> 0).toString(16).padStart(8, '0')}`;
}

function randomStream(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Equal-width grammar buckets; storage only avoids consecutive family repeats.
export function pickSkyPreset(sample: number, previous?: string | null) {
  const choices = SKY_PRESETS.filter((preset) => preset.id !== previous);
  const value = Number.isFinite(sample)
    ? Math.max(0, Math.min(1 - Number.EPSILON, sample))
    : 0;
  return choices[Math.floor(value * choices.length)];
}

type SkyStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function resolveSkyPreset(
  search: string,
  storage?: SkyStorage,
  random: () => number = Math.random,
): SkyPreset {
  const params = new URLSearchParams(search);
  const requested = findSkyPreset(params.get('sky'));
  if (requested) return requested;
  const seed = parseSkySeed(params.get('seed'));
  if (seed !== undefined) return pickSkyPreset(randomStream(seed)());
  let previous: string | null = null;
  try {
    previous = storage?.getItem(SKY_HISTORY_KEY) ?? null;
  } catch {
    // Blocked storage cannot prevent the homepage from opening.
  }
  const preset = pickSkyPreset(random(), previous);
  try {
    storage?.setItem(SKY_HISTORY_KEY, preset.id);
  } catch {
    // Only non-repetition across reloads is lost.
  }
  return preset;
}

// Each row is a coherent pair of shadow/rim colors in linear-light RGB.
// Variation travels between two curated palettes, never independent RGB noise.
const PALETTES: readonly (readonly Vec3[])[] = [
  [
    [0.038, 0.11, 0.18],
    [0.35, 0.09, 0.016],
    [0.18, 0.57, 0.84],
    [1.15, 0.55, 0.12],
  ],
  [
    [0.008, 0.13, 0.24],
    [0.2, 0.04, 0.13],
    [0.1, 0.72, 1.1],
    [0.8, 0.38, 0.62],
  ],
  [
    [0.16, 0.024, 0.055],
    [0.075, 0.02, 0.18],
    [1, 0.3, 0.16],
    [0.65, 0.39, 1.1],
  ],
  [
    [0.015, 0.08, 0.19],
    [0.09, 0.18, 0.23],
    [0.22, 0.42, 1.0],
    [0.42, 0.95, 0.98],
  ],
];
const ALTERNATES: readonly (readonly Vec3[])[] = [
  [
    [0.04, 0.065, 0.18],
    [0.3, 0.15, 0.028],
    [0.3, 0.43, 0.85],
    [1.08, 0.72, 0.3],
  ],
  [
    [0.016, 0.08, 0.24],
    [0.14, 0.045, 0.19],
    [0.27, 0.57, 1.04],
    [0.69, 0.42, 0.91],
  ],
  [
    [0.16, 0.045, 0.042],
    [0.04, 0.045, 0.19],
    [1.03, 0.48, 0.24],
    [0.41, 0.51, 1.08],
  ],
  [
    [0.027, 0.08, 0.18],
    [0.12, 0.15, 0.21],
    [0.4, 0.58, 0.97],
    [0.68, 0.86, 1.02],
  ],
];

// Exact neutral settings preserve the four already-approved review URLs.
export function canonicalSky(preset: SkyPreset): SkyRecipe {
  const colors = PALETTES[preset.shader];
  return {
    version: 'g1',
    seed: null,
    preset,
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    roll: 0,
    detail: [0, 0, 0],
    roughness: 1,
    thickness: 1,
    density: 1,
    curl: 1,
    exposure: 1.75,
    rimGain: 2.6,
    dustA: colors[0],
    dustB: colors[1],
    rimA: colors[2],
    rimB: colors[3],
    starSeed: 20260915,
  };
}

export function generateSky(seed: number, preset: SkyPreset): SkyRecipe {
  const normalized = seed >>> 0;
  const random = randomStream(
    normalized ^ Math.imul(preset.shader + 1, 0x45d9f3b),
  );
  const signed = () => random() * 2 - 1;
  const fullness = signed();
  const spread = signed();
  const depth = signed();
  const complexity = signed();
  const pace = 0.96 + random() * 0.1;
  const thickness = 1 + fullness * 0.14;
  const temperature = random();
  const colors = PALETTES[preset.shader].map((a, index): Vec3 => {
    const b = ALTERNATES[preset.shader][index];
    return [
      a[0] + (b[0] - a[0]) * temperature,
      a[1] + (b[1] - a[1]) * temperature,
      a[2] + (b[2] - a[2]) * temperature,
    ];
  });
  return {
    version: 'g1',
    seed: normalized,
    preset: {
      ...preset,
      period: preset.period * pace,
      // Camera reach follows scene scale; speed remains close to the originals.
      travel: [
        preset.travel[0] * (1 - spread * 0.06) * pace,
        preset.travel[1] * (1 + fullness * 0.06),
        preset.travel[2] * (1 - depth * 0.04),
      ],
    },
    // Transform about the right-side focal region, not about the camera.
    offset: [signed() * 1.25, signed() * 0.8, signed() * 0.6],
    scale: [1 + spread * 0.1, 1 - fullness * 0.08, 1 + depth * 0.045],
    roll: signed() * 0.075,
    detail: [signed() * 24, signed() * 24, signed() * 24],
    roughness: 1 + complexity * 0.1,
    thickness,
    // More material does not also become arbitrarily brighter and opaque.
    density: (1 - complexity * 0.025) / thickness,
    curl: 1 + spread * 0.09,
    exposure: 1.75 * (1 - fullness * 0.055),
    rimGain: 2.6 * (1 - complexity * 0.075),
    dustA: colors[0],
    dustB: colors[1],
    rimA: colors[2],
    rimB: colors[3],
    starSeed: (normalized ^ 0xa53c9e71) >>> 0,
  };
}

function freshSeed() {
  try {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }
}

export function resolveSkyRecipe(
  search: string,
  preset: SkyPreset,
  storage?: SkyStorage,
  entropy: () => number = freshSeed,
): SkyRecipe {
  const params = new URLSearchParams(search);
  const seed = parseSkySeed(params.get('seed'));
  if (seed !== undefined) return generateSky(seed, preset);
  if (findSkyPreset(params.get('sky'))) return canonicalSky(preset);
  let generated = entropy() >>> 0;
  try {
    const previous = parseSkySeed(storage?.getItem(SKY_SEED_HISTORY_KEY));
    if (previous === generated) generated = (generated + 1) >>> 0;
    storage?.setItem(SKY_SEED_HISTORY_KEY, skySeedToken(generated));
  } catch {
    // A seed is appearance, not identity. No storage is needed to render it.
  }
  return generateSky(generated, preset);
}

let selected: SkyRecipe | undefined;

// One immutable-by-convention recipe per document, including SPA remounts.
export function getSkyRecipe(): SkyRecipe {
  if (typeof window === 'undefined') return canonicalSky(SKY_PRESETS[0]);
  if (selected) return selected;
  let storage: SkyStorage | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    // Accessing the property itself can throw.
  }
  const search = window.location.search;
  selected = resolveSkyRecipe(
    search,
    resolveSkyPreset(search, storage),
    storage,
  );
  return selected;
}

export function getSkyPreset(): SkyPreset {
  return getSkyRecipe().preset;
}
