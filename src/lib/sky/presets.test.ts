import { describe, expect, test } from 'bun:test';
import {
  findSkyPreset,
  pickSkyPreset,
  resolveSkyPreset,
  SKY_HISTORY_KEY,
  SKY_PRESETS,
} from './presets';
import { cameraMatrix, cameraPosition } from './scene';
import { buildGalaxyFragment } from './shaders';

describe('random sky scenes', () => {
  test('offers four allowlisted scenes with equal initial buckets', () => {
    expect(new Set(SKY_PRESETS.map((p) => p.id)).size).toBe(4);
    SKY_PRESETS.forEach((preset, index) => {
      expect(pickSkyPreset((index + 0.5) / 4)).toBe(preset);
      expect(findSkyPreset(preset.id)).toBe(preset);
      expect(buildGalaxyFragment(preset)).toContain(
        `#define SCENE ${preset.shader}\n`,
      );
    });
    expect(findSkyPreset('toString')).toBeUndefined();
  });

  test('excludes the last scene and bounds invalid samples', () => {
    for (const previous of SKY_PRESETS) {
      for (const value of [-1, 0, 0.25, 0.5, 0.75, 1, NaN, Infinity]) {
        const chosen = pickSkyPreset(value, previous.id);
        expect(SKY_PRESETS).toContain(chosen);
        expect(chosen.id).not.toBe(previous.id);
      }
    }
    expect(pickSkyPreset(0, 'obsolete').id).toBe('cliffs');
  });

  test('tab history prevents repeats across page loads', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const first = resolveSkyPreset('', storage, () => 0);
    const second = resolveSkyPreset('', storage, () => 0);
    expect(first.id).toBe('cliffs');
    expect(second.id).toBe('halo');
    expect(values.get(SKY_HISTORY_KEY)).toBe(second.id);
  });

  test('review URLs bypass randomness without modifying tab history', () => {
    const forbidden = () => {
      throw new Error('Forced scenes must not access storage or randomness');
    };
    for (const preset of SKY_PRESETS) {
      expect(
        resolveSkyPreset(
          `?sky=${preset.id}`,
          { getItem: forbidden, setItem: forbidden },
          forbidden,
        ),
      ).toBe(preset);
    }
    expect(resolveSkyPreset('?sky=unknown', undefined, () => 0).id).toBe(
      'cliffs',
    );
  });

  test('blocked storage cannot break scene selection', () => {
    const blocked = () => {
      throw new Error('Storage is disabled');
    };
    expect(
      resolveSkyPreset('', { getItem: blocked, setItem: blocked }, () => 0.6)
        .id,
    ).toBe('pillars');
  });

  test('every scene has visible travel and a continuous loop', () => {
    const positions: string[] = [];
    for (const preset of SKY_PRESETS) {
      const at = (t: number) => Array.from(cameraPosition(t, preset));
      const start = at(0);
      const fourth = at(4);
      expect(Math.hypot(...fourth.map((v, i) => v - start[i]))).toBeGreaterThan(
        2,
      );
      expect(at(preset.period)).toEqual(start);
      const before = at(preset.period - 0.001);
      const after = at(0.001);
      for (let i = 0; i < 3; i++) {
        expect((start[i] - before[i]) / 0.001).toBeCloseTo(
          (after[i] - start[i]) / 0.001,
          2,
        );
      }
      expect(Array.from(cameraMatrix(0, preset))).toEqual(
        Array.from(cameraMatrix(preset.period, preset)),
      );
      positions.push(fourth.join(','));
    }
    expect(new Set(positions).size).toBe(4);
  });
});
