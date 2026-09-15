import type { PublicModel } from '../../types';
import { isObject, protocolFailure, readExecution, readQuote, readRun, type Confirmation, type QuoteInput, type ShotArtifact } from './productionTypes';
import type { StudioTransport } from './types';

const root = '/v1/studio/production';
const segment = encodeURIComponent;
/** All requests retain the existing account gate, cookie and CSRF semantics. */
export function createProductionClient(request: StudioTransport) {
  const get = (path: string, signal?: AbortSignal) => request<unknown>(path, { signal, cache: 'no-store' });
  const post = (path: string, body: object, key: string, signal?: AbortSignal) =>
    request<unknown>(path, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body), signal, cache: 'no-store' });
  return {
    info: async (signal?: AbortSignal) => readExecution(await get(`${root}/execution`, signal)),
    models: async (signal?: AbortSignal) => {
      const value = await get('/v1/models?omit=notes', signal);
      if (!isObject(value) || !Array.isArray(value.data)) return protocolFailure();
      return value.data as PublicModel[];
    },
    quote: async (body: QuoteInput, key: string, signal?: AbortSignal) => {
      const q = readQuote(await post(`${root}/quotes`, body, key, signal), body.project_id);
      if (q.project_version !== body.expected_version || q.model !== body.model) return protocolFailure();
      return q;
    },
    getQuote: async (id: string, project: string, signal?: AbortSignal) => {
      const q = readQuote(await get(`${root}/quotes/${segment(id)}`, signal), project);
      if (q.id !== id) return protocolFailure();
      return q;
    },
    confirm: async (project: string, body: Confirmation, key: string, signal?: AbortSignal) => {
      const run = readRun(await post(`${root}/runs`, body, key, signal), project);
      if (run.quote_id !== body.quote_id || run.project_version !== body.expected_version || run.max_amount !== body.approved_max_amount) return protocolFailure();
      return run;
    },
    getRun: async (id: string, project: string, signal?: AbortSignal) => {
      const run = readRun(await get(`${root}/runs/${segment(id)}`, signal), project);
      if (run.id !== id) return protocolFailure();
      return run;
    },
    list: async (project: string, signal?: AbortSignal) => {
      const v = await get(`${root}/projects/${segment(project)}/runs`, signal);
      if (!isObject(v) || v.limit !== 20 || (v.data !== null && !Array.isArray(v.data))) return protocolFailure();
      const items: unknown[] = v.data === null ? [] : v.data as unknown[];
      if (items.length > 20) return protocolFailure();
      const runs = items.map((r) => readRun(r, project));
      if (new Set(runs.map((r) => r.id)).size !== runs.length) return protocolFailure();
      return runs;
    },
    artifacts: async (generation: string, signal?: AbortSignal) => {
      const v = await get(`/v1/generations/${segment(generation)}/artifacts`, signal);
      if (!isObject(v) || !Array.isArray(v.data) || v.data.length > 16) return protocolFailure();
      return v.data.filter((a): a is ShotArtifact => isObject(a) && typeof a.id === 'string' &&
        a.generation_id === generation && typeof a.mime_type === 'string' && a.mime_type.startsWith('video/') && typeof a.url === 'string');
    },
  };
}
export type ProductionClient = ReturnType<typeof createProductionClient>;
