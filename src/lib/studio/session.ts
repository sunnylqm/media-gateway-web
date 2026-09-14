import { type Failure, failureOf } from './controller';
import type { StudioTransport } from './types';

export type SessionIdentity = { user: { id: string } };
type SessionState = {
  value: SessionIdentity | null;
  busy: boolean;
  error: Failure | null;
};

// Revalidation retains the mounted account's UI, but closes the request gate
// synchronously. Hidden controls alone cannot stop an in-flight request chain.
export class StudioSessionController {
  private state: SessionState = { value: null, busy: true, error: null };
  private epoch = 0;
  private verified = false;
  private verification?: AbortController;
  private requests = new Set<AbortController>();
  private listeners = new Set<() => void>();

  constructor(private readonly request: StudioTransport) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private invalidate() {
    this.epoch += 1;
    this.verified = false;
    this.verification?.abort();
    for (const request of this.requests) request.abort();
    this.requests.clear();
    return this.epoch;
  }

  // Same-account success preserves the identity object and React subtree.
  // Transient failures retain local state behind a hidden, inert view; an
  // expired or forbidden session clears it. Every failure keeps the gate shut.
  refresh = async () => {
    const epoch = this.invalidate();
    const abort = new AbortController();
    this.verification = abort;
    this.update({ busy: true, error: null });
    try {
      const result = await this.request<SessionIdentity>('/v1/auth/me', {
        signal: abort.signal,
        cache: 'no-store',
      });
      if (epoch !== this.epoch) return;
      const userID = result?.user?.id;
      if (typeof userID !== 'string' || !userID.trim()) {
        this.update({ value: null, busy: false, error: 'forbidden' });
        return;
      }
      const value =
        this.state.value?.user.id === userID
          ? this.state.value
          : { user: { id: userID } };
      this.verified = true;
      this.update({ value, busy: false, error: null });
    } catch (reason) {
      if (epoch !== this.epoch) return;
      const error = failureOf(reason);
      this.update({
        value:
          error === 'auth' || error === 'forbidden' ? null : this.state.value,
        busy: false,
        error,
      });
    }
  };

  // Bind transport to the identity that mounted the page. A late callback from
  // the old account must not start work using a newly verified account's cookie.
  forUser(userID: string): StudioTransport {
    return async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      if (!this.readyFor(userID) || init.signal?.aborted) {
        throw new DOMException('Studio session is not verified', 'AbortError');
      }
      const epoch = this.epoch;
      const abort = new AbortController();
      const cancel = () => abort.abort();
      init.signal?.addEventListener('abort', cancel, { once: true });
      this.requests.add(abort);
      try {
        const result = await this.request<T>(path, {
          ...init,
          signal: abort.signal,
        });
        // A transport may ignore abort, so check the epoch before returning
        // data to a view or acknowledging a create/fork idempotency key.
        if (
          abort.signal.aborted ||
          epoch !== this.epoch ||
          !this.readyFor(userID)
        ) {
          throw new DOMException('Studio session changed', 'AbortError');
        }
        return result;
      } catch (reason) {
        if (abort.signal.aborted || epoch !== this.epoch) {
          throw new DOMException('Studio session changed', 'AbortError');
        }
        throw reason;
      } finally {
        init.signal?.removeEventListener('abort', cancel);
        this.requests.delete(abort);
      }
    };
  }

  private readyFor(userID: string) {
    return (
      this.verified &&
      !this.state.busy &&
      !this.state.error &&
      this.state.value?.user.id === userID
    );
  }

  // Cancels requests without notifying an unmounted view. A new refresh can
  // reactivate the controller after React StrictMode's effect cleanup.
  dispose() {
    this.invalidate();
  }
}
