// G2 is a versioned, bounded scene grammar. Do not change G1's recipe or shaders.
export const FAMILIES = ['cliffs', 'halo', 'pillars', 'veil'] as const;
export type Family = (typeof FAMILIES)[number];
export type Vec3 = readonly [number, number, number];
export type Recipe = {
  readonly version: 'g2';
  readonly seed: number;
  readonly family: Family;
  readonly mode: number;
  readonly center: Vec3;
  readonly scale: Vec3;
  readonly detail: Vec3;
  readonly roll: number;
  readonly thickness: number;
  readonly density: number;
  readonly curl: number;
  readonly roughness: number;
  readonly secondary: readonly [number, number, number, number];
  readonly light: Vec3;
  readonly palette: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly paletteName: string;
  readonly exposure: number;
  readonly bloom: number;
  readonly period: number;
  readonly travel: Vec3;
  readonly starSeed: number;
};

export function stream(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseSeed(value: string | null | undefined) {
  return value && /^g2-[0-9a-f]{8}$/i.test(value)
    ? Number.parseInt(value.slice(3), 16)
    : undefined;
}
export function seedToken(seed: number) {
  return `g2-${(seed >>> 0).toString(16).padStart(8, '0')}`;
}
export function familyFrom(value: string | null | undefined) {
  return FAMILIES.find((family) => family === value);
}

// OKLCH -> linear sRGB. Reduce chroma at fixed lightness/hue, not RGB clipping.
// This is a bounded chroma-search, not the full CSS local-MINDE gamut mapper.
// Matrices: W3C CSS Color 4 / Björn Ottosson's Oklab definition.
export function oklchLinear(lightness: number, chroma: number, hue: number): Vec3 {
  const angle = (hue * Math.PI) / 180;
  const convert = (c: number): Vec3 => {
    const a = c * Math.cos(angle);
    const b = c * Math.sin(angle);
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  };
  let low = 0;
  let high = chroma;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (convert(mid).every((v) => v >= 0 && v <= 1)) low = mid;
    else high = mid;
  }
  return convert(low).map((v) => Math.max(0, Math.min(1, v))) as unknown as Vec3;
}

// Body / thin rim / filaments / local light. Area and energy have distinct roles.
const HARMONIES = [
  { name: 'sapphire-opal', hues: [270, 192, 329, 78] },
  { name: 'amethyst-copper', hues: [302, 252, 27, 88] },
  { name: 'lagoon-rose', hues: [230, 170, 349, 70] },
  { name: 'indigo-ember', hues: [279, 205, 42, 340] },
  { name: 'violet-pearl', hues: [285, 224, 311, 96] },
] as const;

export function generate(seed: number, forcedFamily?: Family): Recipe {
  const normalized = seed >>> 0;
  const layout = stream(normalized ^ 0x3181a2e7);
  const color = stream(normalized ^ 0x75ce0843);
  const camera = stream(normalized ^ 0xf9b3d42d);
  const family = forcedFamily ?? FAMILIES[Math.floor(layout() * FAMILIES.length)];
  const mode = FAMILIES.indexOf(family);
  const signed = () => layout() * 2 - 1;
  const fullness = signed();
  const complexity = signed();
  const thickness = 1 + fullness * 0.17;
  const harmony = HARMONIES[Math.floor(color() * HARMONIES.length)];
  const hueShift = (color() - 0.5) * 16;
  const palette = harmony.hues.map((h, index) =>
    oklchLinear(
      [0.5, 0.76, 0.67, 0.86][index],
      [0.12, 0.14, 0.21, 0.12][index],
      h + hueShift,
    ),
  ) as unknown as Recipe['palette'];
  const direction = mode % 2 ? -1 : 1;
  const period = 62 + camera() * 10;
  return {
    version: 'g2',
    seed: normalized,
    family,
    mode,
    center: [9.8 + signed() * 1.1, 2.8 + signed() * 0.7, 25],
    scale: [0.95 + layout() * 0.12, 1.02 - fullness * 0.08, 1],
    detail: [signed() * 28, signed() * 28, signed() * 28],
    roll: signed() * 0.10,
    thickness,
    density: (1 - complexity * 0.035) / thickness,
    curl: 0.88 + layout() * 0.24,
    roughness: 1 + complexity * 0.12,
    // One subordinate ribbon (phase, height, depth, energy), never a second hero.
    secondary: [layout() * Math.PI * 2, 1.5 + layout() * 2.5, 15 + layout() * 4, 0.20 + layout() * 0.09],
    light: [5 + layout() * 7, 5.5 + layout() * 2.5, 18 + layout() * 3],
    palette,
    paletteName: harmony.name,
    exposure: 1.9 - fullness * 0.12,
    bloom: 0.13 + color() * 0.06,
    period,
    travel: [direction * (5.4 + camera() * 0.8), 1.2 + camera() * 0.8, 6.5 + camera() * 0.7],
    starSeed: (normalized ^ 0xe7543421) >>> 0,
  };
}

export function cameraAt(time: number, recipe: Recipe) {
  const phase = ((time % recipe.period) / recipe.period) * Math.PI * 2;
  const [x, y, z] = recipe.travel;
  const yaw = Math.sin(phase) * 0.04 * Math.sign(x);
  const pitch = Math.sin(phase * 2) * 0.015;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return {
    origin: new Float32Array([x * Math.sin(phase), y * Math.sin(phase * 2), -12 + z * Math.sin(phase) + 1.8 * (Math.cos(phase) - 1)]),
    rotation: new Float32Array([cy, 0, -sy, sy * sp, cp, cy * sp, sy * cp, -sp, cy * cp]),
  };
}

// Structural guardrails, not an aesthetic score or an unbounded retry loop.
export function validComposition(recipe: Recipe) {
  return (
    recipe.center[0] >= 8.7 && recipe.center[0] <= 10.91 &&
    recipe.center[1] >= 2.1 && recipe.center[1] <= 3.51 &&
    recipe.secondary[2] >= 15 && recipe.secondary[2] <= 19 &&
    recipe.secondary[3] <= 0.30 &&
    Math.abs(recipe.roll) <= 0.101 &&
    Math.abs(recipe.density * recipe.thickness - 1) <= 0.036 &&
    recipe.palette.flat().every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
  );
}

export function frameSize(w: number, h: number, dpr: number, quality = 1) {
  const width = Math.max(1, w), height = Math.max(1, h);
  const q = Math.min(1, Math.max(0.5, quality));
  const ratio = Math.min(Math.max(1, dpr), 1.6, Math.sqrt(2000000 / (width * height))) * q;
  const cw = Math.max(1, Math.floor(width * ratio));
  const ch = Math.max(1, Math.floor(height * ratio));
  // Quality scales the expensive volume budget as well as the stars.
  const volume = Math.min(0.6, Math.sqrt(180000 * q * q / (cw * ch)));
  return { width: cw, height: ch, ratio, cloudWidth: Math.max(1, Math.floor(cw * volume)), cloudHeight: Math.max(1, Math.floor(ch * volume)) };
}

export function starsFor(recipe: Recipe, count = 18000) {
  const random = stream(recipe.starSeed);
  const data = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const group = random();
    const depth = group < 0.015 ? 6 + random() * 17 : 50 + random() * 240;
    const cluster = group > 0.95;
    const x = cluster ? (recipe.light[0] / 32 + (random() + random() - 1) * 0.13) * depth : (random() * 2 - 1) * depth * 1.8;
    const y = cluster ? (recipe.light[1] / 32 + (random() + random() - 1) * 0.12) * depth : (random() * 2 - 1) * depth * 1.3;
    const temperature = random();
    const magnitude = random() ** 7;
    data.set([x, y, depth, 0.7 + temperature * 0.3, 0.83 + temperature * 0.11, 1 - temperature * 0.4, 0.18 + magnitude * 3.2, 2.2 + magnitude * 16], i * 8);
  }
  return data;
}
