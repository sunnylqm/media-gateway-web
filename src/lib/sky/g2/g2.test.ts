import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cameraAt, FAMILIES, frameSize, generate, oklchLinear, parseSeed, seedToken, starsFor, validComposition } from './recipe';
import { HISTORY, select } from './selection';
import { volumeSource } from './shaders';

describe('G2 jewel skies', () => {
  test('keeps G1 shaders and renderer byte-for-byte intact', () => {
    for (const [name, expected] of [
      ['shaders.ts', 'd46ec2bdebc3327d96971d3cee67ad044ab4ba95'],
      ['renderer.ts', '5c3d687d65d298a7acddac3825ae4e2503fddd0e'],
      ['presets.ts', '6afdda66c7c153a4f85888ab2410f2dd03e27670'],
    ]) {
      const content = readFileSync(new URL(`../${name}`, import.meta.url));
      const sha = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
      expect(sha).toBe(expected);
    }
  });
  test('parses only versioned bounded seeds, with legacy routing', () => {
    expect(parseSeed('g2-00000000')).toBe(0);
    expect(parseSeed('G2-FFFFFFFF')).toBe(4294967295);
    for (const value of ['g1-00000000', 'g2-123', 'g2-0000000x', 'g2-000000000', 'NaN', 'g2-0;void main(){}']) expect(parseSeed(value)).toBeUndefined();
    for (const url of ['?seed=g1-0000002a', '?sky=halo', '?engine=g1', '?sky=veil&seed=g1-f00dcafe']) expect(select(url).version).toBe('g1');
    expect(select('?sky=halo&seed=g2-0000002a').version).toBe('g2');
  });
  test('enforces composition and energy bounds across 4096 recipes', () => {
    const paletteNames = new Set<string>();
    for (const family of FAMILIES) for (let i = 0; i < 1024; i++) {
      const recipe = generate(Math.imul(i + 1, 2654435761), family);
      expect(validComposition(recipe)).toBe(true);
      expect(recipe.period).toBeGreaterThanOrEqual(62);
      expect(recipe.period).toBeLessThanOrEqual(72);
      expect(recipe.bloom).toBeLessThanOrEqual(.20);
      expect(recipe.exposure).toBeLessThanOrEqual(2.021);
      paletteNames.add(recipe.paletteName);
    }
    expect(paletteNames.size).toBe(5);
  });
  test('reproduces seed recipes and star clusters without global random state', () => {
    expect(generate(42, 'halo')).toEqual(generate(42, 'halo'));
    const a = generate(42, 'halo'), b = generate(17, 'halo');
    expect(volumeSource(a)).not.toBe(volumeSource(b));
    expect(starsFor(a, 64)).toEqual(starsFor(a, 64));
    expect(starsFor(a, 64)).not.toEqual(starsFor(b, 64));
    expect(seedToken(42)).toBe('g2-0000002a');
  });
  test('maps OKLCH to bounded linear sRGB and preserves neutral luminance', () => {
    const gray = oklchLinear(.5, 0, 20);
    for (const channel of gray) expect(channel).toBeCloseTo(.125, 6);
    for (let h = 0; h < 360; h += 5) for (const l of [.3, .5, .75, .9]) {
      for (const channel of oklchLinear(l, .35, h)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
  test('keeps camera position and velocity continuous across the loop', () => {
    for (const family of FAMILIES) {
      const r = generate(42, family), at = (t: number) => Array.from(cameraAt(t, r).origin);
      const start = at(0), end = at(r.period), fourth = at(4);
      expect(end).toEqual(start);
      expect(Math.hypot(...fourth.map((v, i) => v - start[i]))).toBeGreaterThan(2);
      for (let i = 0; i < 3; i++) expect((start[i] - at(r.period - .001)[i]) / .001).toBeCloseTo((at(.001)[i] - start[i]) / .001, 2);
    }
  });
  test('caps memory and actually lowers the volume budget on slow devices', () => {
    for (const [w, h] of [[1440, 900], [390, 844], [7680, 4320], [320, 280]]) {
      const high = frameSize(w, h, 3), low = frameSize(w, h, 3, .5);
      expect(high.width * high.height).toBeLessThanOrEqual(2000000);
      expect(high.cloudWidth * high.cloudHeight).toBeLessThanOrEqual(180000);
      expect(low.cloudWidth * low.cloudHeight).toBeLessThan(high.cloudWidth * high.cloudHeight);
    }
  });
  test('fresh loads avoid consecutive repeats and forced links ignore storage', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const first = select('', storage, () => 42), second = select('', storage, () => 42);
    expect(first.version).toBe('g2'); expect(second.version).toBe('g2');
    if (first.version !== 'g2' || second.version !== 'g2') throw new Error('Expected G2');
    expect(second.recipe.seed).not.toBe(first.recipe.seed);
    expect(second.recipe.family).not.toBe(first.recipe.family);
    expect(data.get(HISTORY)).toContain('g2-');
    const blocked = () => { throw new Error('Storage disabled'); };
    expect(select('', { getItem: blocked, setItem: blocked }, () => 42).version).toBe('g2');
    expect(select('?seed=g2-0000002a', { getItem: blocked, setItem: blocked }, blocked)).toEqual(select('?seed=g2-0000002a'));
  });
});
