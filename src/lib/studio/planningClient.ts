import type {
  PlanningInfo,
  PlanningReceipt,
  PlanningRequest,
  PlanningTask,
} from './planningTypes';
import type { StudioTransport } from './types';

const root = '/v1/studio/planning';
const taskPath = (id: string) => `${root}/tasks/${encodeURIComponent(id)}`;

/** Reuses the account-bound Studio transport and its existing CSRF handling. */
export function createPlanningClient(request: StudioTransport) {
  const get = <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { signal, cache: 'no-store' });
  const post = <T>(
    path: string,
    body: object,
    signal?: AbortSignal,
    key?: string,
  ) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: key ? { 'Idempotency-Key': key } : undefined,
      signal,
      cache: 'no-store',
    });
  return {
    info: (signal?: AbortSignal) => get<PlanningInfo>(root, signal),
    list: (projectID: string, signal?: AbortSignal) =>
      get<{ data: PlanningTask[] | null }>(
        `${root}/projects/${encodeURIComponent(projectID)}/tasks`,
        signal,
      ),
    get: (id: string, signal?: AbortSignal) =>
      get<PlanningTask>(taskPath(id), signal),
    enqueue: (body: PlanningRequest, key: string, signal?: AbortSignal) =>
      post<PlanningTask>(`${root}/tasks`, body, signal, key),
    accept: (id: string, inputVersion: number, signal?: AbortSignal) =>
      post<PlanningReceipt>(
        `${taskPath(id)}/accept`,
        { expected_version: inputVersion },
        signal,
      ),
    cancel: (id: string, signal?: AbortSignal) =>
      post<PlanningTask>(`${taskPath(id)}/cancel`, {}, signal),
  };
}
export type PlanningClient = ReturnType<typeof createPlanningClient>;
