import { describe, expect, test } from 'bun:test';
import { brandEn, brandZh } from '../../i18n/brand';
import {
  cameraMatrix,
  cameraPosition,
  createNoiseVolume,
  createStars,
  FLIGHT_PERIOD,
  NOISE_SIZE,
  renderSize,
  STAR_COUNT,
  STAR_STRIDE,
} from './scene';

describe('nebula flight', () => {
  test('keeps the removed footer encouragement out of both locales', () => {
    expect('home.note' in brandEn).toBe(false);
    expect('home.note' in brandZh).toBe(false);
  });

  test('generates repeatable stars at genuinely different depths', () => {
    const stars = createStars();
    expect(stars).toEqual(createStars());
    expect(stars.length).toBe(STAR_COUNT * STAR_STRIDE);
    expect(STAR_COUNT).toBe(24000);
    expect(stars.every(Number.isFinite)).toBe(true);
    let near = 0;
    let far = 0;
    for (let i = 0; i < stars.length; i += STAR_STRIDE) {
      expect(stars[i + 2]).toBeGreaterThanOrEqual(6);
      expect(stars[i + 2]).toBeLessThanOrEqual(300);
      if (stars[i + 2] < 24) near++;
      if (stars[i + 2] > 80) far++;
      expect(stars[i + 6]).toBeGreaterThan(0);
      expect(stars[i + 7]).toBeGreaterThan(0);
    }
    expect(near).toBeGreaterThan(100);
    expect(far).toBeGreaterThan(STAR_COUNT * 0.8);
  });

  test('bounds and reproduces the local noise volume', () => {
    const volume = createNoiseVolume();
    expect(volume.length).toBe(NOISE_SIZE ** 3 * 4);
    expect(volume.byteLength).toBe(1048576);
    expect(volume).toEqual(createNoiseVolume());
    expect(new Set(volume.slice(0, 4096)).size).toBeGreaterThan(250);
  });

  test('produces visible dolly motion and stronger near-star parallax', () => {
    const a = cameraPosition(0);
    const b = cameraPosition(4);
    const distance = Math.hypot(...b.map((value, i) => value - a[i]));
    expect(distance).toBeGreaterThan(3);
    const shift = (depth: number) => Math.abs(b[0] / (depth - b[2]));
    expect(shift(8)).toBeGreaterThan(shift(160) * 6);
  });

  test('closes the flight path with continuous position and velocity', () => {
    const epsilon = 0.01;
    expect(cameraPosition(0)).toEqual(cameraPosition(FLIGHT_PERIOD));
    expect(cameraMatrix(0)).toEqual(cameraMatrix(FLIGHT_PERIOD));
    const a = cameraPosition(FLIGHT_PERIOD - epsilon);
    const b = cameraPosition(FLIGHT_PERIOD);
    const c = cameraPosition(FLIGHT_PERIOD + epsilon);
    for (let i = 0; i < 3; i++) {
      expect((b[i] - a[i]) / epsilon).toBeCloseTo(
        (c[i] - b[i]) / epsilon,
        2,
      );
    }
    for (const t of [0, 8, 16, 32, 48, 64, 600]) {
      expect(cameraPosition(t)[2]).toBeLessThan(-5);
    }
  });

  test('caps framebuffer memory on high-DPI and ultrawide displays', () => {
    for (const [w, h, dpr] of [
      [390, 844, 3],
      [7680, 4320, 4],
      [1, 1, 1],
    ]) {
      const size = renderSize(w, h, dpr);
      expect(size.width * size.height).toBeLessThanOrEqual(3000000);
      expect(size.ratio).toBeLessThanOrEqual(1.75);
      expect(size.width).toBeGreaterThanOrEqual(1);
    }
    const full = renderSize(1440, 900, 2);
    const reduced = renderSize(1440, 900, 2, 0.55);
    expect(reduced.width).toBeLessThan(full.width);
  });

  test('rotates without stretching the scene', () => {
    expect(cameraMatrix(0)).not.toEqual(cameraMatrix(5));
    for (const time of [0, 5, 60, 600]) {
      const m = cameraMatrix(time);
      for (let column = 0; column < 3; column++) {
        expect(Math.hypot(...m.slice(column * 3, column * 3 + 3))).toBeCloseTo(
          1,
          5,
        );
      }
      expect(m[0] * m[3] + m[1] * m[4] + m[2] * m[5]).toBeCloseTo(0, 5);
    }
  });
});
