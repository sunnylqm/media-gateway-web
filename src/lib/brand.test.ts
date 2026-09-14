import { describe, expect, test } from 'bun:test';
import { brandEn, brandZh } from '../i18n/brand';
import { creationPath } from './brand';

describe('mypub.ai brand contract', () => {
  test('keeps the two approved Chinese lines in their distinct roles', () => {
    expect(brandZh['brand.tagline']).toBe('好故事，值得更多人品尝。');
    expect(brandZh['home.title']).toBe('把你的故事，酿成短片。');
    expect(brandZh['auth.storyTitle']).toBe(brandZh['home.title']);
  });

  test('provides matching, nonempty messages in both languages', () => {
    expect(Object.keys(brandZh).sort()).toEqual(Object.keys(brandEn).sort());
    for (const messages of [brandEn, brandZh]) {
      expect(messages['brand.name']).toBe('mypub.ai');
      expect(Object.values(messages).every((value) => value.trim())).toBe(true);
    }
  });

  test('does not expose guided planning when its feature flag is off', () => {
    expect(creationPath(false)).toBe('/app/video');
    expect(creationPath(true)).toBe('/app/create');
  });
});
