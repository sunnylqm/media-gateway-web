import { describe, expect, test } from 'bun:test';
import type { RequestForm } from '../types';
import { fieldNoteKeys, parseFieldNotes } from './fieldNotes';

describe('parseFieldNotes', () => {
  test('splits a note into one section per field heading', () => {
    const sections = parseFieldNotes(
      'ignored preamble\n\n## prompt\n\nDescribe the scene.\n- Keep it short.\n\n## duration\r\n4–15 seconds.\n',
    );
    expect([...sections.keys()]).toEqual(['prompt', 'duration']);
    expect(sections.get('prompt')).toBe(
      'Describe the scene.\n- Keep it short.',
    );
    expect(sections.get('duration')).toBe('4–15 seconds.');
  });

  test('keeps deeper headings inside a section and drops empty ones', () => {
    const sections = parseFieldNotes(
      '## seed\n\n### Tip\nReuse it.\n\n## ratio\n',
    );
    expect(sections.get('seed')).toBe('### Tip\nReuse it.');
    expect(sections.has('ratio')).toBe(false);
    expect(parseFieldNotes(undefined).size).toBe(0);
  });
});

describe('fieldNoteKeys', () => {
  test('lists the prompt, each media role, then each parameter', () => {
    const form: RequestForm = {
      method: 'POST',
      path: '/v1/videos/generations',
      model: '/model',
      prompt: { pointer: '/prompt' },
      inputs: [
        {
          pointer: '/reference_images',
          name: 'reference',
          mime_prefix: 'image/',
          array: true,
        },
        { pointer: '/image', name: 'first_frame', mime_prefix: 'image/' },
      ],
      parameters: [
        { name: 'duration', pointer: '/duration', type: 'integer' },
        { name: 'seed', pointer: '/seed', type: 'integer', advanced: true },
      ],
    };
    expect(fieldNoteKeys(form)).toEqual([
      'prompt',
      'first_frame',
      'reference',
      'duration',
      'seed',
    ]);
    expect(fieldNoteKeys(undefined)).toEqual([]);
  });
});
