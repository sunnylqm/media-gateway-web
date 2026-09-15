import type { PublicModel } from '../../types';
import type { ProductionClient } from './productionClient';
import type {
  ProductionJournal,
  ProductionMemory,
  ProductionTicket,
} from './productionJournal';
import {
  blocksNewRun,
  candidateModels,
  confirmationFor,
  type ExecutionInfo,
  hasActiveShots,
  type ProductionQuote,
  type ProductionRun,
  type QuoteInput,
  quoteConsentKey,
  quoteUsable,
  supportsExecution,
} from './productionTypes';

export type ProductionFailure =
  | 'auth'
  | 'forbidden'
  | 'missing'
  | 'changed'
  | 'expired'
  | 'funds'
  | 'pending'
  | 'quota'
  | 'unsupported'
  | 'disabled'
  | 'network'
  | 'protocol'
  | 'storage'
  | 'settings';
export function productionFailure(reason: unknown): ProductionFailure {
  const e = reason as {
    status?: number;
    code?: string;
    message?: string;
  } | null;
  if (e?.message === 'production_storage') return 'storage';
  if (e?.message === 'production_protocol') return 'protocol';
  if (e?.message === 'invalid_settings') return 'settings';
  if (e?.status === 401) return 'auth';
  if (e?.status === 403) return 'forbidden';
  if (e?.status === 404) return 'missing';
  if (e?.status === 402) return 'funds';
  if (e?.code === 'studio_quote_expired') return 'expired';
  if (e?.code === 'studio_execution_pending') return 'pending';
  if (e?.status === 409) return 'changed';
  if (e?.status === 429) return 'quota';
  if (e?.code === 'studio_execution_disabled') return 'disabled';
  if (e?.status === 422) return 'unsupported';
  if (e?.status === 400 || e?.status === 413) return 'settings';
  return 'network';
}
// Only an explicit gateway refusal proves a POST did not admit a new batch.
function definitiveRefusal(reason: unknown): boolean {
  const e = reason as { status?: number; code?: string } | null;
  return (
    !!e?.code &&
    ([400, 401, 402, 403, 404, 413, 422, 429].includes(e.status ?? 0) ||
      [
        'studio_quote_expired',
        'studio_quote_changed',
        'studio_version_conflict',
        'studio_execution_pending',
      ].includes(e.code))
  );
}
type State = {
  info: ExecutionInfo | null;
  models: PublicModel[];
  quote: ProductionQuote | null;
  runs: ProductionRun[];
  selectedID: string | null;
  pending: ProductionTicket | null;
  busy: boolean;
  mutation: 'quote' | 'confirm' | null;
  error: ProductionFailure | null;
};

/** One account/project controller. Loading and polling can never spend. */
export class ProductionController {
  private state: State = {
    info: null,
    models: [],
    quote: null,
    runs: [],
    selectedID: null,
    pending: null,
    busy: false,
    mutation: null,
    error: null,
  };
  private epoch = 0;
  private active = false;
  private abort?: AbortController;
  private memory: ProductionMemory = { version: 1 };
  private listeners = new Set<() => void>();
  constructor(
    private readonly client: ProductionClient,
    private readonly journal: ProductionJournal,
    readonly projectID: string,
    private readonly newKey: () => string = () => crypto.randomUUID(),
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
    this.active = false;
    this.epoch++;
    this.abort?.abort();
  }
  private remember(value: ProductionMemory) {
    this.journal.write(value);
    this.memory = value;
    this.update({ pending: value.pending ?? null });
  }
  private addRun(run: ProductionRun) {
    this.update({
      runs: [run, ...this.state.runs.filter((r) => r.id !== run.id)].slice(
        0,
        20,
      ),
      selectedID: run.id,
    });
  }
  select(id: string) {
    if (
      !this.state.busy &&
      !this.state.mutation &&
      this.state.runs.some((r) => r.id === id)
    )
      this.update({ selectedID: id });
  }

  async load() {
    if (this.active && this.state.mutation) return;
    this.dispose();
    this.active = true;
    const epoch = this.epoch;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.update({ busy: true, mutation: null, error: null });
    try {
      // Corrupt/unavailable storage still permits read-only receipts.
      let storageFailure = false;
      try {
        this.memory = this.journal.read();
      } catch {
        storageFailure = true;
      }
      const [info, models, runs] = await Promise.all([
        this.client.info(signal),
        this.client.models(signal),
        this.client.list(this.projectID, signal),
      ]);
      if (epoch !== this.epoch) return;
      this.update({
        info,
        models: candidateModels(models),
        runs,
        selectedID: runs.some((r) => r.id === this.state.selectedID)
          ? this.state.selectedID
          : (runs[0]?.id ?? null),
        pending: this.memory.pending ?? null,
      });
      if (this.memory.quoteID) {
        let quote: ProductionQuote;
        try {
          quote = await this.client.getQuote(
            this.memory.quoteID,
            this.projectID,
            signal,
          );
        } catch (reason) {
          if (epoch !== this.epoch) return;
          // An unused expired offer may be collected. Never clear an uncertain
          // spend merely because its receipt could not be fetched.
          if (
            productionFailure(reason) === 'missing' &&
            !this.memory.pending &&
            !storageFailure
          ) {
            this.remember({ version: 1 });
            this.update({ quote: null });
            return;
          }
          throw reason;
        }
        if (epoch !== this.epoch) return;
        this.update({ quote });
        if (quote.run_id) {
          const run = await this.client.getRun(
            quote.run_id,
            this.projectID,
            signal,
          );
          if (epoch !== this.epoch) return;
          this.checkReceipt(run, quote);
          this.addRun(run);
          if (
            this.memory.pending?.kind === 'confirm' &&
            this.memory.pending.body.quote_id === quote.id
          )
            this.remember({ version: 1, quoteID: quote.id });
        }
      }
      if (storageFailure) this.update({ error: 'storage' });
    } catch (reason) {
      if (epoch === this.epoch)
        this.update({ error: productionFailure(reason) });
    } finally {
      if (epoch === this.epoch) this.update({ busy: false });
    }
  }
  private checkReceipt(run: ProductionRun, quote: ProductionQuote) {
    if (
      run.quote_id !== quote.id ||
      run.currency !== quote.currency ||
      run.project_version !== quote.project_version ||
      run.max_amount !== quote.max_amount ||
      run.items.length !== quote.preview.shots.length ||
      run.items.some(
        (i) =>
          !quote.preview.shots.some(
            (s) => s.id === i.shot_id && s.estimate.amount === i.max_amount,
          ),
      )
    )
      throw new Error('production_protocol');
  }
  async poll() {
    if (
      !this.active ||
      this.state.busy ||
      this.state.mutation ||
      this.state.error
    )
      return;
    const ids = this.state.runs.filter(hasActiveShots).map((r) => r.id);
    if (!ids.length) return;
    const epoch = this.epoch;
    this.abort = new AbortController();
    this.update({ busy: true });
    try {
      const updates = await Promise.all(
        ids.map((id) =>
          this.client.getRun(id, this.projectID, this.abort?.signal),
        ),
      );
      if (epoch !== this.epoch) return;
      this.update({
        runs: this.state.runs.map(
          (r) => updates.find((v) => v.id === r.id) ?? r,
        ),
      });
    } catch (reason) {
      if (epoch === this.epoch)
        this.update({ error: productionFailure(reason) });
    } finally {
      if (epoch === this.epoch) this.update({ busy: false });
    }
  }
  private writable() {
    return (
      this.active &&
      !this.state.busy &&
      !this.state.mutation &&
      supportsExecution(this.state.info) &&
      !['auth', 'forbidden', 'missing', 'storage', 'protocol'].includes(
        this.state.error ?? '',
      )
    );
  }
  async requestQuote(body: QuoteInput) {
    if (
      !this.writable() ||
      this.state.error ||
      this.state.pending ||
      body.project_id !== this.projectID ||
      this.state.runs.some(blocksNewRun)
    )
      return;
    await this.submit({ kind: 'quote', key: this.newKey(), body });
  }
  async retryQuote() {
    const ticket = this.state.pending;
    if (!this.writable() || ticket?.kind !== 'quote') return;
    await this.submit(ticket, true);
  }
  async confirm(version: number, consentKey: string | null) {
    const q = this.state.quote;
    if (
      !this.writable() ||
      this.state.pending ||
      this.state.error ||
      !quoteUsable(q, version) ||
      this.state.runs.some(blocksNewRun)
    )
      return;
    if (
      !this.writable() ||
      this.state.pending ||
      this.state.quote !== q ||
      consentKey !== quoteConsentKey(q)
    )
      return;
    await this.submit({
      kind: 'confirm',
      key: this.newKey(),
      body: confirmationFor(q),
    });
  }
  async retryConfirmation(confirmed: boolean) {
    const ticket = this.state.pending,
      q = this.state.quote;
    if (
      !confirmed ||
      !this.writable() ||
      ticket?.kind !== 'confirm' ||
      !q ||
      q.id !== ticket.body.quote_id ||
      q.project_version !== ticket.body.expected_version ||
      q.max_amount !== ticket.body.approved_max_amount
    )
      return;
    // Reuses the original authorization only after another explicit confirmation.
    // An expired offer can still have an admitted receipt: the server decides.
    await this.submit(ticket, true);
  }
  private async submit(ticket: ProductionTicket, recovering = false) {
    const epoch = this.epoch;
    this.abort = new AbortController();
    this.update({ mutation: ticket.kind, error: null });
    try {
      this.remember({ ...this.memory, pending: ticket });
      if (ticket.kind === 'quote') {
        const quote = await this.client.quote(
          ticket.body,
          ticket.key,
          this.abort.signal,
        );
        if (epoch !== this.epoch) return;
        this.remember({ version: 1, quoteID: quote.id });
        this.update({ quote });
      } else {
        const run = await this.client.confirm(
          this.projectID,
          ticket.body,
          ticket.key,
          this.abort.signal,
        );
        if (epoch !== this.epoch) return;
        if (!this.state.quote) throw new Error('production_protocol');
        this.checkReceipt(run, this.state.quote);
        this.remember({ version: 1, quoteID: run.quote_id });
        this.update({
          quote: { ...this.state.quote, state: 'used', run_id: run.id },
        });
        this.addRun(run);
      }
    } catch (reason) {
      if (epoch !== this.epoch) return;
      // A refusal of a retry cannot prove the original request did not commit.
      // Keep the original ticket until a validated read or replay resolves it.
      if (!recovering && definitiveRefusal(reason)) {
        try {
          this.remember({ version: 1, quoteID: this.memory.quoteID });
        } catch {
          this.update({ error: 'storage' });
          return;
        }
      }
      this.update({ error: productionFailure(reason) });
    } finally {
      if (epoch === this.epoch) this.update({ mutation: null });
    }
  }
}
