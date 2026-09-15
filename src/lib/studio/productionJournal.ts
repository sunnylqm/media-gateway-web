import { isObject, validAmount, validID, validVersion, type Confirmation, type QuoteInput } from './productionTypes';

export type ProductionTicket =
  | { kind: 'quote'; key: string; body: QuoteInput }
  | { kind: 'confirm'; key: string; body: Confirmation };
export type ProductionMemory = { version: 1; quoteID?: string; pending?: ProductionTicket };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function validTicket(v: unknown, project: string): v is ProductionTicket {
  if (!isObject(v) || typeof v.key !== 'string' || !/^[!-~]{1,128}$/.test(v.key) || !isObject(v.body)) return false;
  const b = v.body;
  if (!validVersion(b.expected_version)) return false;
  if (v.kind === 'confirm') return validID(b.quote_id) && validAmount(b.approved_max_amount) && b.confirm_generation === true && Object.keys(b).length === 4;
  if (v.kind !== 'quote' || b.project_id !== project || !validID(b.model) || !isObject(b.parameters) || Object.keys(b).length !== 4) return false;
  return Object.entries(b.parameters).length <= 32 && Object.entries(b.parameters).every(([name, value]) =>
    /^[a-z][a-z0-9_]{0,63}$/.test(name) && !['duration', 'constructor', 'prototype'].includes(name) && !/prompt|text|url|token|key|password/i.test(name) &&
    (typeof value === 'boolean' || (typeof value === 'number' && Number.isSafeInteger(value)) || (typeof value === 'string' && value.length <= 2048)));
}
/** No prompts or reusable UI consent are persisted. Original request bodies only support explicit recovery. */
export class ProductionJournal {
  private readonly key: string;
  constructor(gateway: string, user: string, private readonly project: string, private readonly storage?: StorageLike) {
    this.key = `studio-production:v1:${encodeURIComponent(gateway)}:${encodeURIComponent(user)}:${encodeURIComponent(project)}`;
  }
  read(): ProductionMemory {
    if (!this.storage) throw new Error('production_storage');
    const raw = this.storage.getItem(this.key);
    if (raw === null) return { version: 1 };
    try {
      if (raw.length > 8192) throw new Error();
      const v: unknown = JSON.parse(raw);
      if (!isObject(v) || v.version !== 1 || (v.quoteID !== undefined && !validID(v.quoteID)) ||
        (v.pending !== undefined && !validTicket(v.pending, this.project))) throw new Error();
      return v as ProductionMemory;
    } catch { throw new Error('production_storage'); }
  }
  write(value: ProductionMemory) {
    if (!this.storage) throw new Error('production_storage');
    const raw = JSON.stringify(value);
    if (raw.length > 8192) throw new Error('production_storage');
    try {
      this.storage.setItem(this.key, raw);
      if (this.storage.getItem(this.key) !== raw) throw new Error();
    } catch { throw new Error('production_storage'); }
  }
}
