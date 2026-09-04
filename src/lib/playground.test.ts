import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PriceTable } from '../components/PriceTable';
import { LocaleProvider } from '../i18n';
import type { PublicModel } from '../types';
import {
  buildRequestBody,
  defaultParameterValue,
  estimateAmount,
  mediaSlots,
} from './requestForm';

describe('Playground model & request form utilities', () => {
  const sampleImageModel: PublicModel = {
    id: 'flux-schnell',
    object: 'model',
    display_name: 'FLUX.1 Schnell',
    modality: 'image',
    operations: ['text-to-image', 'image-to-image'],
    provider: 'bfl',
    parameters: {},
    billing: {
      mode: 'per_request',
      currency: 'USD',
      unit_price: 3000,
      unit_scale: 1,
      minimum_charge: 3000,
      rates: [],
    },
    request_form: {
      method: 'POST',
      path: '/v1/images/generations',
      model: '/model',
      prompt: { pointer: '/prompt', max_runes: 2000 },
      parameters: [
        {
          name: 'aspect_ratio',
          pointer: '/aspect_ratio',
          type: 'string',
          default: '16:9',
          enum: ['1:1', '16:9', '9:16', '4:3'],
        },
        {
          name: 'resolution',
          pointer: '/resolution',
          type: 'string',
          default: '2K',
          enum: ['1K', '2K', '4K'],
        },
        {
          name: 'quality',
          pointer: '/quality',
          type: 'string',
          default: 'Standard',
          enum: ['Low', 'Standard', 'HD'],
        },
      ],
      inputs: [
        {
          pointer: '/image_reference',
          name: 'image_reference',
          mime_prefix: 'image/',
          array: true,
        },
      ],
    },
  };

  const sampleVideoModel: PublicModel = {
    id: 'minimax-video-01',
    object: 'model',
    display_name: 'Hailuo MiniMax Video 01',
    modality: 'video',
    operations: ['text-to-video', 'image-to-video'],
    provider: 'minimax',
    parameters: {},
    billing: {
      mode: 'per_output_second',
      currency: 'CNY',
      unit_price: 300000,
      unit_scale: 1,
      minimum_charge: 1500000,
      rates: [],
    },
    request_form: {
      method: 'POST',
      path: '/v1/video/generations',
      model: '/model',
      prompt: { pointer: '/prompt', max_runes: 2000 },
      parameters: [
        {
          name: 'duration',
          pointer: '/duration',
          type: 'integer',
          default: 5,
          minimum: 5,
          maximum: 10,
        },
      ],
      inputs: [
        {
          pointer: '/first_frame',
          name: 'first_frame',
          mime_prefix: 'image/',
          array: false,
        },
      ],
    },
  };

  it('correctly extracts slots for image references', () => {
    const slots = mediaSlots(sampleImageModel.request_form);
    expect(slots.length).toBe(1);
    expect(slots[0].group).toBe('reference');
    expect(slots[0].mimePrefix).toBe('image/');
  });

  it('correctly extracts slots for video frames', () => {
    const slots = mediaSlots(sampleVideoModel.request_form);
    expect(slots.length).toBe(1);
    expect(slots[0].group).toBe('frame');
  });

  it('builds valid image generation request with parameters', () => {
    const form = sampleImageModel.request_form!;
    const body = buildRequestBody(
      form,
      sampleImageModel.id,
      'A serene mountain lake at sunrise',
      { aspect_ratio: '16:9', resolution: '2K', quality: 'Standard' },
      [],
    );
    expect(body.model).toBe('flux-schnell');
    expect(body.prompt).toBe('A serene mountain lake at sunrise');
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.resolution).toBe('2K');
    expect(body.quality).toBe('Standard');
  });

  it('initializes default parameter values correctly', () => {
    const form = sampleImageModel.request_form!;
    const defaults = Object.fromEntries(
      form.parameters!.map((p) => [p.name, defaultParameterValue(p)]),
    );
    expect(defaults.aspect_ratio).toBe('16:9');
    expect(defaults.resolution).toBe('2K');
    expect(defaults.quality).toBe('Standard');
  });

  it('computes accurate price estimates for image and video playground models', () => {
    expect(estimateAmount(sampleImageModel.billing, {})).toBe(3000);
    // 5 seconds * 300000 = 1500000
    expect(estimateAmount(sampleVideoModel.billing, { duration: '5' })).toBe(
      1500000,
    );
    // 10 seconds * 300000 = 3000000
    expect(estimateAmount(sampleVideoModel.billing, { duration: '10' })).toBe(
      3000000,
    );
  });

  it('does not display fallback rate (兜底单价) on user side when rates exist', () => {
    const tieredBilling = {
      mode: 'per_output_second' as const,
      currency: 'CNY',
      unit_price: 80,
      unit_scale: 1,
      minimum_charge: 0,
      rates: [
        {
          label: '768P',
          dimensions: { resolution: '768P' },
          unit_price: 50,
          unit_scale: 1,
          minimum_charge: 0,
        },
        {
          label: '2K',
          dimensions: { resolution: '2K' },
          unit_price: 80,
          unit_scale: 1,
          minimum_charge: 0,
        },
      ],
    };

    const userHtml = renderToString(
      React.createElement(
        LocaleProvider,
        null,
        React.createElement(PriceTable, {
          billing: tieredBilling,
          parameters: {},
          admin: false,
        }),
      ),
    );
    expect(userHtml).toContain('768P');
    expect(userHtml).toContain('2K');
    expect(userHtml).not.toContain('兜底单价');
    expect(userHtml).not.toContain('Base price');
    expect(userHtml).not.toContain('其他参数组合');
    expect(userHtml).not.toContain('Any other combination');

    const adminHtml = renderToString(
      React.createElement(
        LocaleProvider,
        null,
        React.createElement(PriceTable, {
          billing: tieredBilling,
          parameters: {},
          admin: true,
        }),
      ),
    );
    expect(adminHtml).toContain('768P');
    expect(adminHtml).toContain('2K');
    expect(
      adminHtml.includes('兜底单价') || adminHtml.includes('Base price'),
    ).toBe(true);
  });

  it('displays flat rate on user side when model has no tiers', () => {
    const flatBilling = {
      mode: 'per_request' as const,
      currency: 'CNY',
      unit_price: 15,
      unit_scale: 1,
      minimum_charge: 0,
      rates: [],
    };

    const userHtml = renderToString(
      React.createElement(
        LocaleProvider,
        null,
        React.createElement(PriceTable, {
          billing: flatBilling,
          parameters: {},
          admin: false,
        }),
      ),
    );
    expect(
      userHtml.includes('统一单价') || userHtml.includes('Flat price'),
    ).toBe(true);
    expect(userHtml).not.toContain('兜底单价');
    expect(userHtml).not.toContain('Base price');
  });
});
