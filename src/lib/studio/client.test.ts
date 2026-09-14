import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStudioClient } from './client';
import { CommandJournal } from './commands';
import { parseRevision } from './controller';
import { studioMessage } from './messages';
import type { StudioTransport, Summary } from './types';
import { mergeSummaries, seedsForRoute } from './view';

function transportFixture() {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const request: StudioTransport = async <T>(
    path: string,
    init: RequestInit = {},
  ) => {
    calls.push({ path, init });
    return {} as T;
  };
  return { calls, client: createStudioClient(request) };
}

function storageFixture() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

test('discovery repeats query keys and keeps the configured 70/30 mix', async () => {
  const { client, calls } = transportFixture();
  await client.discovery({
    genres: ['wuxia', 'fantasy'],
    exclude: ['a/b'],
    rotation: 'next & one',
  });
  const url = new URL(calls[0].path, 'https://example.test');
  assert.deepEqual(url.searchParams.getAll('genre'), ['wuxia', 'fantasy']);
  assert.equal(url.searchParams.get('exclude'), 'a/b');
  assert.equal(url.searchParams.get('familiar_percent'), '70');
  assert.equal(url.searchParams.get('rotation'), 'next & one');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('choice sends stored IDs and expected_version, not arbitrary prompt text', async () => {
  const { client, calls } = transportFixture();
  await client.choose('p/1', {
    expected_version: 2,
    turn_id: 't',
    option_id: 'o',
  });
  assert.equal(calls[0].path, '/v1/studio/projects/p%2F1/choices');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    expected_version: 2,
    turn_id: 't',
    option_id: 'o',
  });
  assert.equal(calls[0].init.method, 'POST');
});

test('create and fork carry a retry key and pin the source revision', async () => {
  const { client, calls } = transportFixture();
  await client.create(
    { seed_id: 's', seed_version: 1, transformation: 'restage' },
    'retry-1',
  );
  await client.fork(
    'p',
    { source_version: 7, transformation: 'change_pov' },
    'retry-2',
  );
  assert.equal(
    new Headers(calls[0].init.headers).get('Idempotency-Key'),
    'retry-1',
  );
  assert.equal(
    new Headers(calls[1].init.headers).get('Idempotency-Key'),
    'retry-2',
  );
  assert.equal(JSON.parse(String(calls[1].init.body)).source_version, 7);
});

test('reads use the actual P1a paths and preserve opaque pagination cursors', async () => {
  const { client, calls } = transportFixture();
  const abort = new AbortController();
  await client.get('p', 3, abort.signal);
  await client.get('p');
  await client.list('cursor+/=');
  await client.next('p', 4);
  assert.equal(calls[0].path, '/v1/studio/projects/p/revisions/3');
  assert.equal(calls[0].init.signal, abort.signal);
  assert.equal(calls[1].path, '/v1/studio/projects/p');
  assert.equal(
    new URL(calls[2].path, 'https://example.test').searchParams.get('after'),
    'cursor+/=',
  );
  assert.equal(calls[3].path, '/v1/studio/projects/p/next-turn');
  assert.equal(JSON.parse(String(calls[3].init.body)).expected_version, 4);
  assert.ok(calls.every(({ path }) => path.startsWith('/v1/studio/')));
});

test('malformed revisions fail before sending an HTTP request', async () => {
  const { client, calls } = transportFixture();
  for (const version of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(client.get('p', version));
  }
  assert.equal(calls.length, 0);
  assert.equal(parseRevision(null), undefined);
  assert.equal(parseRevision('12'), 12);
  for (const value of [
    '',
    '0',
    '-1',
    '1.5',
    '1e2',
    ' 1',
    '01',
    '9999999999999999999',
  ]) {
    assert.ok(Number.isNaN(parseRevision(value)));
  }
});

test('an uncertain create reuses its key across page reloads', () => {
  const storage = storageFixture();
  const body = { seed_id: 's', transformation: 'restage' };
  const first = new CommandJournal(
    'https://api.test',
    'u1',
    storage,
    () => 'key-1',
  );
  const ticket = first.prepare('create', body);
  const reloaded = new CommandJournal(
    'https://api.test',
    'u1',
    storage,
    () => 'key-2',
  );
  assert.deepEqual(reloaded.prepare('create', body), ticket);
  reloaded.acknowledge(ticket);
  assert.equal(storage.data.size, 0);
  assert.equal(reloaded.prepare('create', body).key, 'key-2');
});

test('retry keys are separated by account, origin, source version and operation', () => {
  const storage = storageFixture();
  let count = 0;
  const next = () => `key-${++count}`;
  const first = new CommandJournal('one', 'a', storage, next);
  const ticket = first.prepare('fork:p', { source_version: 2 });
  assert.notEqual(
    new CommandJournal('one', 'b', storage, next).prepare('fork:p', {
      source_version: 2,
    }).key,
    ticket.key,
  );
  assert.notEqual(
    new CommandJournal('two', 'a', storage, next).prepare('fork:p', {
      source_version: 2,
    }).key,
    ticket.key,
  );
  assert.notEqual(
    first.prepare('fork:p', { source_version: 3 }).key,
    ticket.key,
  );
  assert.notEqual(
    first.prepare('create', { source_version: 2 }).key,
    ticket.key,
  );
});

test('a late acknowledgement cannot clear a newer pending intent', () => {
  const storage = storageFixture();
  let count = 0;
  const journal = new CommandJournal('api', 'u', storage, () => `k-${++count}`);
  const first = journal.prepare('create', { seed_id: 'a' });
  const second = journal.prepare('create', { seed_id: 'b' });
  journal.acknowledge(first);
  assert.deepEqual(journal.prepare('create', { seed_id: 'b' }), second);
});

test('blocked storage still has in-memory retry protection', () => {
  const denied = () => {
    throw new Error('blocked');
  };
  const journal = new CommandJournal(
    'api',
    'u',
    { getItem: denied, setItem: denied, removeItem: denied },
    () => 'valid-key',
  );
  const ticket = journal.prepare('create', { seed_id: 'a' });
  assert.deepEqual(journal.prepare('create', { seed_id: 'a' }), ticket);
  assert.doesNotThrow(() => journal.acknowledge(ticket));
});

test('corrupt storage and a non-printable retry key are ignored', () => {
  for (const raw of ['{broken', '{"signature":"s","key":"\\n"}', 'null']) {
    const storage = storageFixture();
    storage.data.set('studio-command:api:u', raw);
    const journal = new CommandJournal('api', 'u', storage, () => 'safe');
    assert.equal(journal.prepare('create', {}).key, 'safe');
  }
});

test('discovery route labels never relabel archetypes as verified work scenes', () => {
  const seeds = ['archetype', 'work_scene', 'original_seed'].map(
    (origin, index) => ({ id: String(index), origin }),
  ) as Parameters<typeof seedsForRoute>[0];
  assert.equal(seedsForRoute(seeds, 'mixed').length, 3);
  assert.deepEqual(
    seedsForRoute(seeds, 'original').map((seed) => seed.origin),
    ['original_seed'],
  );
  assert.deepEqual(
    seedsForRoute(seeds, 'familiar').map((seed) => seed.origin),
    ['archetype', 'work_scene'],
  );
});

test('pagination de-duplicates repeated rows without losing order', () => {
  const first = [
    { id: 'a', version: 1 },
    { id: 'b', version: 1 },
  ] as Summary[];
  const next = [
    { id: 'b', version: 2 },
    { id: 'c', version: 1 },
  ] as Summary[];
  assert.deepEqual(
    mergeSummaries(first, next).map(({ id, version }) => [id, version]),
    [
      ['a', 1],
      ['b', 2],
      ['c', 1],
    ],
  );
});

test('UI translations cover every transformation and prompt field', () => {
  for (const locale of ['en', 'zh'] as const) {
    for (const key of [
      'restage',
      'change_pov',
      'change_decision',
      'fill_gap',
      'change_rule',
      'transpose',
    ] as const) {
      assert.ok(studioMessage(locale, key));
      assert.ok(studioMessage(locale, `${key}Hint`));
    }
    for (const key of [
      'viewpoint',
      'decision',
      'ending',
      'visual_style',
      'camera',
      'time_window',
      'world_rule',
      'setting',
    ] as const) {
      assert.ok(studioMessage(locale, `lesson_${key}`));
    }
  }
  assert.equal(studioMessage('en', 'version', { version: '$&' }), 'Version $&');
});
