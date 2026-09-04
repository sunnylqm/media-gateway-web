import { describe, expect, it } from 'bun:test';
import { translateTerm } from './terms';

describe('terms localization', () => {
  it('translates terms for zh locale', () => {
    expect(translateTerm('zh', 'completed')).toBe('已完成');
    expect(translateTerm('zh', 'queued')).toBe('排队中');
    expect(translateTerm('zh', 'prompt')).toBe('提示词');
    expect(translateTerm('zh', 'paid')).toBe('已支付');
    expect(translateTerm('zh', 'output_format')).toBe('输出格式');
    expect(translateTerm('zh', 'Output format')).toBe('输出格式');
    expect(translateTerm('zh', 'unknown_term')).toBeUndefined();
  });

  it('returns undefined for non-zh locale', () => {
    expect(translateTerm('en', 'completed')).toBeUndefined();
  });
});
