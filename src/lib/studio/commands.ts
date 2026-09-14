export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Ticket = { signature: string; key: string };

// Store only a pending create/fork command's IDs and retry key, never a story,
// prompt, session credential or account email. Scope it to API origin AND user.
export class CommandJournal {
  private pending: Ticket | null = null;
  private readonly storageKey: string;

  constructor(
    origin: string,
    userID: string,
    private readonly storage?: StorageLike,
    private readonly newKey: () => string = () => crypto.randomUUID(),
  ) {
    this.storageKey = `studio-command:${encodeURIComponent(origin)}:${userID}`;
    try {
      const raw = storage?.getItem(this.storageKey);
      if (raw && raw.length < 4096) {
        const value: unknown = JSON.parse(raw);
        if (isTicket(value)) this.pending = value;
      }
    } catch {
      // Storage can be blocked. Retry protection still works in this page.
    }
  }

  prepare(path: string, body: object): Ticket {
    const signature = JSON.stringify([path, body]);
    if (this.pending?.signature === signature) return { ...this.pending };
    this.pending = { signature, key: this.newKey() };
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.pending));
    } catch {
      // No fallback to another user's key or to localStorage.
    }
    return { ...this.pending };
  }

  acknowledge(ticket: Ticket) {
    if (
      this.pending?.key !== ticket.key ||
      this.pending.signature !== ticket.signature
    ) {
      return;
    }
    this.pending = null;
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (raw) {
        const stored: unknown = JSON.parse(raw);
        if (isTicket(stored) && stored.key === ticket.key) {
          this.storage?.removeItem(this.storageKey);
        }
      }
    } catch {
      // An acknowledged request must not fail just because storage is blocked.
    }
  }
}

function isTicket(value: unknown): value is Ticket {
  if (!value || typeof value !== 'object') return false;
  const ticket = value as Partial<Ticket>;
  return (
    typeof ticket.signature === 'string' &&
    ticket.signature.length < 2048 &&
    typeof ticket.key === 'string' &&
    /^[!-~]{1,128}$/.test(ticket.key)
  );
}
