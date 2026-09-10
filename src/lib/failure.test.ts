import { describe, expect, it } from 'bun:test';
import type { Generation } from '../types';
import { generationFailure } from './failure';

function generation(fields: Partial<Generation>): Generation {
  return {
    id: 'gen_1',
    modality: 'image',
    operation: 'generate',
    model: 'gpt-image-2',
    status: 'failed',
    billing_status: 'released',
    progress: 0,
    created_at: '2026-09-10T08:20:09Z',
    updated_at: '2026-09-10T08:20:09Z',
    ...fields,
  };
}

describe('generationFailure', () => {
  it('reads the code and the message together', () => {
    expect(
      generationFailure(
        generation({ error_code: 'http_404', error_message: 'no such model' }),
      ),
    ).toEqual({ code: 'http_404', message: 'no such model' });
  });

  it('keeps a code that arrived without a message', () => {
    expect(generationFailure(generation({ error_code: 'http_524' }))).toEqual({
      code: 'http_524',
      message: '',
    });
  });

  it('drops a message that only repeats the code', () => {
    expect(
      generationFailure(
        generation({ error_code: 'http_524', error_message: ' http_524 ' }),
      ),
    ).toEqual({ code: 'http_524', message: '' });
  });

  it('reports nothing for a job that did not fail', () => {
    expect(generationFailure(generation({ status: 'completed' }))).toBeNull();
    expect(generationFailure(null)).toBeNull();
  });
});
