import { describe, expect, it } from 'bun:test';
import type { PublicModel } from '../types';
import { defaultModelID } from './modelGuidance';

function model(id: string): PublicModel {
  return {
    id,
    object: 'model',
    display_name: id,
    modality: 'image',
    operations: ['generate'],
    provider: 'openai',
    parameters: {},
    billing: {
      mode: 'per_request',
      currency: 'CNY',
      unit_price: 15,
      unit_scale: 1,
      minimum_charge: 0,
      rates: [],
    },
  };
}

describe('model guidance', () => {
  it('preselects Flare wherever the catalog serves it', () => {
    expect(
      defaultModelID([
        model('gpt-image-2'),
        model('gpt-image-2.5-flare'),
        model('gpt-image-2.5-sunburst'),
      ]),
    ).toBe('gpt-image-2.5-flare');
  });

  it('falls back to the first model, and to nothing on an empty catalog', () => {
    expect(defaultModelID([model('gpt-image-2'), model('other')])).toBe(
      'gpt-image-2',
    );
    expect(defaultModelID([])).toBe('');
  });
});
