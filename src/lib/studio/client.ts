import type {
  ChoiceInput,
  CreateInput,
  Discovery,
  DiscoveryInput,
  ForkInput,
  ProjectPage,
  StudioRecord,
  StudioResult,
  StudioTransport,
} from './types';

const root = '/v1/studio';
const projectPath = (id: string) =>
  `${root}/projects/${encodeURIComponent(id)}`;

// Transport is injected so all browser calls reuse api.ts session/CSRF logic,
// while protocol tests run without importing the browser application.
export function createStudioClient(request: StudioTransport) {
  function post<T>(
    path: string,
    body: unknown,
    key?: string,
    signal?: AbortSignal,
  ) {
    return request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: key ? { 'Idempotency-Key': key } : undefined,
      signal,
      cache: 'no-store',
    });
  }
  return {
    discovery(input: DiscoveryInput = {}, signal?: AbortSignal) {
      const query = new URLSearchParams({ limit: '10', familiar_percent: '70' });
      for (const genre of input.genres ?? []) query.append('genre', genre);
      for (const id of input.exclude ?? []) query.append('exclude', id);
      if (input.rotation) query.set('rotation', input.rotation);
      return request<Discovery>(`${root}/discovery?${query}`, {
        signal,
        cache: 'no-store',
      });
    },
    list(after?: string, signal?: AbortSignal) {
      const query = new URLSearchParams({ limit: '12' });
      if (after) query.set('after', after);
      return request<ProjectPage>(`${root}/projects?${query}`, {
        signal,
        cache: 'no-store',
      });
    },
    get(id: string, revision?: number, signal?: AbortSignal) {
      if (
        revision !== undefined &&
        (!Number.isSafeInteger(revision) || revision < 1)
      ) {
        return Promise.reject(new Error('Invalid revision'));
      }
      const suffix = revision === undefined ? '' : `/revisions/${revision}`;
      return request<StudioRecord>(`${projectPath(id)}${suffix}`, {
        signal,
        cache: 'no-store',
      });
    },
    create(input: CreateInput, key: string, signal?: AbortSignal) {
      return post<StudioResult>(`${root}/projects`, input, key, signal);
    },
    next(id: string, version: number, signal?: AbortSignal) {
      return post<StudioResult>(
        `${projectPath(id)}/next-turn`,
        { expected_version: version },
        undefined,
        signal,
      );
    },
    choose(id: string, input: ChoiceInput, signal?: AbortSignal) {
      return post<StudioResult>(
        `${projectPath(id)}/choices`,
        input,
        undefined,
        signal,
      );
    },
    fork(id: string, input: ForkInput, key: string, signal?: AbortSignal) {
      return post<StudioResult>(
        `${projectPath(id)}/forks`,
        input,
        key,
        signal,
      );
    },
  };
}
export type StudioClient = ReturnType<typeof createStudioClient>;
