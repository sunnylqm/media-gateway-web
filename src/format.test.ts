import { describe, expect, it } from 'bun:test';
import {
  formatAmount,
  formatBytes,
  formatDimensionOption,
  formatLabel,
  formatOptionValue,
  formatParameterName,
  formatParameterValue,
  formatRelativeTime,
  formatStatus,
  formatters,
  isFreeNumber,
} from './format';

describe('format utilities', () => {
  it('formats byte sizes cleanly', () => {
    expect(formatBytes(500, 'en')).toContain('500');
    expect(formatBytes(1500, 'en')).toContain('1.5');
    expect(formatBytes(2000000, 'en')).toContain('2');
  });

  it('formats relative times and falls back to a date past a year', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(formatRelativeTime('2025-12-31T21:00:00Z', 'en', now)).toContain(
      '3',
    );
    expect(formatRelativeTime('2024-01-01T00:00:00Z', 'en', now)).not.toContain(
      'ago',
    );
    expect(formatRelativeTime('not a date', 'en', now)).toBe('not a date');
  });

  it('formats parameter names and statuses', () => {
    expect(formatParameterName('aspect_ratio', 'en')).toBe('aspect ratio');
    expect(formatParameterValue('test')).toBe('test');
    expect(formatParameterValue(123)).toBe('123');
    expect(formatParameterValue({ a: 1 })).toBe('{"a":1}');
    expect(formatStatus('in_progress', 'en')).toBe('in progress');
  });

  it('formats labels and handles acronyms', () => {
    expect(formatLabel('ai_model', 'en')).toBe('AI model');
    expect(formatLabel('fps_rate', 'en')).toBe('FPS rate');
    expect(formatLabel('custom_field', 'en')).toBe('Custom field');
  });

  it('formats in the locale it is given, not a global one', () => {
    expect(formatStatus('in_progress', 'zh')).toBe('生成中');
    expect(formatLabel('first_frame', 'zh')).toBe('首帧');
    expect(formatLabel('first_frame', 'en')).toBe('First frame');
  });

  it('binds every formatter to one locale', () => {
    const zh = formatters('zh');
    const en = formatters('en');
    expect(zh.intl).toBe('zh-CN');
    expect(zh.label('first_frame')).toBe('首帧');
    expect(en.label('first_frame')).toBe('First frame');
    expect(zh.optionValue('quality', 'hd')).toBe('高清');
    expect(en.optionValue('quality', 'hd')).toBe('HD');
  });

  it('formats currency amounts', () => {
    const formatted = formatAmount(150, 'USD', 'en');
    expect(formatted).toContain('1.50');
  });

  it('translates option values without changing what is sent', () => {
    expect(formatOptionValue('ratio', 'adaptive', 'zh')).toBe(
      'adaptive (自适应)',
    );
    expect(formatOptionValue('ratio', '16:9', 'zh')).toBe('16:9 (横版)');
    expect(formatOptionValue('quality', 'xhigh', 'zh')).toBe('超高');
    expect(formatOptionValue('quality', 'max', 'en')).toBe('Max');
    expect(formatOptionValue('moderation', 'low', 'zh')).toBe('宽松');
    expect(formatOptionValue('output_format', 'png', 'zh')).toBe('png');
  });

  it('types a seed or a very wide range rather than dragging to it', () => {
    expect(isFreeNumber('seed', -1, 2147483647)).toBe(true);
    expect(isFreeNumber('seed')).toBe(true);
    expect(isFreeNumber('duration', 4, 15)).toBe(false);
    expect(isFreeNumber('steps', 0, 5000)).toBe(true);
  });

  it('formats dimension options with descriptions', () => {
    // English
    expect(formatDimensionOption('1024x1024', 'en')).toBe('1024x1024 (square)');
    expect(formatDimensionOption('1536x1024', 'en')).toBe(
      '1536x1024 (landscape)',
    );
    expect(formatDimensionOption('1024x1536', 'en')).toBe(
      '1024x1536 (portrait)',
    );
    expect(formatDimensionOption('2048x2048', 'en')).toBe(
      '2048x2048 (2K square)',
    );
    expect(formatDimensionOption('2048x1152', 'en')).toBe(
      '2048x1152 (2K landscape)',
    );
    expect(formatDimensionOption('3840x2160', 'en')).toBe(
      '3840x2160 (4K landscape)',
    );
    expect(formatDimensionOption('2160x3840', 'en')).toBe(
      '2160x3840 (4K portrait)',
    );
    expect(formatDimensionOption('auto', 'en')).toBe('Auto');
    expect(formatDimensionOption('1920x1080', 'en')).toBe(
      '1920x1080 (landscape)',
    );
    expect(formatDimensionOption('1080x1920', 'en')).toBe(
      '1080x1920 (portrait)',
    );
    expect(formatDimensionOption('16:9', 'en')).toBe('16:9 (landscape)');
    expect(formatDimensionOption('9:16', 'en')).toBe('9:16 (portrait)');
    expect(formatDimensionOption('1:1', 'en')).toBe('1:1 (square)');

    // Chinese
    expect(formatDimensionOption('1024x1024', 'zh')).toBe('1024x1024 (正方形)');
    expect(formatDimensionOption('1536x1024', 'zh')).toBe('1536x1024 (横版)');
    expect(formatDimensionOption('1024x1536', 'zh')).toBe('1024x1536 (竖版)');
    expect(formatDimensionOption('2048x2048', 'zh')).toBe(
      '2048x2048 (2K 正方形)',
    );
    expect(formatDimensionOption('2048x1152', 'zh')).toBe(
      '2048x1152 (2K 横版)',
    );
    expect(formatDimensionOption('3840x2160', 'zh')).toBe(
      '3840x2160 (4K 横版)',
    );
    expect(formatDimensionOption('2160x3840', 'zh')).toBe(
      '2160x3840 (4K 竖版)',
    );
    expect(formatDimensionOption('auto', 'zh')).toBe('自动');
    expect(formatDimensionOption('1920x1080', 'zh')).toBe('1920x1080 (横版)');
    expect(formatDimensionOption('1080x1920', 'zh')).toBe('1080x1920 (竖版)');
    expect(formatDimensionOption('16:9', 'zh')).toBe('16:9 (横版)');
    expect(formatDimensionOption('9:16', 'zh')).toBe('9:16 (竖版)');
    expect(formatDimensionOption('1:1', 'zh')).toBe('1:1 (正方形)');
  });
});
