import { describe, expect, it } from 'bun:test';
import {
  acceptAttribute,
  mediaKind,
  mediaSlots,
  slotAccepts,
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
