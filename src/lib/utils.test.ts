import { describe, expect, it } from 'bun:test';
import { cn } from './utils';

describe('cn utility', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    expect(cn('px-2 py-1', 'bg-red-500')).toBe('px-2 py-1 bg-red-500');
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', false && 'text-blue-500', 'font-bold')).toBe(
      'text-red-500 font-bold',
    );
  });
});
