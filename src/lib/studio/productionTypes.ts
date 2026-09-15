import type { FormParameter, PublicModel } from '../../types';

export type ExecutionInfo = {
  object: string;
  enabled: boolean;
  price_kind: string;
  confirmation_required: boolean;
  mode: string;
  composition_enabled: boolean;
};
export type QuoteInput = {
  project_id: string;
  expected_version: number;
  model: string;
  parameters: Record<string, string | number | boolean>;
};
export type Confirmation = {
  quote_id: string;
  expected_version: number;
  approved_max_amount: number;
  confirm_generation: true;
};
export type QuotedShot = {
  id: string;
  prompt: string;
  edit_duration_ms: number;
  generation_duration_ms: number;
  estimate: { amount: number };
};
export type ProductionQuote = {
  id: string;
  project_id: string;
  project_version: number;
  model: string;
  currency: string;
  max_amount: number;
  price_kind: 'maximum_charge';
  state: 'offered' | 'expired' | 'used';
  created_at: string;
  expires_at: string;
  run_id?: string;
  preview: {
    project_id: string;
    project_version: number;
    model: string;
    currency: string;
    estimated_amount: number;
    shots: QuotedShot[];
  };
};
export type RunItem = {
  shot_id: string;
  generation_id: string;
  max_amount: number;
  status: string;
  billing_status: string;
  final_amount?: number;
  error_code?: string;
};
export type ProductionRun = {
  id: string;
  quote_id: string;
  project_id: string;
  project_version: number;
  currency: string;
  max_amount: number;
  state: string;
  created_at: string;
  items: RunItem[];
};
export type ShotArtifact = {
  id: string;
  generation_id: string;
  mime_type: string;
  url: string;
};
export const maxProductionAmount = 100_000_000;
export const validID = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 128 && v.trim() === v;
export const validVersion = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 2;
export const validAmount = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  v <= maxProductionAmount;
export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const currency = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const date = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
const duration = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 15_000;
const unique = (ids: string[]) => new Set(ids).size === ids.length;
export function protocolFailure(): never {
  throw new Error('production_protocol');
}

export function readExecution(value: unknown): ExecutionInfo {
  if (
    !isObject(value) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.price_kind !== 'string' ||
    typeof value.confirmation_required !== 'boolean' ||
    typeof value.mode !== 'string' ||
    typeof value.composition_enabled !== 'boolean' ||
    value.object !== 'studio.execution'
  )
    return protocolFailure();
  return value as ExecutionInfo;
}
export function supportsExecution(info: ExecutionInfo | null): boolean {
  return (
    !!info?.enabled &&
    info.price_kind === 'maximum_charge' &&
    info.confirmation_required &&
    info.mode === 'text_only'
  );
}
/** Validate the spending contract, not merely a TypeScript assertion. */
export function readQuote(value: unknown, projectID: string): ProductionQuote {
  if (
    !isObject(value) ||
    !validID(value.id) ||
    value.project_id !== projectID ||
    !validVersion(value.project_version) ||
    !validID(value.model) ||
    !currency(value.currency) ||
    !validAmount(value.max_amount) ||
    value.price_kind !== 'maximum_charge' ||
    !['offered', 'expired', 'used'].includes(String(value.state)) ||
    !date(value.created_at) ||
    !date(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.created_at) ||
    (value.run_id !== undefined && !validID(value.run_id)) ||
    (value.state === 'used') !== (value.run_id !== undefined) ||
    !isObject(value.preview)
  )
    return protocolFailure();
  const p = value.preview;
  if (
    p.project_id !== projectID ||
    p.project_version !== value.project_version ||
    p.model !== value.model ||
    p.currency !== value.currency ||
    p.estimated_amount !== value.max_amount ||
    !Array.isArray(p.shots) ||
    p.shots.length < 3 ||
    p.shots.length > 5
  )
    return protocolFailure();
  let total = 0;
  const ids: string[] = [];
  for (const s of p.shots) {
    if (
      !isObject(s) ||
      !validID(s.id) ||
      typeof s.prompt !== 'string' ||
      !s.prompt.trim() ||
      s.prompt.length > 100_000 ||
      !duration(s.edit_duration_ms) ||
      !duration(s.generation_duration_ms) ||
      s.edit_duration_ms > s.generation_duration_ms ||
      !isObject(s.estimate) ||
      !validAmount(s.estimate.amount)
    )
      return protocolFailure();
    ids.push(s.id);
    total += s.estimate.amount;
  }
  if (!unique(ids) || total !== value.max_amount) return protocolFailure();
  return value as ProductionQuote;
}
const activeStatuses = new Set([
  'queued',
  'submitting',
  'submitted',
  'in_progress',
  'cancel_requested',
]);
export function hasActiveShots(run: ProductionRun): boolean {
  return run.items.some((i) => activeStatuses.has(i.status));
}
export function blocksNewRun(run: ProductionRun): boolean {
  return ['running', 'blocked_unknown', 'invalid'].includes(run.state);
}
export function aggregateRun(items: RunItem[]): string {
  if (!items.length) return 'invalid';
  if (items.some((i) => i.status === 'submission_unknown'))
    return 'blocked_unknown';
  if (
    items.some(
      (i) =>
        !activeStatuses.has(i.status) &&
        !['completed', 'failed', 'cancelled'].includes(i.status),
    )
  )
    return 'invalid';
  if (items.some((i) => activeStatuses.has(i.status))) return 'running';
  if (items.every((i) => i.status === 'completed')) return 'completed';
  if (items.some((i) => i.status === 'completed')) return 'partial';
  if (items.every((i) => i.status === 'cancelled')) return 'cancelled';
  return 'failed';
}
export function readRun(value: unknown, projectID: string): ProductionRun {
  if (
    !isObject(value) ||
    !validID(value.id) ||
    !validID(value.quote_id) ||
    value.project_id !== projectID ||
    !validVersion(value.project_version) ||
    !currency(value.currency) ||
    !validAmount(value.max_amount) ||
    !date(value.created_at) ||
    !Array.isArray(value.items) ||
    value.items.length < 3 ||
    value.items.length > 5
  )
    return protocolFailure();
  let total = 0;
  const shots: string[] = [],
    jobs: string[] = [];
  for (const i of value.items) {
    if (
      !isObject(i) ||
      !validID(i.shot_id) ||
      !validID(i.generation_id) ||
      !validAmount(i.max_amount) ||
      typeof i.status !== 'string' ||
      typeof i.billing_status !== 'string' ||
      (i.final_amount !== undefined &&
        (!validAmount(i.final_amount) || i.final_amount > i.max_amount))
    )
      return protocolFailure();
    total += i.max_amount;
    shots.push(i.shot_id);
    jobs.push(i.generation_id);
  }
  if (
    !unique(shots) ||
    !unique(jobs) ||
    total !== value.max_amount ||
    aggregateRun(value.items as RunItem[]) !== value.state
  )
    return protocolFailure();
  return value as ProductionRun;
}
export function quoteUsable(
  q: ProductionQuote | null,
  version: number,
  now = Date.now(),
): q is ProductionQuote {
  return (
    !!q &&
    q.state === 'offered' &&
    q.project_version === version &&
    Date.parse(q.expires_at) > now
  );
}
export function confirmationFor(q: ProductionQuote): Confirmation {
  return {
    quote_id: q.id,
    expected_version: q.project_version,
    approved_max_amount: q.max_amount,
    confirm_generation: true,
  };
}
export const quoteConsentKey = (q: ProductionQuote) =>
  JSON.stringify([
    q.id,
    q.project_version,
    q.currency,
    q.max_amount,
    q.expires_at,
  ]);
export function candidateModels(models: PublicModel[]): PublicModel[] {
  return models.filter(
    (m) =>
      m.modality === 'video' &&
      m.operations.includes('generate') &&
      m.request_form?.method === 'POST' &&
      m.request_form.parameters?.some(
        (p) => p.name === 'duration' && p.type === 'integer' && !p.enum?.length,
      ),
  );
}
export function editableParameters(model?: PublicModel): FormParameter[] {
  return (
    model?.request_form?.parameters?.filter(
      (p) =>
        !['duration', 'n'].includes(p.name) &&
        !/prompt|text|url|token|key|password/i.test(p.name) &&
        (p.type !== 'string' || !!p.enum?.length),
    ) ?? []
  );
}
export function defaultParameters(model?: PublicModel): Record<string, string> {
  return Object.fromEntries(
    editableParameters(model).flatMap((p) =>
      ['string', 'number', 'boolean'].includes(typeof p.default)
        ? [[p.name, String(p.default)]]
        : [],
    ),
  );
}
export function quoteInput(
  projectID: string,
  version: number,
  model: PublicModel,
  values: Record<string, string>,
): QuoteInput {
  if (!validID(projectID) || !validVersion(version))
    throw new Error('invalid_settings');
  const parameters: QuoteInput['parameters'] = {};
  for (const p of editableParameters(model)) {
    const raw = values[p.name];
    if (raw === undefined || raw === '') {
      if (p.required && p.default == null) throw new Error('invalid_settings');
      continue;
    }
    let value: string | boolean | number = raw;
    if (p.type === 'boolean') {
      if (raw !== 'true' && raw !== 'false')
        throw new Error('invalid_settings');
      value = raw === 'true';
    } else if (p.type === 'integer') {
      if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
        throw new Error('invalid_settings');
      value = Number(raw);
    } else if (p.type !== 'string') throw new Error('invalid_settings');
    if (p.enum?.length && !p.enum.includes(String(value)))
      throw new Error('invalid_settings');
    if (
      typeof value === 'number' &&
      ((p.minimum !== undefined && value < p.minimum) ||
        (p.maximum !== undefined && value > p.maximum))
    )
      throw new Error('invalid_settings');
    if (['__proto__', 'constructor', 'prototype'].includes(p.name))
      throw new Error('invalid_settings');
    parameters[p.name] = value;
  }
  if (model.request_form?.parameters?.some((p) => p.name === 'n'))
    parameters.n = 1;
  return {
    project_id: projectID,
    expected_version: version,
    model: model.id,
    parameters,
  };
}
/** Only media links from authenticated artifact reads are rendered; never provider errors. */
export function safeMediaURL(value: string, gateway: string): string | null {
  try {
    if (!value || value.trim() !== value || value.startsWith('//')) return null;
    const relative = value.startsWith('/media/');
    if (!relative && !value.startsWith('https://')) return null;
    const url = new URL(value, `${gateway}/`);
    if (
      relative &&
      (url.origin !== new URL(gateway).origin ||
        !url.pathname.startsWith('/media/') ||
        /%2f|%5c/i.test(url.pathname))
    )
      return null;
    if (
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(
          relative &&
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname)
        ))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
