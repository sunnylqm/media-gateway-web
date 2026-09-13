import type { ErrorLog, ErrorLogLevel } from '../types';

export const errorLogPageSize = 50;

// parseRecipients reads the recipients field: addresses separated by commas,
// semicolons, or new lines. The gateway validates and de-duplicates them.
export function parseRecipients(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export type ErrorLogFilter = {
  level: '' | ErrorLogLevel;
  search: string;
};

// errorLogPath builds the list request for one page of a filter. `before` is
// the previous page's next_cursor.
export function errorLogPath(filter: ErrorLogFilter, before = ''): string {
  const query = new URLSearchParams({ limit: String(errorLogPageSize) });
  if (filter.level) query.set('level', filter.level);
  const search = filter.search.trim();
  if (search) query.set('q', search);
  if (before) query.set('before', before);
  return `/v1/admin/error-logs?${query.toString()}`;
}

// splitErrorLogAttributes takes a recovered panic's stack out of the other
// fields: it is many lines long and reads as its own block, not as one value
// in a JSON object.
export function splitErrorLogAttributes(entry: ErrorLog): {
  fields: Record<string, unknown> | null;
  stack: string;
} {
  const { stack, ...rest } = entry.attributes ?? {};
  return {
    fields: Object.keys(rest).length > 0 ? rest : null,
    stack: typeof stack === 'string' ? stack : '',
  };
}

// errorLogSummary is the one line shown under a message in the table: the
// logged error text when there is one, which is usually the part that says
// what actually failed.
export function errorLogSummary(entry: ErrorLog): string {
  const value = entry.attributes?.error ?? entry.attributes?.panic;
  return typeof value === 'string' ? value : '';
}
