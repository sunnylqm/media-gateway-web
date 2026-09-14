import type { StorageLike } from './commands';
import type { PlanningRequest } from './planningTypes';

export type PlanningTicket = { key: string; body: PlanningRequest };

/**
 * One unresolved text request per project, isolated from create/fork commands.
 * Storage contains only IDs, version, explicit consent and a retry key. It never
 * stores stories, prompts, credentials, account email, or generated output.
 */
export class PlanningJournal {
  private readonly prefix: string;
  private readonly pending = new Map<string, PlanningTicket>();

  constructor(
    origin: string,
    userID: string,
    private readonly storage?: StorageLike,
    private readonly newKey: () => string = () => crypto.randomUUID(),
  ) {
    this.prefix = `studio-planning:${encodeURIComponent(origin)}:${encodeURIComponent(userID)}:`;
  }

  peek(projectID: string): PlanningTicket | null {
    const memory = this.pending.get(projectID);
    if (memory) return structuredClone(memory);
    try {
      const raw = this.storage?.getItem(this.path(projectID));
      if (raw && raw.length <= 2048) {
        const ticket: unknown = JSON.parse(raw);
        if (validTicket(ticket, projectID)) {
          this.pending.set(projectID, ticket);
          return structuredClone(ticket);
        }
      }
    } catch {
      // Blocked or corrupt storage does not prevent an in-memory session.
    }
    return null;
  }

  begin(body: PlanningRequest): PlanningTicket {
    const existing = this.peek(body.project_id);
    if (existing) {
      if (existing.body.expected_version !== body.expected_version) {
        throw new Error('Resolve the previous text request first');
      }
      return existing;
    }
    const ticket = { key: this.newKey(), body: { ...body } };
    if (!validTicket(ticket, body.project_id)) {
      throw new Error('Invalid text planning command');
    }
    this.pending.set(body.project_id, ticket);
    try {
      this.storage?.setItem(this.path(body.project_id), JSON.stringify(ticket));
    } catch {
      // Keep the exact command until a definitive response, even without storage.
    }
    return structuredClone(ticket);
  }

  acknowledge(ticket: PlanningTicket) {
    const id = ticket.body.project_id;
    if (this.peek(id)?.key !== ticket.key) return;
    this.pending.delete(id);
    try {
      const raw = this.storage?.getItem(this.path(id));
      if (raw && JSON.parse(raw).key === ticket.key) {
        this.storage?.removeItem(this.path(id));
      }
    } catch {
      // A confirmed server response remains valid when storage is unavailable.
    }
  }

  private path(projectID: string) {
    return `${this.prefix}${encodeURIComponent(projectID)}`;
  }
}

function validTicket(
  value: unknown,
  projectID: string,
): value is PlanningTicket {
  const ticket = value as Partial<PlanningTicket> | null;
  const body = ticket?.body;
  return !!(
    typeof ticket?.key === 'string' &&
    /^[!-~]{1,128}$/.test(ticket.key) &&
    body?.project_id === projectID &&
    typeof projectID === 'string' &&
    projectID.length > 0 &&
    projectID.length <= 128 &&
    Number.isSafeInteger(body.expected_version) &&
    body.expected_version > 0 &&
    body.confirm_text_generation === true &&
    Object.keys(body).length === 3 &&
    Object.keys(ticket).length === 2
  );
}
