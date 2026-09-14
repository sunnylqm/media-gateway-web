import { readStoryPlan } from './planView';
import type { PlanningClient } from './planningClient';
import { type PlanningJournal, type PlanningTicket } from './planningJournal';
import {
  activePlanningTask,
  canAcceptPlan,
  type PlanningInfo,
  type PlanningTask,
  supportedPlanning,
} from './planningTypes';

export type PlanningFailure =
  | 'auth'
  | 'forbidden'
  | 'disabled'
  | 'quota'
  | 'pending'
  | 'conflict'
  | 'notReady'
  | 'missing'
  | 'rate'
  | 'invalid'
  | 'network';
export function planningFailure(reason: unknown): PlanningFailure {
  const e = reason as { status?: number; code?: string } | null;
  if (e?.code === 'studio_planning_disabled') return 'disabled';
  if (e?.code === 'studio_planning_quota') return 'quota';
  if (e?.code === 'studio_planning_pending') return 'pending';
  if (e?.code === 'studio_plan_not_ready') return 'notReady';
  if (e?.status === 401) return 'auth';
  if (e?.status === 403) return 'forbidden';
  if (e?.status === 404) return 'missing';
  if (e?.status === 409) return 'conflict';
  if (e?.status === 429) return 'rate';
  if (e?.status === 400 || e?.status === 413) return 'invalid';
  return 'network';
}

type State = {
  info: PlanningInfo | null;
  tasks: PlanningTask[];
  selectedID: string | null;
  busy: boolean;
  mutation: 'enqueue' | 'accept' | 'cancel' | null;
  error: PlanningFailure | null;
  pending: PlanningTicket | null;
};

/**
 * Per-project, account-bound proposal lifecycle. Reads never submit work; every
 * write requires a separate user action. One request epoch prevents stale reads,
 * StrictMode cleanup and canceled mutations from overwriting a newer view.
 */
export class PlanningController {
  private state: State;
  private epoch = 0;
  private abort?: AbortController;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly client: PlanningClient,
    private readonly journal: PlanningJournal,
    readonly projectID: string,
  ) {
    this.state = {
      info: null,
      tasks: [],
      selectedID: null,
      busy: false,
      mutation: null,
      error: null,
      pending: journal.peek(projectID),
    };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private begin() {
    this.abort?.abort();
    this.abort = new AbortController();
    this.disposed = false;
    return { epoch: ++this.epoch, signal: this.abort.signal };
  }
  private current(epoch: number) {
    return !this.disposed && epoch === this.epoch;
  }

  select(id: string) {
    if (this.state.tasks.some((task) => task.id === id)) {
      this.update({ selectedID: id });
    }
  }

  // Only queued/running tasks justify automatic read polling. Errors stop it.
  shouldPoll() {
    return (
      !this.disposed &&
      !this.state.error &&
      !this.state.busy &&
      !this.state.mutation &&
      this.state.tasks.some(activePlanningTask)
    );
  }

  async load() {
    if (this.state.mutation) return;
    const { epoch, signal } = this.begin();
    this.update({ busy: true, error: null });
    try {
      const info = await this.client.info(signal);
      if (!this.current(epoch)) return;
      if (!info.enabled) {
        this.update({ info, tasks: [], selectedID: null });
        return;
      }
      const result = await this.client.list(this.projectID, signal);
      if (!this.current(epoch)) return;
      // Go may encode an empty collection as null. Never mix another project in.
      const tasks = this.projectTasks(result.data ?? []);
      const selectedID = tasks.some((task) => task.id === this.state.selectedID)
        ? this.state.selectedID
        : (tasks[0]?.id ?? null);
      this.update({ info, tasks, selectedID });
    } catch (reason) {
      if (this.current(epoch)) this.update({ error: planningFailure(reason) });
    } finally {
      if (this.current(epoch)) {
        this.update({ busy: false, pending: this.journal.peek(this.projectID) });
      }
    }
  }

  async poll() {
    if (!this.shouldPoll()) return;
    const { epoch, signal } = this.begin();
    this.update({ busy: true });
    try {
      const result = await this.client.list(this.projectID, signal);
      if (this.current(epoch)) {
        this.update({ tasks: this.projectTasks(result.data ?? []) });
      }
    } catch (reason) {
      if (this.current(epoch)) this.update({ error: planningFailure(reason) });
    } finally {
      if (this.current(epoch)) this.update({ busy: false });
    }
  }

  async enqueue(version: number, confirmed: boolean): Promise<boolean> {
    if (
      !confirmed ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      !this.mayWrite() ||
      this.state.pending ||
      this.state.tasks.some(activePlanningTask)
    ) {
      return false;
    }
    try {
      const ticket = this.journal.begin({
        project_id: this.projectID,
        expected_version: version,
        confirm_text_generation: true,
      });
      return this.submit(ticket);
    } catch {
      this.update({ error: 'invalid' });
      return false;
    }
  }

  /** Explicitly replays the ORIGINAL confirmed body, including its version. */
  async retrySubmission(confirmed: boolean): Promise<boolean> {
    const ticket = this.journal.peek(this.projectID);
    if (!confirmed || !ticket || !this.mayWrite(true)) return false;
    return this.submit(ticket);
  }

  private async submit(ticket: PlanningTicket): Promise<boolean> {
    const { epoch, signal } = this.begin();
    this.update({ mutation: 'enqueue', pending: ticket, error: null });
    try {
      const task = await this.client.enqueue(ticket.body, ticket.key, signal);
      if (!this.current(epoch)) return false;
      if (task.input_version !== ticket.body.expected_version) {
        throw new Error('Unexpected planning input version');
      }
      this.upsert(task);
      this.journal.acknowledge(ticket);
      this.update({ pending: null, selectedID: task.id });
      return true;
    } catch (reason) {
      if (!this.current(epoch)) return false;
      const code = (reason as { code?: string } | null)?.code;
      // These P1c errors are returned after a valid-key lookup or before any
      // admission. Auth, transport, disabled API and unknown responses cannot
      // prove a PREVIOUS ambiguous request did not succeed. Keep its key.
      if (
        code === 'studio_planning_quota' ||
        code === 'studio_planning_pending' ||
        code === 'studio_version_conflict' ||
        code === 'invalid_request'
      ) {
        this.journal.acknowledge(ticket);
      }
      this.update({
        error: planningFailure(reason),
        pending: this.journal.peek(this.projectID),
      });
      return false;
    } finally {
      if (this.current(epoch)) this.update({ mutation: null });
    }
  }

  async accept(id: string, version: number, confirmed: boolean) {
    const task = this.state.tasks.find((item) => item.id === id);
    if (!confirmed || !this.mayWrite() || !task || !canAcceptPlan(task, version)) {
      return null;
    }
    const { epoch, signal } = this.begin();
    this.update({ mutation: 'accept', error: null });
    try {
      // Accept returns a receipt, NOT a project. The parent must re-read it.
      const receipt = await this.client.accept(id, task.input_version, signal);
      if (!this.current(epoch)) return null;
      if (
        receipt.task.id !== id ||
        receipt.task.state !== 'accepted' ||
        receipt.task.input_version !== task.input_version ||
        receipt.task.accepted_version !== task.input_version + 1
      ) {
        throw new Error('Unexpected acceptance receipt');
      }
      this.upsert(receipt.task);
      return receipt;
    } catch (reason) {
      if (this.current(epoch)) this.update({ error: planningFailure(reason) });
      return null;
    } finally {
      if (this.current(epoch)) this.update({ mutation: null });
    }
  }

  async cancel(id: string, confirmed: boolean) {
    const task = this.state.tasks.find((item) => item.id === id);
    if (
      !confirmed ||
      !this.mayWrite() ||
      !task ||
      (!activePlanningTask(task) && task.state !== 'ready')
    ) {
      return false;
    }
    const { epoch, signal } = this.begin();
    this.update({ mutation: 'cancel', error: null });
    try {
      const result = await this.client.cancel(id, signal);
      if (!this.current(epoch)) return false;
      if (result.id !== id || result.state !== 'canceled') {
        throw new Error('Unexpected cancellation receipt');
      }
      this.upsert(result);
      return true;
    } catch (reason) {
      if (this.current(epoch)) this.update({ error: planningFailure(reason) });
      return false;
    } finally {
      if (this.current(epoch)) this.update({ mutation: null });
    }
  }

  private mayWrite(recovery = false) {
    return (
      !this.disposed &&
      !this.state.busy &&
      !this.state.mutation &&
      supportedPlanning(this.state.info) &&
      (!this.state.error || (recovery && ['network', 'rate'].includes(this.state.error)))
    );
  }
  private projectTasks(tasks: PlanningTask[]) {
    if (!Array.isArray(tasks) || tasks.length > 40) {
      throw new Error('Unexpected planning task list');
    }
    const ids = new Set<string>();
    for (const task of tasks) {
      if (
        task.project_id !== this.projectID ||
        typeof task.id !== 'string' ||
        !task.id ||
        ids.has(task.id) ||
        !Number.isSafeInteger(task.input_version) ||
        task.input_version < 1 ||
        !['queued', 'running', 'ready', 'failed', 'interrupted', 'canceled', 'stale', 'accepted'].includes(task.state) ||
        !task.usage || typeof task.usage.known !== 'boolean' ||
        !task.profile || typeof task.profile.model !== 'string' ||
        (task.plan != null && !readStoryPlan(task.plan)) ||
        (['ready', 'accepted'].includes(task.state) && !task.plan)
      ) {
        throw new Error('Unexpected planning task');
      }
      ids.add(task.id);
    }
    return tasks;
  }
  private upsert(task: PlanningTask) {
    this.projectTasks([task]);
    this.update({
      tasks: [task, ...this.state.tasks.filter((item) => item.id !== task.id)],
    });
  }

  /** Invalidates in-flight work but does not discard saved or local proposals. */
  dispose() {
    this.disposed = true;
    this.epoch += 1;
    this.abort?.abort();
    this.state = { ...this.state, busy: false, mutation: null };
  }
}
