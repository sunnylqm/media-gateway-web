import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { brandEn, brandZh } from '../i18n/brand';
import { creationPath } from './brand';

describe('mypub.ai brand contract', () => {
  test('keeps the approved lockups exact, without terminal punctuation', () => {
    expect(brandZh['brand.tagline']).toBe('敬此刻');
    expect(brandEn['brand.tagline']).toBe('Here’s to now');
  });

  test('gives the home, sign-in, and creation entry distinct voices', () => {
    for (const messages of [brandEn, brandZh]) {
      const lines = [
        messages['brand.tagline'],
        messages['home.title'],
        messages['auth.storyTitle'],
        messages['entry.title'],
      ];
      expect(new Set(lines).size).toBe(lines.length);
      expect(messages['app.title']).toBe(
        `mypub.ai — ${messages['brand.tagline']}`,
      );
    }
  });

  test('mentions stories once in the home copy', () => {
    for (const messages of [brandEn, brandZh]) {
      const homeCopy = Object.entries(messages)
        .filter(([key]) => key.startsWith('home.'))
        .map(([, value]) => value)
        .join(' ');
      expect(homeCopy.match(/故事|\bstor(?:y|ies)\b/giu) ?? []).toHaveLength(1);
    }
  });

  test('provides matching, nonempty messages in both languages', () => {
    expect(Object.keys(brandZh).sort()).toEqual(Object.keys(brandEn).sort());
    for (const messages of [brandEn, brandZh]) {
      expect(messages['brand.name']).toBe('mypub.ai');
      expect(Object.values(messages).every((value) => value.trim())).toBe(true);
    }
  });

  test('aligns initial HTML metadata with English copy', () => {
    const html = readFileSync(
      new URL('../../index.html', import.meta.url),
      'utf8',
    );
    expect(html).toContain(`<title>${brandEn['app.title']}</title>`);
    for (const attribute of [
      'name="description"',
      'property="og:description"',
    ]) {
      expect(html).toContain(
        `<meta ${attribute} content="${brandEn['app.description']}"`,
      );
    }
    expect(html).toContain(
      `<meta property="og:title" content="${brandEn['app.title']}"`,
    );
  });

  test('keeps creation links tied to the existing feature flag', () => {
    expect(creationPath(false)).toBe('/app/video');
    expect(creationPath(true)).toBe('/app/create');
  });
});
