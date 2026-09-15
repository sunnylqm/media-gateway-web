import { describe, expect, test } from 'bun:test';
import {
  canonicalSky,
  generateSky,
  parseSkySeed,
  resolveSkyPreset,
  resolveSkyRecipe,
  SKY_PRESETS,
  SKY_SEED_HISTORY_KEY,
  skySeedToken,
} from './presets';
import { cameraMatrix, cameraPosition, createStars } from './scene';
import { buildGalaxyFragment } from './shaders';

describe('constrained generative skies', () => {
  test('validates versioned 32-bit seeds including zero', () => {
    expect(parseSkySeed('g1-00000000')).toBe(0);
    expect(parseSkySeed('g1-ffffffff')).toBe(4294967295);
    expect(parseSkySeed('G1-ABCDEF00')).toBe(0xabcdef00);
    for (const value of ['', '-1', 'g1-123', 'g2-00000000', 'g1-100000000']) {
      expect(parseSkySeed(value)).toBeUndefined();
    }
    expect(parseSkySeed('g1-00000000;discard;')).toBeUndefined();
    expect(skySeedToken(42)).toBe('g1-0000002a');
  });

  test('reproduces geometry, palette, stars and camera from a seed', () => {
    for (const preset of SKY_PRESETS) {
      const a = generateSky(42, preset);
      expect(a).toEqual(generateSky(42, preset));
      const b = generateSky(43, preset);
      expect(a.detail).not.toEqual(b.detail);
      expect(a.rimA).not.toEqual(b.rimA);
      expect(a.preset.travel).not.toEqual(b.preset.travel);
      expect(createStars(20, a.starSeed)).toEqual(createStars(20, a.starSeed));
      expect(createStars(20, a.starSeed)).not.toEqual(
        createStars(20, b.starSeed),
      );
      expect(buildGalaxyFragment(preset, a)).not.toEqual(
        buildGalaxyFragment(preset, b),
      );
    }
  });

  test('bounds 4096 recipes with coupled constraints', () => {
    for (const preset of SKY_PRESETS) {
      for (let i = 0; i < 1024; i++) {
        const recipe = generateSky(Math.imul(i, 2654435761), preset);
        const finite = JSON.stringify(recipe);
        expect(finite).not.toContain('null');
        expect(recipe.thickness).toBeGreaterThanOrEqual(0.86);
        expect(recipe.thickness).toBeLessThanOrEqual(1.14);
        expect(recipe.density * recipe.thickness).toBeGreaterThanOrEqual(0.975);
        expect(recipe.density * recipe.thickness).toBeLessThanOrEqual(1.025);
        expect(Math.abs(recipe.roll)).toBeLessThanOrEqual(0.075);
        expect(Math.abs(recipe.offset[0])).toBeLessThanOrEqual(1.25);
        expect(Math.abs(recipe.offset[1])).toBeLessThanOrEqual(0.8);
        expect(recipe.exposure).toBeGreaterThanOrEqual(1.65);
        expect(recipe.exposure).toBeLessThanOrEqual(1.85);
        expect(recipe.preset.period).toBeGreaterThan(55);
        expect(recipe.preset.period).toBeLessThan(75);
        for (const rgb of [recipe.rimA, recipe.rimB]) {
          expect(
            rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 1.15),
          ).toBe(true);
        }
        const start = cameraPosition(0, recipe.preset);
        const fourth = cameraPosition(4, recipe.preset);
        expect(
          Math.hypot(...fourth.map((v, j) => v - start[j])),
        ).toBeGreaterThan(2);
        expect(cameraPosition(recipe.preset.period, recipe.preset)).toEqual(
          start,
        );
        expect(cameraMatrix(recipe.preset.period, recipe.preset)).toEqual(
          cameraMatrix(0, recipe.preset),
        );
        // Camera stays in front of the bounded volume across the entire loop.
        expect(-11 + recipe.preset.travel[2]).toBeLessThan(-2);
      }
    }
  });

  test('old review links remain canonical and do not access entropy', () => {
    const forbidden = () => {
      throw new Error('No entropy or history');
    };
    for (const preset of SKY_PRESETS) {
      expect(
        resolveSkyRecipe(`?sky=${preset.id}`, preset, undefined, forbidden),
      ).toEqual(canonicalSky(preset));
      expect(
        resolveSkyRecipe(
          `?sky=${preset.id}&seed=bad`,
          preset,
          undefined,
          forbidden,
        ).seed,
      ).toBeNull();
    }
  });

  test('seed-only links ignore random history', () => {
    const forbidden = () => {
      throw new Error('No entropy or history');
    };
    const storage = { getItem: forbidden, setItem: forbidden };
    const query = '?seed=g1-01234567';
    const preset = resolveSkyPreset(query, storage, forbidden);
    expect(resolveSkyPreset(query, undefined, () => 0.99)).toEqual(preset);
    expect(resolveSkyRecipe(query, preset, storage, forbidden)).toEqual(
      generateSky(0x01234567, preset),
    );
  });

  test('new visits get fresh seeds; blocked storage still works', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const first = resolveSkyRecipe('', SKY_PRESETS[0], storage, () => 42);
    const next = resolveSkyRecipe('', SKY_PRESETS[0], storage, () => 42);
    expect(first.seed).toBe(42);
    expect(next.seed).toBe(43);
    expect(values.get(SKY_SEED_HISTORY_KEY)).toBe(skySeedToken(43));
    const blocked = () => {
      throw new Error('Blocked');
    };
    expect(
      resolveSkyRecipe(
        '',
        SKY_PRESETS[0],
        { getItem: blocked, setItem: blocked },
        () => 0,
      ).seed,
    ).toBe(0);
  });
});
