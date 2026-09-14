import type { StudioClient } from './client';
import type { StudioRecord, StudioResult } from './types';

export type Failure =
  | 'auth'
  | 'forbidden'
  | 'missing'
  | 'conflict'
  | 'quota'
  | 'rate'
  | 'invalid'
  | 'network';

export function failureOf(reason: unknown): Failure {
  const error = reason as { status?: number; code?: string } | null;
  if (error?.status === 401) return 'auth';
  if (error?.status === 403) return 'forbidden';
  if (error?.status === 404) return 'missing';
  if (error?.code === 'studio_project_limit') return 'quota';
  if (error?.status === 409) return 'conflict';
  if (error?.status === 429) return 'rate';
  if (error?.status === 400 || error?.status === 413) return 'invalid';
  return 'network';
}

type State = {
  record: StudioRecord | null;
  busy: boolean;
  error: Failure | null;
  conflict: boolean;
  // A GET has no guide_complete field. Never infer completion from a count.
  complete: boolean | null;
};

// One controller per project/revision. A monotonic epoch prevents late reads,
// writes and StrictMode's abandoned effect from replacing a newer view.
export class ProjectController {
  private state: State = {
    record: null,
    busy: false,
    error: null,
    conflict: false,
    complete: null,
  };
  private epoch = 0;
  private abort?: AbortController;
  private listeners = new Set<() => void>();

  constructor(
    private readonly client: StudioClient,
    readonly id: string,
    readonly revision?: number,
  ) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  dispose() {
    this.epoch += 1;
    this.abort?.abort();
  }

  async load() {
    this.dispose();
    const epoch = this.epoch;
    this.abort = new AbortController();
    this.update({ busy: true, error: null });
    try {
      const record = await this.client.get(
        this.id,
        this.revision,
        this.abort.signal,
      );
      if (epoch !== this.epoch) return;
      this.update({ record, conflict: false, complete: null });
    } catch (reason) {
      if (epoch === this.epoch) this.update({ error: failureOf(reason) });
    } finally {
      if (epoch === this.epoch) this.update({ busy: false });
    }
  }

  next = () => this.mutate();
  choose = (optionID: string) => this.mutate(optionID);

  private async mutate(optionID?: string) {
    const { record, busy, conflict } = this.state;
    if (!record || busy || conflict || this.revision !== undefined) return;
    const project = record.project;
    if (
      optionID !== undefined &&
      !project.pending?.options.some((option) => option.id === optionID)
    ) {
      return;
    }
    const epoch = ++this.epoch;
    this.abort?.abort();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.update({ busy: true, error: null });
    try {
      let result: StudioResult;
      if (optionID !== undefined && project.pending) {
        result = await this.client.choose(
          this.id,
          {
            expected_version: project.version,
            turn_id: project.pending.id,
            option_id: optionID,
          },
          signal,
        );
        if (epoch !== this.epoch) return;
        // Preserve the acknowledged choice even if fetching the next turn fails.
        this.update({ record: result, complete: result.guide_complete });
        if (!result.guide_complete && !result.project.pending) {
          result = await this.client.next(
            this.id,
            result.project.version,
            signal,
          );
        }
      } else {
        result = await this.client.next(this.id, project.version, signal);
      }
      if (epoch !== this.epoch) return;
      this.update({ record: result, complete: result.guide_complete });
    } catch (reason) {
      if (epoch !== this.epoch) return;
      const error = failureOf(reason);
      this.update({ error, conflict: error === 'conflict' });
    } finally {
      if (epoch === this.epoch) this.update({ busy: false });
    }
  }
}

export function parseRevision(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^[1-9]\d*$/.test(value)) return Number.NaN;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : Number.NaN;
}
