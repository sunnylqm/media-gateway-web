import { describe, expect, it } from 'bun:test';
import {
  formatAmount,
  formatBytes,
  formatDimensionOption,
  formatLabel,
  formatParameterName,
  formatParameterValue,
  formatRelativeTime,
  formatStatus,
} from './format';

describe('format utilities', () => {
  it('formats byte sizes cleanly', () => {
    expect(formatBytes(500)).toContain('500');
    expect(formatBytes(1500)).toContain('1.5');
    expect(formatBytes(2000000)).toContain('2');
  });

  it('formats relative times and falls back to a date past a year', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(formatRelativeTime('2025-12-31T21:00:00Z', now)).toContain('3');
    expect(formatRelativeTime('2024-01-01T00:00:00Z', now)).not.toContain(
      'ago',
    );
    expect(formatRelativeTime('not a date', now)).toBe('not a date');
  });

  it('formats parameter names and statuses', () => {
    expect(formatParameterName('aspect_ratio')).toBe('aspect ratio');
    expect(formatParameterValue('test')).toBe('test');
    expect(formatParameterValue(123)).toBe('123');
    expect(formatParameterValue({ a: 1 })).toBe('{"a":1}');
    expect(formatStatus('in_progress')).toBe('in progress');
  });

  it('formats labels and handles acronyms', () => {
    expect(formatLabel('ai_model')).toBe('AI model');
    expect(formatLabel('fps_rate')).toBe('FPS rate');
    expect(formatLabel('custom_field')).toBe('Custom field');
  });

  it('formats currency amounts', () => {
    const formatted = formatAmount(150, 'USD');
    expect(formatted).toContain('1.50');
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
