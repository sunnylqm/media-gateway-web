import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StudioSessionController } from './session';
import type { StudioTransport } from './types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const calls: Array<{
    path: string;
    init: RequestInit;
    result: ReturnType<typeof deferred<unknown>>;
  }> = [];
  const request: StudioTransport = <T>(
    path: string,
    init: RequestInit = {},
  ) => {
    const result = deferred<unknown>();
    calls.push({ path, init, result });
    return result.promise as Promise<T>;
  };
  return { calls, controller: new StudioSessionController(request) };
}

async function verify(f: ReturnType<typeof fixture>, userID = 'account-a') {
  const done = f.controller.refresh();
  f.calls.at(-1)!.result.resolve({ user: { id: userID } });
  await done;
}

const aborted = { name: 'AbortError' };

test('initial requests remain blocked until identity verification succeeds', async () => {
  const f = fixture();
  assert.equal(f.controller.getSnapshot().value, null);
  const request = f.controller.forUser('account-a');
  await assert.rejects(request('/v1/studio/projects'), aborted);
  assert.equal(f.calls.length, 0);
  await verify(f);
  assert.equal(f.calls[0].path, '/v1/auth/me');
  assert.equal(f.calls[0].init.cache, 'no-store');
  assert.equal(f.controller.getSnapshot().busy, false);
});

test('same-account refresh retains the identity object and closes the gate synchronously', async () => {
  const f = fixture();
  await verify(f);
  const identity = f.controller.getSnapshot().value;
  const request = f.controller.forUser('account-a');
  const refresh = f.controller.refresh();
  assert.equal(f.controller.getSnapshot().value, identity);
  assert.equal(f.controller.getSnapshot().busy, true);
  for (const method of ['GET', 'POST']) {
    await assert.rejects(request('/v1/studio/projects', { method }), aborted);
  }
  assert.equal(f.calls.length, 2);
  f.calls[1].result.resolve({ user: { id: 'account-a' } });
  await refresh;
  assert.equal(f.controller.getSnapshot().value, identity);
  const result = request('/v1/studio/projects');
  f.calls[2].result.resolve({ data: [] });
  assert.deepEqual(await result, { data: [] });
});

test('focus refresh aborts in-flight work and rejects a late success even when transport ignores abort', async () => {
  const f = fixture();
  await verify(f);
  const request = f.controller.forUser('account-a');
  const pending = request('/v1/studio/projects', { method: 'POST' });
  const rejected = assert.rejects(pending, aborted);
  const refresh = f.controller.refresh();
  assert.equal(f.calls[1].init.signal?.aborted, true);
  f.calls[2].result.resolve({ user: { id: 'account-a' } });
  await refresh;
  f.calls[1].result.resolve({ project: { id: 'late-project' } });
  await rejected;
});

test('an account switch invalidates old client callbacks before the React remount', async () => {
  const f = fixture();
  await verify(f);
  const oldRequest = f.controller.forUser('account-a');
  await verify(f, 'account-b');
  assert.equal(f.controller.getSnapshot().value?.user.id, 'account-b');
  await assert.rejects(
    oldRequest('/v1/studio/projects', { method: 'POST' }),
    aborted,
  );
  assert.equal(f.calls.length, 2);
  const result = f.controller.forUser('account-b')('/v1/studio/projects');
  f.calls[2].result.resolve({ data: [] });
  await result;
});

for (const status of [401, 403]) {
  test(`identity status ${status} clears the old identity and blocks work`, async () => {
    const f = fixture();
    await verify(f);
    const refresh = f.controller.refresh();
    f.calls[1].result.reject({ status });
    await refresh;
    assert.equal(f.controller.getSnapshot().value, null);
    assert.equal(
      f.controller.getSnapshot().error,
      status === 401 ? 'auth' : 'forbidden',
    );
    await assert.rejects(
      f.controller.forUser('account-a')('/v1/studio/projects'),
      aborted,
    );
  });
}

test('transient identity failures retain local state but do not reopen the request gate', async () => {
  const f = fixture();
  await verify(f);
  const identity = f.controller.getSnapshot().value;
  const refresh = f.controller.refresh();
  f.calls[1].result.reject(new Error('offline'));
  await refresh;
  assert.equal(f.controller.getSnapshot().value, identity);
  assert.equal(f.controller.getSnapshot().error, 'network');
  await assert.rejects(
    f.controller.forUser('account-a')('/v1/studio/projects'),
    aborted,
  );
  await verify(f);
  assert.equal(f.controller.getSnapshot().value, identity);
  assert.equal(f.controller.getSnapshot().error, null);
});

test('out-of-order identity responses cannot restore a previous account', async () => {
  const f = fixture();
  const first = f.controller.refresh();
  const second = f.controller.refresh();
  assert.equal(f.calls[0].init.signal?.aborted, true);
  f.calls[1].result.resolve({ user: { id: 'account-b' } });
  await second;
  f.calls[0].result.resolve({ user: { id: 'account-a' } });
  await first;
  assert.equal(f.controller.getSnapshot().value?.user.id, 'account-b');
});

test('a late verification failure does not invalidate a newer success', async () => {
  const f = fixture();
  const first = f.controller.refresh();
  await verify(f, 'account-b');
  f.calls[0].result.reject({ status: 401 });
  await first;
  assert.equal(f.controller.getSnapshot().error, null);
  assert.equal(f.controller.getSnapshot().value?.user.id, 'account-b');
});

test('StrictMode dispose ignores abandoned results and a new refresh reactivates safely', async () => {
  const f = fixture();
  const first = f.controller.refresh();
  f.controller.dispose();
  assert.equal(f.calls[0].init.signal?.aborted, true);
  await verify(f, 'account-b');
  f.calls[0].result.resolve({ user: { id: 'account-a' } });
  await first;
  assert.equal(f.controller.getSnapshot().value?.user.id, 'account-b');
  f.controller.dispose();
  await assert.rejects(
    f.controller.forUser('account-b')('/v1/studio/projects'),
    aborted,
  );
});

test('caller cancellation is forwarded and prevents delivery from an ignoring transport', async () => {
  const f = fixture();
  await verify(f);
  const abort = new AbortController();
  const result = f.controller.forUser('account-a')('/v1/studio/projects', {
    signal: abort.signal,
  });
  const rejected = assert.rejects(result, aborted);
  abort.abort();
  assert.equal(f.calls[1].init.signal?.aborted, true);
  f.calls[1].result.resolve({ data: [] });
  await rejected;
  await assert.rejects(
    f.controller.forUser('account-a')('/v1/studio/projects', {
      signal: abort.signal,
    }),
    aborted,
  );
  assert.equal(f.calls.length, 2);
});

test('malformed identity data fails closed rather than restoring a stale account', async () => {
  const f = fixture();
  await verify(f);
  const refresh = f.controller.refresh();
  f.calls[1].result.resolve({ user: { id: '' } });
  await refresh;
  assert.equal(f.controller.getSnapshot().value, null);
  assert.equal(f.controller.getSnapshot().error, 'forbidden');
});

test('request options and server failures retain their existing API semantics', async () => {
  const f = fixture();
  await verify(f);
  const request = f.controller.forUser('account-a');
  const result = request('/v1/studio/projects', {
    method: 'POST',
    body: '{"seed_id":"s"}',
    headers: { 'Idempotency-Key': 'same-retry-key' },
    cache: 'no-store',
  });
  const error = { status: 409, code: 'studio_version_conflict' };
  const rejected = assert.rejects(result, (reason) => reason === error);
  assert.equal(f.calls[1].init.method, 'POST');
  assert.equal(f.calls[1].init.body, '{"seed_id":"s"}');
  assert.deepEqual(f.calls[1].init.headers, {
    'Idempotency-Key': 'same-retry-key',
  });
  f.calls[1].result.reject(error);
  await rejected;
});

test('subscribers observe transitions and disposed verification cannot notify them', async () => {
  const f = fixture();
  let updates = 0;
  const off = f.controller.subscribe(() => {
    updates += 1;
  });
  await verify(f);
  assert.equal(updates, 2);
  const pending = f.controller.refresh();
  assert.equal(updates, 3);
  f.controller.dispose();
  f.calls[1].result.resolve({ user: { id: 'account-b' } });
  await pending;
  assert.equal(updates, 3);
  off();
  await verify(f);
  assert.equal(updates, 3);
});

test('late request errors cannot masquerade as current-account failures', async () => {
  const f = fixture();
  await verify(f);
  const result = f.controller.forUser('account-a')('/v1/studio/projects');
  const rejected = assert.rejects(result, aborted);
  await verify(f);
  f.calls[1].result.reject({ status: 401 });
  await rejected;
  assert.equal(f.controller.getSnapshot().error, null);
});
