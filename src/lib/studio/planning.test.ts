import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlanningClient, type PlanningClient } from './planningClient';
import { PlanningController, planningFailure } from './planningController';
import { planningCopy } from './planningCopy';
import { PlanningJournal } from './planningJournal';
import {
  activePlanningTask,
  canAcceptPlan,
  type PlanningInfo,
  type PlanningRequest,
  type PlanningTask,
  type StoryPlan,
  supportedPlanning,
} from './planningTypes';
import { readStoryPlan, shotPrompt } from './planView';
import type { StudioTransport } from './types';

const info: PlanningInfo = {
  enabled: true,
  generation_enabled: false,
  billing_mode: 'operator_funded',
  confirmation_required: true,
  max_tasks_per_24h: 20,
  profile: {
    id: 'profile',
    model: 'test-model',
    prompt_version: 'story-shots-v1',
    max_completion_tokens: 8192,
    limits: {
      min_shots: 3,
      max_shots: 5,
      max_clip_ms: 15000,
      max_total_ms: 30000,
    },
  },
};
function plan(version = 5): StoryPlan {
  return {
    project_version: version,
    title: '客栈',
    goal: '保住客栈',
    obstacle: '客人争执',
    decision: '移开油灯',
    outcome: '避免失火',
    locked_facts: [{ id: 'rain', text: '雨夜' }],
    applied_choices: [
      {
        turn_id: 'turn',
        option_id: 'other',
        field: 'viewpoint',
        value: '掌柜视角',
      },
    ],
    beats: [{ id: 'setup', kind: 'setup', action: '客人到来', depends_on: [] }],
    shots: [
      {
        id: 'shot',
        beat_ids: ['setup'],
        characters: ['掌柜'],
        location: '客栈',
        action: '移开油灯',
        camera: '静止镜头',
        edit_duration_ms: 3000,
        generation_duration_ms: 5000,
        segments: [
          {
            id: 'segment',
            text: '柜台后的掌柜收起油灯',
            choice_turn_ids: ['turn'],
            fact_ids: ['rain'],
          },
        ],
      },
    ],
  };
}
function task(
  state: PlanningTask['state'] = 'queued',
  id = 'task-1',
  version = 5,
): PlanningTask {
  return {
    id,
    project_id: 'project',
    input_version: version,
    state,
    profile: info.profile!,
    usage: { known: false, prompt_tokens: 0, completion_tokens: 0 },
    created_at: '2026-09-14T00:00:00Z',
    updated_at: '2026-09-14T00:00:00Z',
    ...(['ready', 'accepted', 'stale'].includes(state)
      ? { plan: plan(version) }
      : {}),
    ...(state === 'accepted' ? { accepted_version: version + 1 } : {}),
  };
}
function storage() {
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
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}
function fixture(overrides: Partial<PlanningClient> = {}) {
  const calls = { list: 0, enqueue: 0, accept: 0, cancel: 0 };
  const saved = storage();
  let number = 0;
  const journal = new PlanningJournal(
    'api',
    'user',
    saved,
    () => `key-${++number}`,
  );
  const client: PlanningClient = {
    info: async () => info,
    list: async () => {
      calls.list++;
      return { data: [] };
    },
    get: async () => task(),
    enqueue: async () => {
      calls.enqueue++;
      return task();
    },
    accept: async () => {
      calls.accept++;
      return { task: task('accepted'), changed: true };
    },
    cancel: async () => {
      calls.cancel++;
      return task('canceled');
    },
    ...overrides,
  };
  return {
    calls,
    saved,
    journal,
    client,
    controller: new PlanningController(client, journal, 'project'),
  };
}
const request: PlanningRequest = {
  project_id: 'project',
  expected_version: 5,
  confirm_text_generation: true,
};

test('P1c paths, methods, credentials seam, consent and original acceptance version', async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const transport: StudioTransport = async <T>(
    path: string,
    init: RequestInit = {},
  ) => {
    calls.push({ path, init });
    return {} as T;
  };
  const client = createPlanningClient(transport);
  const abort = new AbortController();
  await client.info(abort.signal);
  await client.list('a/b', abort.signal);
  await client.get('t/x', abort.signal);
  await client.enqueue(request, 'retry-key', abort.signal);
  await client.accept('t/x', 5, abort.signal);
  await client.cancel('t/x', abort.signal);
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      '/v1/studio/planning',
      '/v1/studio/planning/projects/a%2Fb/tasks',
      '/v1/studio/planning/tasks/t%2Fx',
      '/v1/studio/planning/tasks',
      '/v1/studio/planning/tasks/t%2Fx/accept',
      '/v1/studio/planning/tasks/t%2Fx/cancel',
    ],
  );
  assert.ok(
    calls.every(
      (c) => c.init.signal === abort.signal && c.init.cache === 'no-store',
    ),
  );
  assert.equal(
    new Headers(calls[3].init.headers).get('Idempotency-Key'),
    'retry-key',
  );
  assert.deepEqual(JSON.parse(String(calls[3].init.body)), request);
  assert.deepEqual(JSON.parse(String(calls[4].init.body)), {
    expected_version: 5,
  });
  assert.deepEqual(JSON.parse(String(calls[5].init.body)), {});
  assert.deepEqual(
    calls.map((c) => c.init.method ?? 'GET'),
    ['GET', 'GET', 'GET', 'POST', 'POST', 'POST'],
  );
});

test('loading or polling never creates, accepts, cancels, or infers guide completion', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.poll();
  assert.deepEqual(f.calls, { list: 1, enqueue: 0, accept: 0, cancel: 0 });
  assert.equal(f.controller.shouldPoll(), false);
});
test('disabled planning keeps the API optional and never queries tasks', async () => {
  const f = fixture({ info: async () => ({ ...info, enabled: false }) });
  await f.controller.load();
  await f.controller.enqueue(5, true);
  assert.equal(f.calls.list, 0);
  assert.equal(f.calls.enqueue, 0);
});
test('unknown billing modes are not automatically authorized', async () => {
  const f = fixture({
    info: async () => ({ ...info, billing_mode: 'tenant_wallet' }),
  });
  await f.controller.load();
  await f.controller.enqueue(5, true);
  assert.equal(f.calls.enqueue, 0);
  assert.equal(supportedPlanning(f.controller.getSnapshot().info), false);
});
test('each new request requires explicit consent and a valid version', async () => {
  const f = fixture();
  await f.controller.load();
  for (const v of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    await f.controller.enqueue(v, true);
  await f.controller.enqueue(5, false);
  assert.equal(f.calls.enqueue, 0);
  assert.equal(await f.controller.enqueue(5, true), true);
  assert.equal(f.controller.getSnapshot().tasks[0].state, 'queued');
  assert.equal(f.controller.getSnapshot().pending, null);
});
test('rapid double submit and an overlapping refresh cannot create twice', async () => {
  const wait = deferred<PlanningTask>();
  let count = 0;
  const f = fixture({
    enqueue: async () => {
      count++;
      return wait.promise;
    },
  });
  await f.controller.load();
  const first = f.controller.enqueue(5, true);
  await f.controller.enqueue(5, true);
  await f.controller.load();
  assert.equal(count, 1);
  wait.resolve(task());
  await first;
});
test('an existing active task blocks a second new request', async () => {
  const f = fixture({ list: async () => ({ data: [task('running')] }) });
  await f.controller.load();
  await f.controller.enqueue(5, true);
  assert.equal(f.calls.enqueue, 0);
});
test('polling ends at ready and never automatically adopts', async () => {
  let reads = 0;
  const f = fixture({
    list: async () => ({ data: [task(++reads === 1 ? 'running' : 'ready')] }),
  });
  await f.controller.load();
  assert.equal(f.controller.shouldPoll(), true);
  await f.controller.poll();
  assert.equal(f.controller.shouldPoll(), false);
  assert.equal(f.calls.accept, 0);
});
for (const terminal of [
  'ready',
  'failed',
  'interrupted',
  'canceled',
  'stale',
  'accepted',
] as const) {
  test(`terminal state ${terminal} never starts automatic work`, async () => {
    const f = fixture({ list: async () => ({ data: [task(terminal)] }) });
    await f.controller.load();
    assert.equal(f.controller.shouldPoll(), false);
    assert.equal(f.calls.enqueue, 0);
  });
}
test('poll failure stops polling but preserves the last observed task', async () => {
  let reads = 0;
  const f = fixture({
    list: async () => {
      if (++reads === 2) throw new Error('offline');
      return { data: [task()] };
    },
  });
  await f.controller.load();
  await f.controller.poll();
  assert.equal(f.controller.getSnapshot().tasks.length, 1);
  assert.equal(f.controller.shouldPoll(), false);
});
test('an uncertain request survives reload and replays only with explicit confirmation', async () => {
  const seen: Array<{ body: PlanningRequest; key: string }> = [];
  const f = fixture({
    enqueue: async (body, key) => {
      seen.push({ body, key });
      throw new Error('lost response');
    },
  });
  await f.controller.load();
  await f.controller.enqueue(5, true);
  const replayJournal = new PlanningJournal(
    'api',
    'user',
    f.saved,
    () => 'must-not-use',
  );
  const replay = new PlanningController(
    {
      ...f.client,
      enqueue: async (body, key) => {
        seen.push({ body, key });
        return task();
      },
    },
    replayJournal,
    'project',
  );
  await replay.load();
  assert.equal(seen.length, 1);
  await replay.retrySubmission(false);
  await replay.enqueue(6, true);
  assert.equal(seen.length, 1);
  await replay.retrySubmission(true);
  assert.deepEqual(seen[0], seen[1]);
  assert.equal(replay.getSnapshot().pending, null);
});
for (const code of [
  'studio_planning_quota',
  'studio_planning_pending',
  'studio_version_conflict',
  'invalid_request',
]) {
  test(`a definitive ${code} response releases the unused command`, async () => {
    const f = fixture({
      enqueue: async () => {
        throw { status: 409, code };
      },
    });
    await f.controller.load();
    await f.controller.enqueue(5, true);
    assert.equal(f.controller.getSnapshot().pending, null);
  });
}
for (const status of [401, 403, 500, 503]) {
  test(`status ${status} cannot prove an earlier ambiguous request was not saved`, async () => {
    const f = fixture({
      enqueue: async () => {
        throw { status };
      },
    });
    await f.controller.load();
    await f.controller.enqueue(5, true);
    assert.ok(f.controller.getSnapshot().pending);
  });
}
test('late enqueue success after disposal cannot acknowledge or replace a new view', async () => {
  const wait = deferred<PlanningTask>();
  const f = fixture({ enqueue: async () => wait.promise });
  await f.controller.load();
  const pending = f.controller.enqueue(5, true);
  f.controller.dispose();
  wait.resolve(task());
  await pending;
  assert.ok(f.journal.peek('project'));
  assert.equal(f.controller.getSnapshot().tasks.length, 0);
  await f.controller.load();
  assert.ok(f.controller.getSnapshot().pending);
});
test('an old GET never overwrites a newer list', async () => {
  const wait = deferred<{ data: PlanningTask[] }>();
  let reads = 0;
  const f = fixture({
    list: async () =>
      ++reads === 1 ? wait.promise : { data: [task('ready', 'new')] },
  });
  const old = f.controller.load();
  await Promise.resolve();
  await f.controller.load();
  wait.resolve({ data: [task('queued', 'old')] });
  await old;
  assert.equal(f.controller.getSnapshot().tasks[0].id, 'new');
});
test('acceptance is explicit, version-bound and returns a receipt rather than fabricating a project', async () => {
  const f = fixture({ list: async () => ({ data: [task('ready')] }) });
  await f.controller.load();
  assert.equal(await f.controller.accept('task-1', 5, false), null);
  assert.equal(await f.controller.accept('task-1', 6, true), null);
  const receipt = await f.controller.accept('task-1', 5, true);
  assert.equal(receipt?.task.accepted_version, 6);
  assert.equal(f.calls.accept, 1);
  assert.equal('project' in (receipt ?? {}), false);
  assert.equal(await f.controller.accept('task-1', 5, true), null);
});
test('accept conflict blocks more mutations until refreshed', async () => {
  const f = fixture({
    list: async () => ({ data: [task('ready')] }),
    accept: async () => {
      throw { status: 409, code: 'studio_version_conflict' };
    },
  });
  await f.controller.load();
  await f.controller.accept('task-1', 5, true);
  assert.equal(f.controller.getSnapshot().error, 'conflict');
  await f.controller.cancel('task-1', true);
  assert.equal(f.calls.cancel, 0);
});
test('a ready proposal remains visible when an acceptance response is lost', async () => {
  const f = fixture({
    list: async () => ({ data: [task('ready')] }),
    accept: async () => {
      throw new Error('offline');
    },
  });
  await f.controller.load();
  await f.controller.accept('task-1', 5, true);
  assert.equal(f.controller.getSnapshot().tasks[0].state, 'ready');
  assert.equal(f.controller.getSnapshot().error, 'network');
});
test('cancellation needs confirmation and uses the server terminal state', async () => {
  const f = fixture({ list: async () => ({ data: [task()] }) });
  await f.controller.load();
  assert.equal(await f.controller.cancel('task-1', false), false);
  assert.equal(await f.controller.cancel('other', true), false);
  assert.equal(await f.controller.cancel('task-1', true), true);
  assert.equal(f.controller.getSnapshot().tasks[0].state, 'canceled');
  assert.equal(f.controller.shouldPoll(), false);
});
test('foreign, duplicate, unknown-state and malformed tasks are not displayed', async () => {
  for (const tasks of [
    [{ ...task(), project_id: 'other' }],
    [task(), task()],
    [{ ...task(), state: 'mystery' }],
    [{ ...task('ready'), plan: {} }],
  ]) {
    const f = fixture({
      list: async () => ({ data: tasks as PlanningTask[] }),
    });
    await f.controller.load();
    assert.equal(f.controller.getSnapshot().tasks.length, 0);
    assert.equal(f.controller.getSnapshot().error, 'network');
  }
});
test('empty Go task lists can be null', async () => {
  const f = fixture({ list: async () => ({ data: null }) });
  await f.controller.load();
  assert.deepEqual(f.controller.getSnapshot().tasks, []);
});
test('selection persists when a task list refreshes', async () => {
  const f = fixture({
    list: async () => ({ data: [task('ready', 'a'), task('ready', 'b')] }),
  });
  await f.controller.load();
  f.controller.select('b');
  await f.controller.load();
  assert.equal(f.controller.getSnapshot().selectedID, 'b');
  f.controller.select('missing');
  assert.equal(f.controller.getSnapshot().selectedID, 'b');
});
test('retry commands are isolated by project, account and gateway', () => {
  const saved = storage();
  let n = 0;
  const key = () => `key-${++n}`;
  const journal = new PlanningJournal('a', 'u', saved, key);
  const ticket = journal.begin(request);
  assert.notEqual(
    new PlanningJournal('a', 'other', saved, key).begin(request).key,
    ticket.key,
  );
  assert.notEqual(
    new PlanningJournal('other', 'u', saved, key).begin(request).key,
    ticket.key,
  );
  assert.notEqual(
    journal.begin({ ...request, project_id: 'another' }).key,
    ticket.key,
  );
  assert.throws(() => journal.begin({ ...request, expected_version: 6 }));
  assert.equal(journal.peek('project')?.key, ticket.key);
});
test('an old acknowledgement cannot erase a newer confirmed request', () => {
  const saved = storage();
  let n = 0;
  const journal = new PlanningJournal('a', 'u', saved, () => `key-${++n}`);
  const first = journal.begin(request);
  journal.acknowledge(first);
  const second = journal.begin(request);
  journal.acknowledge(first);
  assert.equal(journal.peek('project')?.key, second.key);
});
test('blocked storage retains in-memory retry safety, without prompt data', () => {
  const denied = () => {
    throw new Error('blocked');
  };
  const journal = new PlanningJournal(
    'api',
    'u',
    { getItem: denied, setItem: denied, removeItem: denied },
    () => 'key',
  );
  const ticket = journal.begin(request);
  assert.deepEqual(journal.peek('project'), ticket);
  journal.acknowledge(ticket);
  assert.equal(journal.peek('project'), null);
});
test('stored tickets are defensively copied and reject extra fields', () => {
  const saved = storage();
  const journal = new PlanningJournal('api', 'u', saved, () => 'key');
  const ticket = journal.begin(request);
  ticket.body.expected_version = 99;
  assert.equal(journal.peek('project')?.body.expected_version, 5);
  const path = [...saved.data.keys()][0];
  saved.data.set(path, JSON.stringify({ ...ticket, prompt: 'not allowed' }));
  assert.equal(new PlanningJournal('api', 'u', saved).peek('project'), null);
});
test('view helpers distinguish planned durations and preserve per-shot wording', () => {
  const p = plan();
  assert.ok(readStoryPlan(p));
  assert.equal(shotPrompt(p.shots[0]), p.shots[0].segments[0].text);
  assert.equal(
    readStoryPlan({ ...p, shots: [{ ...p.shots[0], segments: [null] }] }),
    null,
  );
  assert.equal(readStoryPlan({ ...p, applied_choices: null }), null);
  assert.equal(readStoryPlan(null), null);
  assert.equal(canAcceptPlan(task('ready'), 6), false);
  assert.equal(activePlanningTask(task('running')), true);
});
test('error messages separate quotas from conflicts and cover all terminal states in both languages', () => {
  assert.equal(
    planningFailure({ status: 429, code: 'studio_planning_quota' }),
    'quota',
  );
  assert.equal(
    planningFailure({ status: 409, code: 'studio_planning_pending' }),
    'pending',
  );
  for (const locale of ['en', 'zh'] as const) {
    const t = planningCopy(locale);
    for (const state of [
      'queued',
      'running',
      'ready',
      'failed',
      'interrupted',
      'canceled',
      'stale',
      'accepted',
    ] as const) {
      assert.ok(t(`state_${state}`));
    }
    assert.ok(t('confirm', { version: 42 }).includes('42'));
    assert.ok(t('unknownUsage'));
  }
});
