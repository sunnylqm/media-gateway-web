import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { api } from './api';

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  'document',
);
const originalFetch = globalThis.fetch;
const originalSessionStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'sessionStorage',
);

const stored = new Map<string, string>();
const storage: Storage = {
  get length() {
    return stored.size;
  },
  clear: () => stored.clear(),
  getItem: (key) => stored.get(key) ?? null,
  key: (index) => [...stored.keys()][index] ?? null,
  removeItem: (key) => stored.delete(key),
  setItem: (key, value) => stored.set(key, value),
};

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { cookie: '' },
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: storage,
});

describe('api CSRF recovery', () => {
  beforeEach(() => stored.clear());

  it('retries a rejected mutation with the token reflected by the gateway', async () => {
    stored.set('media_gateway_admin_csrf', 'stale-token');
    const fetchMock = mock()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'csrf_failed',
              message: 'a valid CSRF token is required',
            },
          }),
          {
            status: 403,
            headers: { 'X-CSRF-Token': 'current-token' },
          },
        ),
      )
      .mockResolvedValueOnce(Response.json({ id: 'gen_123' }, { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      api<{ id: string }>(
        '/v1/admin/models/video/generations',
        { method: 'POST', body: JSON.stringify({ prompt: 'Dawn' }) },
        true,
      ),
    ).resolves.toEqual({ id: 'gen_123' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    const secondHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(firstHeaders.get('X-CSRF-Token')).toBe('stale-token');
    expect(secondHeaders.get('X-CSRF-Token')).toBe('current-token');
    expect(stored.get('media_gateway_admin_csrf')).toBe('current-token');
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalDocument) {
    Object.defineProperty(globalThis, 'document', originalDocument);
  } else {
    Reflect.deleteProperty(globalThis, 'document');
  }
  if (originalSessionStorage) {
    Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
