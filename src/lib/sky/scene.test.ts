import { describe, expect, test } from 'bun:test';
import { brandEn, brandZh } from '../../i18n/brand';
import {
  cameraMatrix,
  createStars,
  renderSize,
  STAR_COUNT,
  STAR_STRIDE,
} from './scene';

describe('photographic sky', () => {
  test('removes the footer encouragement from both locales', () => {
    expect('home.note' in brandEn).toBe(false);
    expect('home.note' in brandZh).toBe(false);
  });

  test('generates a repeatable, finite star field with unit directions', () => {
    const stars = createStars(100);
    expect(stars).toEqual(createStars(100));
    expect(stars.length).toBe(100 * STAR_STRIDE);
    expect(STAR_COUNT).toBe(36000);
    expect(stars.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < stars.length; i += STAR_STRIDE) {
      const radius = Math.hypot(stars[i], stars[i + 1], stars[i + 2]);
      expect(radius).toBeCloseTo(1, 5);
      expect(stars[i + 6]).toBeGreaterThan(0);
      expect(stars[i + 7]).toBeGreaterThan(0);
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

  test('moves the camera continuously without stretching the sky', () => {
    expect(cameraMatrix(0)).not.toEqual(cameraMatrix(5));
    for (const time of [0, 5, 60, 600]) {
      const m = cameraMatrix(time);
      for (let column = 0; column < 3; column++) {
        const axis = m.slice(column * 3, column * 3 + 3);
        expect(Math.hypot(...axis)).toBeCloseTo(1, 5);
      }
      expect(m[0] * m[3] + m[1] * m[4] + m[2] * m[5]).toBeCloseTo(0, 5);
    }
  });
});
