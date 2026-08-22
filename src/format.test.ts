import { describe, expect, it } from 'bun:test';
import {
  formatAmount,
  formatBytes,
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
});
