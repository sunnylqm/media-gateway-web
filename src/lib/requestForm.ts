import { formatLabel } from '../format';
import type { FormInput, FormParameter, ModelBilling, RequestForm } from '../types';

// A media slot is one place a model's own request accepts a file. It is derived
// from the published request form, so the composer offers exactly what the
// provider takes without ever knowing the provider by name.
export type MediaSlot = {
  id: string;
  // Frames anchor the clip at a fixed position and take one file each;
  // references are a pool the provider draws style and subject from.
  group: 'frame' | 'reference';
  label: string;
  mimePrefix: string;
  multiple: boolean;
  // Exactly one placement is set: a typed content item, or a flat body field.
  content?: { pointer: string; type: string; field: string; urlField: string; role: string };
  input?: { pointer: string; array: boolean };
};

export type MediaReference = { slot: MediaSlot; url: string };
export type MediaKind = 'image' | 'video' | 'audio' | 'file';

const framePattern = /(^|[_-])(first|last|start|end)[_-]?frame$/i;
const framePositions = ['first', 'start', 'last', 'end'];
const kindOrder: MediaKind[] = ['image', 'video', 'audio', 'file'];

export function mediaSlots(form?: RequestForm): MediaSlot[] {
  const slots = form?.prompt.content ? contentSlots(form.prompt.content) : inputSlots(form?.inputs ?? []);
  return slots.sort((left, right) => slotRank(left) - slotRank(right));
}

export function mediaKind(mimePrefix: string): MediaKind {
  const kind = mimePrefix.split('/')[0].toLowerCase();
  return kindOrder.includes(kind as MediaKind) ? kind as MediaKind : 'file';
}

export function slotAccepts(slot: MediaSlot, mimeType: string) {
  return mimeType.toLowerCase().startsWith(slot.mimePrefix.toLowerCase());
}

export function acceptAttribute(slots: MediaSlot[]) {
  return [...new Set(slots.map((slot) => `${slot.mimePrefix}*`))].join(',');
}

// buildRequestBody assembles the model's own native request. Media keeps the
// caller's order so a provider that resolves references positionally sees the
// same sequence the composer showed.
export function buildRequestBody(
  form: RequestForm,
  modelID: string,
  prompt: string,
  parameters: Record<string, string>,
  media: MediaReference[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  setPointer(body, form.model, modelID);

  const content = form.prompt.content;
  if (content) {
    const items: Array<Record<string, unknown>> = [{ type: content.text_type, [content.text_field]: prompt }];
    for (const { slot, url } of media) {
      if (!slot.content) continue;
      items.push({
        type: slot.content.type,
        [slot.content.field]: { [slot.content.urlField]: url },
        ...(slot.content.role ? { role: slot.content.role } : {}),
      });
    }
    setPointer(body, content.pointer, items);
  } else {
    setPointer(body, form.prompt.pointer ?? '/prompt', prompt);
    const grouped = new Map<string, { slot: MediaSlot; urls: string[] }>();
    for (const { slot, url } of media) {
      if (!slot.input) continue;
      const entry = grouped.get(slot.input.pointer) ?? { slot, urls: [] };
      entry.urls.push(url);
      grouped.set(slot.input.pointer, entry);
    }
    for (const { slot, urls } of grouped.values()) {
      setPointer(body, slot.input!.pointer, slot.input!.array ? urls : urls[0]);
    }
  }

  for (const parameter of form.parameters ?? []) {
    const raw = parameters[parameter.name] ?? '';
    if (raw === '') {
      if (parameter.required) throw new Error(`${formatLabel(parameter.name)} is required`);
      continue;
    }
    setPointer(body, parameter.pointer, coerceParameter(parameter, raw));
  }
  return body;
}

export function defaultParameterValue(parameter: FormParameter): string {
  if (parameter.default !== undefined && parameter.default !== null) return String(parameter.default);
  if (!parameter.required) return '';
  if (parameter.enum?.length) return parameter.enum[0];
  if (parameter.minimum !== undefined) return String(parameter.minimum);
  return '';
}

export function coerceParameter(parameter: FormParameter, raw: string): unknown {
  if (parameter.type === 'integer') {
    const value = Number(raw);
    if (!Number.isInteger(value)) throw new Error(`${formatLabel(parameter.name)} must be a whole number`);
    return value;
  }
  if (parameter.type === 'boolean') return raw === 'true';
  return raw;
}

// estimateAmount mirrors the gateway's own quote: the most specific matching
// rate priced over the requested seconds, in currency minor units. It is shown
// as an estimate because the final charge follows the delivered output.
export function estimateAmount(billing: ModelBilling, parameters: Record<string, string>) {
  if (billing.mode === 'free') return 0;
  const dimensions = Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== ''),
  );
  let quantity = 1;
  let { unit_price: unitPrice, unit_scale: unitScale, minimum_charge: minimum } = billing;
  if (billing.mode === 'per_output_second') {
    quantity = dimensions.duration === undefined ? 5 : Number(dimensions.duration);
    if (!Number.isInteger(quantity) || quantity < 0) return null;
    const rate = resolveRate(billing, dimensions);
    unitPrice = rate.unit_price;
    unitScale = rate.unit_scale;
    minimum = rate.minimum_charge;
  }
  if (unitScale <= 0 || unitPrice < 0) return null;
  return Math.max(Math.ceil((unitPrice * quantity) / unitScale), minimum);
}

export function resolveRate(billing: ModelBilling, dimensions: Record<string, string>) {
  const fallback = {
    label: 'Default', unit_price: billing.unit_price,
    unit_scale: billing.unit_scale, minimum_charge: billing.minimum_charge,
  };
  if (billing.mode !== 'per_output_second') return fallback;
  let selected = fallback;
  let mostSpecific = -1;
  for (const rate of billing.rates ?? []) {
    const entries = Object.entries(rate.dimensions ?? {});
    if (!entries.every(([name, expected]) => dimensions[name] === expected)) continue;
    if (entries.length <= mostSpecific) continue;
    selected = rate;
    mostSpecific = entries.length;
  }
  return selected;
}

// setPointer writes value at an RFC 6901 pointer, creating the objects and
// arrays the path implies. It mirrors the gateway's own pointer writer.
export function setPointer(target: Record<string, unknown>, pointer: string, value: unknown) {
  const tokens = pointer.replace(/^\//, '').split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = target;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const key = tokens[index];
    const childIsArray = /^\d+$/.test(tokens[index + 1]);
    const child = node[key];
    if (typeof child !== 'object' || child === null || Array.isArray(child) !== childIsArray) {
      node[key] = childIsArray ? [] : {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[tokens[tokens.length - 1]] = value;
}

function contentSlots(content: NonNullable<RequestForm['prompt']['content']>): MediaSlot[] {
  return (content.media ?? []).flatMap((media) => {
    const roles = media.roles?.length ? media.roles : [media.default_role ?? ''];
    return roles.map((role) => ({
      id: `${media.type}:${role}`,
      group: isFrameRole(role) ? 'frame' as const : 'reference' as const,
      label: formatLabel(role || media.type.replace(/_url$/, '')),
      mimePrefix: media.mime_prefix,
      multiple: !isFrameRole(role),
      content: {
        pointer: content.pointer, type: media.type,
        field: media.field, urlField: media.url_field, role,
      },
    }));
  });
}

function inputSlots(inputs: FormInput[]): MediaSlot[] {
  return inputs.map((input) => ({
    id: input.pointer,
    group: isFrameRole(input.name) ? 'frame' as const : 'reference' as const,
    label: formatLabel(input.name),
    mimePrefix: input.mime_prefix,
    multiple: Boolean(input.array),
    input: { pointer: input.pointer, array: Boolean(input.array) },
  }));
}

function isFrameRole(role: string) {
  return role === 'frame' || framePattern.test(role);
}

// Frames read start to end before the reference pool, and the pool follows the
// order a person expects to fill it: images, then video, then audio.
function slotRank(slot: MediaSlot) {
  if (slot.group !== 'frame') return 10 + kindOrder.indexOf(mediaKind(slot.mimePrefix));
  const label = slot.label.toLowerCase();
  const position = framePositions.findIndex((keyword) => label.includes(keyword));
  return position < 0 ? framePositions.length : position;
}

// Every model is served from its own path prefix, which is the model id.
export function modelPathSlug(value: string) {
  return value.trim().toLowerCase();
}
