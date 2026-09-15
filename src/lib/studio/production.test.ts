import { test } from 'bun:test';
import assert from 'node:assert/strict';
import type { PublicModel } from '../../types';
import {
  createProductionClient,
  type ProductionClient,
} from './productionClient';
import {
  ProductionController,
  productionFailure,
} from './productionController';
import { ProductionJournal } from './productionJournal';
import {
  aggregateRun,
  candidateModels,
  confirmationFor,
  defaultParameters,
  type ExecutionInfo,
  hasActiveShots,
  type ProductionQuote,
  type ProductionRun,
  quoteConsentKey,
  quoteInput,
  quoteUsable,
  readQuote,
  readRun,
  safeMediaURL,
  supportsExecution,
} from './productionTypes';
import type { StudioTransport } from './types';

const info: ExecutionInfo = {
  object: 'studio.execution',
  enabled: true,
  price_kind: 'maximum_charge',
  confirmation_required: true,
  mode: 'text_only',
  composition_enabled: false,
};
const model = {
  id: 'video-test',
  display_name: 'Video test',
  modality: 'video',
  operations: ['generate'],
  request_form: {
    method: 'POST',
    parameters: [
      { name: 'duration', type: 'integer', minimum: 4, maximum: 15 },
      {
        name: 'resolution',
        type: 'string',
        required: true,
        default: '720P',
        enum: ['720P', '1080P'],
      },
      { name: 'audio', type: 'boolean', default: false },
      { name: 'seed', type: 'integer', minimum: -1, maximum: 100 },
      { name: 'n', type: 'integer', default: 4 },
    ],
  },
} as PublicModel;
const input = () => quoteInput('project-1', 8, model, defaultParameters(model));
function quote(): ProductionQuote {
  return {
    id: 'quote-1',
    project_id: 'project-1',
    project_version: 8,
    model: 'video-test',
    currency: 'CNY',
    max_amount: 300,
    price_kind: 'maximum_charge',
    state: 'offered',
    created_at: new Date(Date.now() - 1000).toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    preview: {
      project_id: 'project-1',
      project_version: 8,
      model: 'video-test',
      currency: 'CNY',
      estimated_amount: 300,
      shots: Array.from({ length: 3 }, (_, i) => ({
        id: `shot-${i}`,
        prompt: '客栈，人物回头。',
        edit_duration_ms: 3000,
        generation_duration_ms: 5000,
        estimate: { amount: 100 },
      })),
    },
  };
}
function run(): ProductionRun {
  return {
    id: 'run-1',
    quote_id: 'quote-1',
    project_id: 'project-1',
    project_version: 8,
    currency: 'CNY',
    max_amount: 300,
    state: 'running',
    created_at: new Date().toISOString(),
    items: Array.from({ length: 3 }, (_, i) => ({
      shot_id: `shot-${i}`,
      generation_id: `gen-${i}`,
      max_amount: 100,
      status: 'queued',
      billing_status: 'quoted',
    })),
  };
}
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
function fixture(overrides: Partial<ProductionClient> = {}) {
  const calls: Array<{ kind: string; body: unknown; key: string }> = [];
  const q = quote();
  const r = run();
  const store = storage();
  const journal = new ProductionJournal(
    'https://gateway.test',
    'user-1',
    'project-1',
    store,
  );
  const client: ProductionClient = {
    info: async () => info,
    models: async () => [model],
    list: async () => [],
    getQuote: async () => q,
    getRun: async () => r,
    quote: async (body, key) => {
      calls.push({ kind: 'quote', body, key });
      return q;
    },
    confirm: async (_project, body, key) => {
      calls.push({ kind: 'confirm', body, key });
      return r;
    },
    artifacts: async () => [],
    ...overrides,
  };
  let counter = 0;
  const controller = new ProductionController(
    client,
    journal,
    'project-1',
    () => `key-${++counter}`,
  );
  return { controller, client, calls, q, r, journal, store };
}

test('production capability rejects estimates and unknown consent terms', () => {
  assert(supportsExecution(info));
  for (const patch of [
    { enabled: false },
    { price_kind: 'estimate' },
    { confirmation_required: false },
    { mode: 'new_mode' },
  ])
    assert(!supportsExecution({ ...info, ...patch }));
});
test('quote retains generated duration rather than edit duration for display', () => {
  const q = readQuote(quote(), 'project-1');
  assert.equal(q.preview.shots[0].generation_duration_ms, 5000);
  assert.equal(q.preview.shots[0].edit_duration_ms, 3000);
});
for (const [name, mutate] of [
  [
    'unsafe money',
    (q: ProductionQuote) => {
      q.max_amount = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'negative amount',
    (q: ProductionQuote) => {
      q.max_amount = -1;
    },
  ],
  [
    'fractional amount',
    (q: ProductionQuote) => {
      q.max_amount = 1.5;
    },
  ],
  [
    'wrong currency',
    (q: ProductionQuote) => {
      q.preview.currency = 'USD';
    },
  ],
  [
    'wrong version',
    (q: ProductionQuote) => {
      q.preview.project_version++;
    },
  ],
  [
    'duplicate shot',
    (q: ProductionQuote) => {
      q.preview.shots[1].id = q.preview.shots[0].id;
    },
  ],
  [
    'wrong sum',
    (q: ProductionQuote) => {
      q.preview.shots[0].estimate.amount++;
    },
  ],
  [
    'invalid date',
    (q: ProductionQuote) => {
      q.expires_at = 'never';
    },
  ],
  [
    'unbound used offer',
    (q: ProductionQuote) => {
      q.state = 'used';
    },
  ],
] as const)
  test(`quote rejects ${name}`, () => {
    const q = quote();
    mutate(q);
    assert.throws(() => readQuote(q, 'project-1'));
  });
test('quote rejects cross-project replies and standalone estimates', () => {
  assert.throws(() => readQuote(quote(), 'other'));
  assert.throws(() =>
    readQuote({ ...quote(), price_kind: 'estimate' }, 'project-1'),
  );
});
test('expired and old-version quotes are not new authorizations', () => {
  const q = quote();
  assert(quoteUsable(q, 8));
  assert(!quoteUsable(q, 9));
  assert(!quoteUsable(q, 8, Date.parse(q.expires_at)));
  assert(!quoteUsable({ ...q, state: 'used', run_id: 'run-1' }, 8));
});
test('consent is bound to identity, version, currency, amount and expiry', () => {
  const q = quote();
  const key = quoteConsentKey(q);
  for (const patch of [
    { id: 'other' },
    { project_version: 9 },
    { currency: 'USD' },
    { max_amount: 301 },
    { expires_at: '2099-01-01T00:00:00Z' },
  ])
    assert.notEqual(quoteConsentKey({ ...q, ...patch }), key);
  assert.deepEqual(confirmationFor(q), {
    quote_id: 'quote-1',
    expected_version: 8,
    approved_max_amount: 300,
    confirm_generation: true,
  });
});
test('run unknown charge stays absent, zero is retained', () => {
  const r = run();
  r.items[1].final_amount = 0;
  const read = readRun(r, 'project-1');
  assert.equal(read.items[0].final_amount, undefined);
  assert.equal(read.items[1].final_amount, 0);
});
test('run validates cap, identifiers and aggregate state', () => {
  const r = run();
  r.items[0].final_amount = 101;
  assert.throws(() => readRun(r, 'project-1'));
  r.items[0].final_amount = 10;
  r.state = 'completed';
  assert.throws(() => readRun(r, 'project-1'));
  r.state = 'running';
  r.items[1].generation_id = r.items[0].generation_id;
  assert.throws(() => readRun(r, 'project-1'));
});
test('unknown plus active shots keeps polling without enabling a new batch', () => {
  const r = run();
  r.items[0].status = 'submission_unknown';
  r.state = aggregateRun(r.items);
  assert.equal(r.state, 'blocked_unknown');
  assert(hasActiveShots(readRun(r, 'project-1')));
  r.items.slice(1).forEach((i) => {
    i.status = 'failed';
  });
  assert(!hasActiveShots(r));
});
test('aggregation distinguishes partial, cancelled, failure and completion', () => {
  const r = run();
  r.items.forEach((i) => {
    i.status = 'completed';
  });
  assert.equal(aggregateRun(r.items), 'completed');
  r.items[0].status = 'failed';
  assert.equal(aggregateRun(r.items), 'partial');
  r.items.forEach((i) => {
    i.status = 'cancelled';
  });
  assert.equal(aggregateRun(r.items), 'cancelled');
  r.items[0].status = 'failed';
  assert.equal(aggregateRun(r.items), 'failed');
});
test('model settings preserve false and force single output without client duration', () => {
  assert.deepEqual(input().parameters, {
    resolution: '720P',
    audio: false,
    n: 1,
  });
  assert(!('duration' in input().parameters));
  assert.equal(candidateModels([model]).length, 1);
  assert.equal(candidateModels([{ ...model, modality: 'image' }]).length, 0);
});
test('invalid integer, enum and boolean do not silently coerce', () => {
  for (const values of [
    { seed: '1.2' },
    { seed: '1e2' },
    { seed: '101' },
    { resolution: 'bad' },
    { audio: 'yes' },
  ])
    assert.throws(() =>
      quoteInput('project-1', 8, model, {
        ...defaultParameters(model),
        ...values,
      }),
    );
});
test('media links reject unsafe schemes and credentials', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:video/mp4,x',
    '//evil.test/x',
    'https://u:p@cdn.test/x',
    '/v1/admin/users',
    ' https://cdn.test/x',
  ])
    assert.equal(safeMediaURL(value, 'https://gw.test'), null);
  assert.equal(
    safeMediaURL('/media/x', 'https://gw.test'),
    'https://gw.test/media/x',
  );
  assert.equal(
    safeMediaURL('https://cdn.test/x', 'https://gw.test'),
    'https://cdn.test/x',
  );
});
test('journal scopes user, gateway and project', () => {
  const s = storage();
  const a = new ProductionJournal('g', 'a', 'p', s);
  a.write({ version: 1, quoteID: 'q' });
  for (const parts of [
    ['g', 'b', 'p'],
    ['other', 'a', 'p'],
    ['g', 'a', 'other'],
  ])
    assert.equal(
      new ProductionJournal(parts[0], parts[1], parts[2], s).read().quoteID,
      undefined,
    );
});
test('journal rejects corrupted and spending-body injection', () => {
  const s = storage();
  const j = new ProductionJournal('g', 'u', 'project-1', s);
  j.write({ version: 1 });
  const key = [...s.values.keys()][0];
  s.values.set(key, '{');
  assert.throws(() => j.read());
  s.values.set(
    key,
    JSON.stringify({
      version: 1,
      pending: {
        kind: 'confirm',
        key: 'k',
        body: { ...confirmationFor(quote()), prompt: 'inject' },
      },
    }),
  );
  assert.throws(() => j.read());
});
test('load never creates a quote or spends', async () => {
  const f = fixture();
  await f.controller.load();
  assert.equal(f.calls.length, 0);
});
test('quote does not confirm automatically', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.requestQuote(input());
  assert.deepEqual(
    f.calls.map((c) => c.kind),
    ['quote'],
  );
  assert.equal(f.journal.read().quoteID, 'quote-1');
  assert.equal(f.journal.read().pending, undefined);
});
test('disabled backend blocks both quote and confirmation', async () => {
  const f = fixture({ info: async () => ({ ...info, enabled: false }) });
  await f.controller.load();
  await f.controller.requestQuote(input());
  await f.controller.confirm(8, 'anything');
  assert.equal(f.calls.length, 0);
});
test('confirmation requires exact consent and current version', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.requestQuote(input());
  await f.controller.confirm(8, null);
  await f.controller.confirm(9, quoteConsentKey(f.q));
  assert.equal(f.calls.length, 1);
  await f.controller.confirm(8, quoteConsentKey(f.q));
  assert.equal(f.calls.length, 2);
  assert.equal(f.controller.getSnapshot().runs[0].id, 'run-1');
  await f.controller.confirm(8, quoteConsentKey(f.q));
  assert.equal(f.calls.length, 2);
});
test('double click enters one synchronous mutation', async () => {
  let finish: ((q: ProductionQuote) => void) | undefined;
  let count = 0;
  const f = fixture({
    quote: async () => {
      count++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  await f.controller.load();
  const one = f.controller.requestQuote(input());
  const two = f.controller.requestQuote(input());
  assert.equal(count, 1);
  finish?.(f.q);
  await Promise.all([one, two]);
});
test('interrupted confirmation is saved before POST, not resent on reload', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.requestQuote(input());
  f.client.confirm = async () => {
    assert.equal(f.journal.read().pending?.kind, 'confirm');
    throw new Error('offline');
  };
  await f.controller.confirm(8, quoteConsentKey(f.q));
  const pending = f.journal.read().pending;
  assert.equal(pending?.kind, 'confirm');
  const next = new ProductionController(f.client, f.journal, 'project-1');
  await next.load();
  assert.deepEqual(next.getSnapshot().pending, pending);
  let confirmed = 0;
  f.client.confirm = async (_p, body, key) => {
    confirmed++;
    assert.deepEqual(body, pending?.body);
    assert.equal(key, pending?.key);
    return f.r;
  };
  await next.retryConfirmation(false);
  assert.equal(confirmed, 0);
  await next.retryConfirmation(true);
  assert.equal(confirmed, 1);
});
test('used quote recovery is GET-only and finds original run', async () => {
  const f = fixture();
  f.q.state = 'used';
  f.q.run_id = f.r.id;
  f.journal.write({
    version: 1,
    quoteID: f.q.id,
    pending: { kind: 'confirm', key: 'old', body: confirmationFor(f.q) },
  });
  await f.controller.load();
  assert.equal(f.calls.length, 0);
  assert.equal(f.controller.getSnapshot().runs[0].id, f.r.id);
  assert.equal(f.journal.read().pending, undefined);
});
test('a malformed run cannot acknowledge the saved spending ticket', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.requestQuote(input());
  f.client.confirm = async () => ({ ...f.r, currency: 'USD' });
  await f.controller.confirm(8, quoteConsentKey(f.q));
  assert.equal(f.controller.getSnapshot().error, 'protocol');
  assert.equal(f.journal.read().pending?.kind, 'confirm');
});
test('insufficient funds is a refusal, not a zero-cost successful batch', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.requestQuote(input());
  f.client.confirm = async () => {
    throw { status: 402, code: 'insufficient_funds' };
  };
  await f.controller.confirm(8, quoteConsentKey(f.q));
  assert.equal(f.controller.getSnapshot().error, 'funds');
  assert.equal(f.controller.getSnapshot().runs.length, 0);
  assert.equal(f.journal.read().pending, undefined);
});
test('changed or expired quote can be refreshed without preserving an impossible mutation', async () => {
  for (const code of ['studio_quote_changed', 'studio_quote_expired']) {
    const f = fixture();
    await f.controller.load();
    await f.controller.requestQuote(input());
    f.client.confirm = async () => {
      throw { status: 409, code };
    };
    await f.controller.confirm(8, quoteConsentKey(f.q));
    assert.equal(f.journal.read().pending, undefined);
    assert.equal(f.controller.getSnapshot().runs.length, 0);
  }
});
test('dispose fences late write acknowledgement and retains recovery ticket', async () => {
  let finish: ((q: ProductionQuote) => void) | undefined;
  const f = fixture({
    quote: async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await f.controller.load();
  const pending = f.controller.requestQuote(input());
  f.controller.dispose();
  finish?.(f.q);
  await pending;
  assert.equal(f.controller.getSnapshot().quote, null);
  assert.equal(f.journal.read().pending?.kind, 'quote');
  await f.controller.load();
  assert.equal(f.controller.getSnapshot().pending?.kind, 'quote');
});
test('storage failure prevents any POST, including quote', async () => {
  const f = fixture();
  const j = new ProductionJournal('g', 'u', 'project-1');
  const c = new ProductionController(f.client, j, 'project-1');
  await c.load();
  await c.requestQuote(input());
  assert.equal(c.getSnapshot().error, 'storage');
  assert.equal(f.calls.length, 0);
});
test('a throwing storage write never submits a new quote', async () => {
  const f = fixture();
  await f.controller.load();
  f.store.setItem = () => {
    throw new Error('quota');
  };
  await f.controller.requestQuote(input());
  assert.equal(f.calls.length, 0);
  assert.equal(f.controller.getSnapshot().error, 'storage');
});
test('active and unknown batches block new purchases', async () => {
  const r = run();
  r.items[0].status = 'submission_unknown';
  r.state = 'blocked_unknown';
  const f = fixture({ list: async () => [r] });
  await f.controller.load();
  await f.controller.requestQuote(input());
  assert.equal(f.calls.length, 0);
});
test('read errors stop polling and do not become a generation retry', async () => {
  let reads = 0;
  const f = fixture({
    list: async () => [run()],
    getRun: async () => {
      reads++;
      throw new Error('offline');
    },
  });
  await f.controller.load();
  await f.controller.poll();
  await f.controller.poll();
  assert.equal(reads, 1);
  assert.equal(f.calls.length, 0);
});
test('terminal batches do not poll', async () => {
  const r = run();
  r.items.forEach((i) => {
    i.status = 'completed';
  });
  r.state = 'completed';
  let reads = 0;
  const f = fixture({
    list: async () => [r],
    getRun: async () => {
      reads++;
      return r;
    },
  });
  await f.controller.load();
  await f.controller.poll();
  assert.equal(reads, 0);
});
test('protocol client uses only supported endpoints and exact confirmation body', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const transport: StudioTransport = async <T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> => {
    calls.push({ path, init });
    return (path.endsWith('/quotes') ? quote() : run()) as T;
  };
  const client = createProductionClient(transport);
  await client.quote(input(), 'quote-key');
  await client.confirm('project-1', confirmationFor(quote()), 'run-key');
  assert.equal(calls[0].path, '/v1/studio/production/quotes');
  assert.equal(calls[1].path, '/v1/studio/production/runs');
  assert.deepEqual(
    JSON.parse(String(calls[1].init?.body)),
    confirmationFor(quote()),
  );
  assert.equal(
    new Headers(calls[1].init?.headers).get('Idempotency-Key'),
    'run-key',
  );
  assert(calls.every((c) => c.init?.cache === 'no-store'));
});
test('list supports the server null empty slice without inventing runs', async () => {
  const transport: StudioTransport = async <T>(): Promise<T> =>
    ({ data: null, limit: 20 }) as T;
  assert.deepEqual(
    await createProductionClient(transport).list('project-1'),
    [],
  );
});
test('error copy distinguishes uncertain network, protocol and insufficient funds', () => {
  assert.equal(productionFailure(new Error('offline')), 'network');
  assert.equal(productionFailure(new Error('production_protocol')), 'protocol');
  assert.equal(productionFailure({ status: 402 }), 'funds');
});
test('free-text prompts and credential parameters are not editable or journaled', () => {
  const m = structuredClone(model);
  m.request_form?.parameters?.push(
    {
      name: 'negative_prompt',
      pointer: '/negative',
      type: 'string',
      default: 'private',
    },
    {
      name: 'api_key',
      pointer: '/key',
      type: 'string',
      enum: ['secret'],
      default: 'secret',
    },
  );
  assert(!('negative_prompt' in defaultParameters(m)));
  assert(!('api_key' in defaultParameters(m)));
});

test('missing collected quote clears only a non-pending bookmark', async () => {
  const f = fixture({
    getQuote: async () => {
      throw { status: 404, code: 'not_found' };
    },
  });
  f.journal.write({ version: 1, quoteID: 'expired-quote' });
  await f.controller.load();
  assert.equal(f.controller.getSnapshot().error, null);
  assert.equal(f.journal.read().quoteID, undefined);
  assert.equal(f.calls.length, 0);
});
test('missing uncertain confirmation never clears its authorization ticket', async () => {
  const f = fixture({
    getQuote: async () => {
      throw { status: 404, code: 'not_found' };
    },
  });
  f.journal.write({
    version: 1,
    quoteID: f.q.id,
    pending: { kind: 'confirm', key: 'original', body: confirmationFor(f.q) },
  });
  await f.controller.load();
  assert.equal(f.controller.getSnapshot().error, 'missing');
  assert.equal(f.journal.read().pending?.kind, 'confirm');
  assert.equal(f.calls.length, 0);
});
test('normalized media paths cannot leave the media namespace', () => {
  for (const value of [
    '/media/../v1/auth/me',
    '/media/%2e%2e/v1/auth/me',
    '/media/foo%2f..%2f..%2fv1/auth/me',
  ])
    assert.equal(safeMediaURL(value, 'https://gw.test'), null);
});
test('read failure blocks a fresh purchase even when old capabilities remain', async () => {
  const f = fixture();
  await f.controller.load();
  f.client.list = async () => {
    throw new Error('offline');
  };
  await f.controller.load();
  await f.controller.requestQuote(input());
  assert.equal(f.calls.length, 0);
});

test('a refused recovery does not erase an unresolved original confirmation', async () => {
  for (const status of [401, 403, 402, 409, 429]) {
    const f = fixture();
    await f.controller.load();
    await f.controller.requestQuote(input());
    f.client.confirm = async () => {
      throw new Error('response lost');
    };
    await f.controller.confirm(8, quoteConsentKey(f.q));
    const original = f.journal.read().pending;
    f.client.confirm = async () => {
      throw { status, code: 'refused' };
    };
    await f.controller.retryConfirmation(true);
    assert.deepEqual(f.journal.read().pending, original);
    assert.equal(f.controller.getSnapshot().runs.length, 0);
  }
});
