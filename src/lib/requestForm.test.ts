import { describe, expect, it } from 'bun:test';
import {
  acceptAttribute,
  estimateAmount,
  estimateQuantity,
  mediaKind,
  mediaSlots,
  resolveRate,
  slotAccepts,
  unitAmount,
} from './requestForm';

describe('requestForm utilities', () => {
  it('correctly categorizes mime prefixes to media kinds', () => {
    expect(mediaKind('image/png')).toBe('image');
    expect(mediaKind('video/mp4')).toBe('video');
    expect(mediaKind('audio/wav')).toBe('audio');
    expect(mediaKind('application/json')).toBe('file');
    expect(mediaKind()).toBe('file');
  });

  it('correctly determines if slot accepts a mime type', () => {
    const slot = {
      id: 'img1',
      group: 'reference' as const,
      label: 'Image',
      mimePrefix: 'image/',
      multiple: false,
    };
    expect(slotAccepts(slot, 'image/png')).toBe(true);
    expect(slotAccepts(slot, 'image/jpeg')).toBe(true);
    expect(slotAccepts(slot, 'video/mp4')).toBe(false);
  });

  it('generates accept attribute for file inputs', () => {
    const slots = [
      {
        id: '1',
        group: 'frame' as const,
        label: 'Frame',
        mimePrefix: 'image/',
        multiple: false,
      },
      {
        id: '2',
        group: 'reference' as const,
        label: 'Video',
        mimePrefix: 'video/',
        multiple: false,
      },
    ];
    expect(acceptAttribute(slots)).toBe('image/*,video/*');
  });

  it('extracts slots from request form inputs', () => {
    const slots = mediaSlots({
      model: '/model',
      prompt: { pointer: '/prompt' },
      inputs: [
        {
          name: 'first_frame',
          pointer: '/first_frame',
          mime_prefix: 'image/',
        },
        {
          name: 'video_url',
          pointer: '/video_url',
          mime_prefix: 'video/',
        },
      ],
    });
    expect(slots.length).toBe(2);
    expect(slots[0].mimePrefix).toBe('image/');
    expect(slots[0].group).toBe('frame');
    expect(slots[1].mimePrefix).toBe('video/');
    expect(slots[1].group).toBe('reference');
  });
});

describe('quote estimate', () => {
  const imageBilling = {
    mode: 'per_request' as const,
    currency: 'CNY',
    unit_price: 200,
    unit_scale: 1,
    minimum_charge: 0,
    rates: [
      {
        label: 'Low',
        dimensions: { quality: 'low' },
        unit_price: 15,
        unit_scale: 1,
        minimum_charge: 0,
      },
      {
        label: 'High',
        dimensions: { quality: 'high' },
        unit_price: 200,
        unit_scale: 1,
        minimum_charge: 0,
      },
      {
        label: 'High landscape',
        dimensions: { quality: 'high', size: '1536x1024' },
        unit_price: 300,
        unit_scale: 1,
        minimum_charge: 0,
      },
    ],
  };

  it('prices per-image models by tier times the requested count', () => {
    expect(estimateAmount(imageBilling, {})).toBe(200);
    expect(estimateAmount(imageBilling, { quality: 'low' })).toBe(15);
    expect(estimateAmount(imageBilling, { quality: 'low', n: '4' })).toBe(60);
    expect(
      estimateAmount(imageBilling, { quality: 'high', size: '1536x1024' }),
    ).toBe(300);
    expect(
      estimateAmount(imageBilling, {
        quality: 'high',
        size: '1024x1024',
        n: '2',
      }),
    ).toBe(400);
    expect(estimateAmount(imageBilling, { n: '0' })).toBeNull();
    expect(estimateAmount(imageBilling, { n: '1.5' })).toBeNull();
  });

  it('picks the most specific tier and names the fallback', () => {
    expect(
      resolveRate(imageBilling, { quality: 'high', size: '1536x1024' }).label,
    ).toBe('High landscape');
    expect(resolveRate(imageBilling, { quality: 'medium' }).label).toBe(
      'Default',
    );
    expect(unitAmount(resolveRate(imageBilling, { quality: 'low' }))).toBe(15);
  });

  it('keeps per-second video pricing on the requested duration', () => {
    const video = {
      ...imageBilling,
      mode: 'per_output_second' as const,
      unit_price: 99,
      rates: [
        {
          label: '2K',
          dimensions: { resolution: '2K' },
          unit_price: 80,
          unit_scale: 1,
          minimum_charge: 0,
        },
      ],
    };
    expect(estimateAmount(video, { resolution: '2K' })).toBe(400);
    expect(estimateAmount(video, { resolution: '2K', duration: '10' })).toBe(
      800,
    );
    expect(estimateAmount(video, { resolution: '768P' })).toBe(495);
  });

  it('charges nothing for a free model', () => {
    expect(estimateAmount({ ...imageBilling, mode: 'free' }, {})).toBe(0);
    expect(estimateQuantity({ ...imageBilling, mode: 'free' }, {})).toBe(1);
  });
});
