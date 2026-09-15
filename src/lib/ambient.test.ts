import { describe, expect, test } from 'bun:test';
import { brandEn, brandZh } from '../i18n/brand';
import { mediaURL, starField, starLayers } from './ambient';

describe('immersive home', () => {
  test('keeps the sky deterministic and bounded to three static layers', () => {
    expect(starField(17, 4)).toBe(starField(17, 4));
    expect(starField(17, 4)).not.toBe(starField(18, 4));
    expect(starLayers).toHaveLength(3);
    expect(starLayers.join().match(/radial-gradient/g)).toHaveLength(90);
    expect(starLayers.join()).not.toContain('NaN');
    expect(starLayers.join()).not.toContain('url(');
  });

  test('does not request a placeholder video and accepts explicit safe sources', () => {
    for (const value of [
      undefined,
      '',
      '  ',
      'http://example.com/a.mp4',
      '//example.com/a.mp4',
      'javascript:alert(1)',
      'not a URL',
    ]) {
      expect(mediaURL(value)).toBeUndefined();
    }
    expect(mediaURL('/media/home.mp4')).toBe('/media/home.mp4');
    expect(mediaURL(' https://example.com/home.webm ')).toBe(
      'https://example.com/home.webm',
    );
  });

  test('line breaks preserve the approved headline in each language', () => {
    expect(brandZh['home.titleLead'] + brandZh['home.titleEnd']).toBe(
      brandZh['home.title'],
    );
    expect(`${brandEn['home.titleLead']} ${brandEn['home.titleEnd']}`).toBe(
      brandEn['home.title'],
    );
    for (const messages of [brandEn, brandZh]) {
      const labels = [
        messages['home.pauseMotion'],
        messages['home.resumeMotion'],
        messages['home.staticMotion'],
      ];
      expect(new Set(labels).size).toBe(3);
    }
  });
});
