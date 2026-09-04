import { describe, expect, it } from 'bun:test';
import {
  formatAmount,
  formatBytes,
  formatDimensionOption,
  formatLabel,
  formatParameterName,
  formatParameterValue,
  formatStatus,
} from './format';

describe('format utilities', () => {
  it('formats byte sizes cleanly', () => {
    expect(formatBytes(500)).toContain('500');
    expect(formatBytes(1500)).toContain('1.5');
    expect(formatBytes(2000000)).toContain('2');
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
    expect(formatDimensionOption('1024x1024')).toBe('1024x1024 (square)');
    expect(formatDimensionOption('1536x1024')).toBe('1536x1024 (landscape)');
    expect(formatDimensionOption('1024x1536')).toBe('1024x1536 (portrait)');
    expect(formatDimensionOption('2048x2048')).toBe('2048x2048 (2K square)');
    expect(formatDimensionOption('2048x1152')).toBe('2048x1152 (2K landscape)');
    expect(formatDimensionOption('3840x2160')).toBe('3840x2160 (4K landscape)');
    expect(formatDimensionOption('2160x3840')).toBe('2160x3840 (4K portrait)');
    expect(formatDimensionOption('auto')).toBe('Auto');
    expect(formatDimensionOption('1920x1080')).toBe('1920x1080 (landscape)');
    expect(formatDimensionOption('1080x1920')).toBe('1080x1920 (portrait)');
  });
});
