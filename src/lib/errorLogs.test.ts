import { describe, expect, it } from 'bun:test';
import type { ErrorLog } from '../types';
import {
  errorLogPath,
  errorLogSummary,
  splitErrorLogAttributes,
} from './errorLogs';

const entry = (attributes?: Record<string, unknown>): ErrorLog => ({
  object: 'error_log',
  id: 3,
  occurred_at: '2026-09-13T12:00:00Z',
  level: 'error',
  message: 'panic recovered',
  attributes,
});

describe('error logs', () => {
  it('builds the list path from the filter and cursor', () => {
    expect(errorLogPath({ level: '', search: '' })).toBe(
      '/v1/admin/error-logs?limit=50',
    );
    expect(
      errorLogPath({ level: 'warn', search: ' req_1 & more ' }, '41'),
    ).toBe(
      '/v1/admin/error-logs?limit=50&level=warn&q=req_1+%26+more&before=41',
    );
  });

  it('keeps the stack apart from the other fields', () => {
    expect(
      splitErrorLogAttributes(
        entry({ stack: 'goroutine 1', path: '/v1/models' }),
      ),
    ).toEqual({ fields: { path: '/v1/models' }, stack: 'goroutine 1' });
    expect(splitErrorLogAttributes(entry())).toEqual({
      fields: null,
      stack: '',
    });
  });

  it('summarises with the error text or the panic value', () => {
    expect(errorLogSummary(entry({ error: 'database is locked' }))).toBe(
      'database is locked',
    );
    expect(errorLogSummary(entry({ panic: 'nil map' }))).toBe('nil map');
    expect(errorLogSummary(entry({ status: 500 }))).toBe('');
  });
});
