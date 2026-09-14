import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StudioClient } from './client';
import { failureOf, ProjectController } from './controller';
import { studioMessage } from './messages';
import type { StudioRecord, StudioResult } from './types';
import { creativeBrief } from './view';

function record(version = 2): StudioRecord {
  return {
    project: {
      id: 'p', version, transformation: 'restage', choices: [],
      seed: {
        id: 's', version: 1, origin: 'archetype', title: '一幕', hook: '一个起点',
        characters: ['keeper'], location: 'inn', genres: ['wuxia'],
        locked_facts: [{ id: 'f', text: '雨夜客栈' }], transformations: ['restage'],
      },
      pending: { id: 'turn-1', field: 'visual_style', question: '怎么拍？', options: [{ id: 'a', label: '真实', value: '写实材质' }, { id: 'b', label: '绘本', value: '纸张纹理' }] },
    },
    created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-14T00:00:00Z',
  };
}
function accepted(complete = false): StudioResult {
  const value = record(3);
  delete value.project.pending;
  value.project.choices = [{ turn_id: 'turn-1', option_id: 'a', field: 'visual_style', value: '写实材质' }];
  return { ...value, changed: true, guide_complete: complete };
}
function fixture(overrides: Partial<StudioClient> = {}) {
  const calls = { choose: 0, next: 0 };
  const client: StudioClient = {
    get: async () => record(),
    next: async () => { calls.next += 1; return { ...record(4), changed: true, guide_complete: false }; },
    choose: async () => { calls.choose += 1; return accepted(); },
    create: async () => accepted(),
    fork: async () => accepted(),
    discovery: async () => { throw new Error('not used'); },
    list: async () => ({ data: [] }),
    ...overrides,
  };
  return { calls, client, controller: new ProjectController(client, 'p') };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('a GET never guesses guide completion from choice count', async () => {
  const { controller } = fixture();
  await controller.load();
  assert.equal(controller.getSnapshot().complete, null);
});

test('acceptance advances using the returned version, then retrieves the next turn', async () => {
  let expected = 0;
  const { controller } = fixture({ next: async (_id, version) => { expected = version; return { ...record(4), changed: true, guide_complete: false }; } });
  await controller.load();
  await controller.choose('a');
  assert.equal(expected, 3);
  assert.equal(controller.getSnapshot().record?.project.version, 4);
  assert.equal(controller.getSnapshot().busy, false);
});

test('a failed next-turn keeps the successfully saved choice', async () => {
  const { controller, calls } = fixture({ next: async () => { throw new Error('offline'); } });
  await controller.load();
  await controller.choose('a');
  assert.equal(calls.choose, 1);
  assert.equal(controller.getSnapshot().record?.project.version, 3);
  assert.equal(controller.getSnapshot().record?.project.choices.length, 1);
  assert.equal(controller.getSnapshot().error, 'network');
});

test('completion stops next-turn calls and uses the server flag', async () => {
  const { controller, calls } = fixture({ choose: async () => accepted(true) });
  await controller.load();
  await controller.choose('a');
  assert.equal(calls.next, 0);
  assert.equal(controller.getSnapshot().complete, true);
});

test('rapid double clicks submit one choice', async () => {
  const pending = deferred<StudioResult>();
  let count = 0;
  const { controller } = fixture({ choose: () => { count += 1; return pending.promise; } });
  await controller.load();
  const first = controller.choose('a');
  await controller.choose('b');
  pending.resolve(accepted(true));
  await first;
  assert.equal(count, 1);
});

test('an unknown option is never submitted', async () => {
  const { controller, calls } = fixture();
  await controller.load();
  await controller.choose('invented');
  assert.equal(calls.choose, 0);
});

test('history is read-only even when its snapshot contains a pending turn', async () => {
  const { client, calls } = fixture();
  const controller = new ProjectController(client, 'p', 2);
  await controller.load();
  await controller.choose('a');
  await controller.next();
  assert.deepEqual(calls, { choose: 0, next: 0 });
});

test('conflicts block subsequent edits until a successful refresh', async () => {
  let count = 0;
  const { controller } = fixture({ choose: async () => { count += 1; throw { status: 409, code: 'studio_version_conflict' }; } });
  await controller.load();
  await controller.choose('a');
  await controller.choose('b');
  await controller.next();
  assert.equal(count, 1);
  assert.equal(controller.getSnapshot().conflict, true);
  await controller.load();
  assert.equal(controller.getSnapshot().conflict, false);
});

test('out-of-order reads cannot overwrite the newest view', async () => {
  const slow = deferred<StudioRecord>();
  let count = 0;
  const { controller } = fixture({ get: () => ++count === 1 ? slow.promise : Promise.resolve(record(8)) });
  const first = controller.load();
  await controller.load();
  slow.resolve(record(2));
  await first;
  assert.equal(controller.getSnapshot().record?.project.version, 8);
});

test('an abandoned mutation cannot replace a newly loaded view', async () => {
  const pending = deferred<StudioResult>();
  let reads = 0;
  const { controller } = fixture({ get: async () => record(++reads === 1 ? 2 : 10), choose: () => pending.promise });
  await controller.load();
  const mutation = controller.choose('a');
  await controller.load();
  pending.resolve(accepted(true));
  await mutation;
  assert.equal(controller.getSnapshot().record?.project.version, 10);
});

test('dispose cancels updates and load can reactivate after a StrictMode cleanup', async () => {
  const slow = deferred<StudioRecord>();
  const { controller } = fixture({ get: () => slow.promise });
  const read = controller.load();
  controller.dispose();
  slow.resolve(record());
  await read;
  assert.equal(controller.getSnapshot().record, null);
  await controller.load();
  assert.equal(controller.getSnapshot().record?.project.id, 'p');
});

test('listeners observe state transitions and can unsubscribe', async () => {
  const { controller } = fixture();
  let count = 0;
  const off = controller.subscribe(() => { count += 1; });
  await controller.load();
  assert.ok(count >= 2);
  off();
  const previous = count;
  await controller.next();
  assert.equal(count, previous);
});

test('classification distinguishes quota from a version conflict', () => {
  assert.equal(failureOf({ status: 409, code: 'studio_project_limit' }), 'quota');
  assert.equal(failureOf({ status: 409, code: 'studio_turn_consumed' }), 'conflict');
  for (const [status, expected] of [[401, 'auth'], [403, 'forbidden'], [404, 'missing'], [429, 'rate'], [400, 'invalid'], [413, 'invalid'], [500, 'network']] as const) {
    assert.equal(failureOf({ status }), expected);
  }
  assert.equal(failureOf(null), 'network');
});

test('a copied brief is plain text with an explicit non-generation boundary', () => {
  const value = accepted();
  const text = creativeBrief(value, (key, args) => studioMessage('zh', key, args));
  assert.ok(text.includes('雨夜客栈'));
  assert.ok(text.includes('写实材质'));
  assert.ok(text.includes('尚未生成剧本、分镜或视频'));
  assert.ok(!text.includes('generation_id'));
});
