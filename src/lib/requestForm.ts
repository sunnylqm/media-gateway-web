import { formatLabel } from '../format';
import { t } from '../i18n';
import type {
  FormInput,
  FormParameter,
  ModelBilling,
  RequestForm,
} from '../types';

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
  content?: {
    pointer: string;
    type: string;
    field: string;
    urlField: string;
    role: string;
  };
  input?: { pointer: string; array: boolean };
};

export type MediaReference = { slot: MediaSlot; url: string };
export type MediaKind = 'image' | 'video' | 'audio' | 'file';

const framePattern = /(^|[_-])(first|last|start|end)[_-]?frame$/i;
const framePositions = ['first', 'start', 'last', 'end'];
const kindOrder: MediaKind[] = ['image', 'video', 'audio', 'file'];

export const HIDDEN_PARAMETERS = new Set([
  'output_compression',
  'background',
  'moderation',
]);

export function isHiddenParameter(name: string): boolean {
  return HIDDEN_PARAMETERS.has(name.toLowerCase());
}

export function mediaSlots(form?: RequestForm): MediaSlot[] {
  const slots = form?.prompt.content
    ? contentSlots(form.prompt.content)
    : inputSlots(form?.inputs ?? []);
  return slots.sort((left, right) => slotRank(left) - slotRank(right));
}

export function mediaKind(mimePrefix?: string): MediaKind {
  const kind = (mimePrefix ?? '').split('/')[0].toLowerCase();
  return kindOrder.includes(kind as MediaKind) ? (kind as MediaKind) : 'file';
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
    const items: Array<Record<string, unknown>> = [
      { type: content.text_type, [content.text_field]: prompt },
    ];
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
      if (parameter.required)
        throw new Error(
          t('form.required', { label: formatLabel(parameter.name) }),
        );
      continue;
    }
    setPointer(body, parameter.pointer, coerceParameter(parameter, raw));
  }
  return body;
}

export function defaultParameterValue(parameter: FormParameter): string {
  if (parameter.default !== undefined && parameter.default !== null)
    return String(parameter.default);
  if (!parameter.required) return '';
  if (parameter.enum?.length) return parameter.enum[0];
  if (parameter.minimum !== undefined) return String(parameter.minimum);
  return '';
}

export function coerceParameter(
  parameter: FormParameter,
  raw: string,
): unknown {
  if (parameter.type === 'integer') {
    const value = Number(raw);
    if (!Number.isInteger(value))
      throw new Error(
        t('form.integer', { label: formatLabel(parameter.name) }),
      );
    return value;
  }
  if (parameter.type === 'boolean') return raw === 'true';
  return raw;
}

// estimateQuantity is the number of billable units a request asks for: the
// requested seconds for per-second video, the requested image count for
// per-image models. It mirrors the gateway's admission rule, including the
// defaults it applies when the parameter is absent.
export function estimateQuantity(
  billing: ModelBilling,
  dimensions: Record<string, string>,
) {
  if (billing.mode === 'per_output_second') {
    const quantity =
      dimensions.duration === undefined ? 5 : Number(dimensions.duration);
    return Number.isInteger(quantity) && quantity >= 0 ? quantity : null;
  }
  if (billing.mode === 'per_request') {
    const quantity = dimensions.n === undefined ? 1 : Number(dimensions.n);
    return Number.isInteger(quantity) && quantity >= 1 ? quantity : null;
  }
  return 1;
}

// estimateAmount mirrors the gateway's own quote: the most specific matching
// rate multiplied by the requested quantity, in currency minor units. For a
// per-second model it is an estimate, because the final charge follows the
// delivered output; a per-image quote is locked at submission.
export function estimateAmount(
  billing: ModelBilling,
  parameters: Record<string, string>,
) {
  if (billing.mode === 'free') return 0;
  const dimensions = Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== ''),
  );
  const quantity = estimateQuantity(billing, dimensions);
  if (quantity === null) return null;
  const rate = resolveRate(billing, dimensions);
  if (rate.unit_scale <= 0 || rate.unit_price < 0) return null;
  return Math.max(
    Math.ceil((rate.unit_price * quantity) / rate.unit_scale),
    rate.minimum_charge,
  );
}

export type ResolvedRate = {
  label: string;
  dimensions: Record<string, string>;
  unit_price: number;
  unit_scale: number;
  minimum_charge: number;
};

// fallbackRate is the model's base price, used when no tier selector matches.
export function fallbackRate(billing: ModelBilling): ResolvedRate {
  return {
    label: 'Default',
    dimensions: {},
    unit_price: billing.unit_price,
    unit_scale: billing.unit_scale,
    minimum_charge: billing.minimum_charge,
  };
}

// resolveRate picks the tier whose selector matches the most request
// parameters, falling back to the base price. Every priced mode carries tiers:
// resolution for per-second video, quality and size for per-image models.
export function resolveRate(
  billing: ModelBilling,
  dimensions: Record<string, string>,
): ResolvedRate {
  const fallback = fallbackRate(billing);
  if (billing.mode === 'free') return fallback;
  let selected: ResolvedRate = fallback;
  let mostSpecific = -1;
  for (const rate of billing.rates ?? []) {
    const entries = Object.entries(rate.dimensions ?? {});
    if (!entries.every(([name, expected]) => dimensions[name] === expected))
      continue;
    if (entries.length <= mostSpecific) continue;
    selected = { ...rate, dimensions: rate.dimensions ?? {} };
    mostSpecific = entries.length;
  }
  return selected;
}

// unitAmount is the price of one billable unit at a rate, in minor units, for a
// price table. It ignores the minimum charge, which applies to the total.
export function unitAmount(rate: ResolvedRate) {
  if (rate.unit_scale <= 0) return 0;
  return rate.unit_price / rate.unit_scale;
}

// setPointer writes value at an RFC 6901 pointer, creating the objects and
// arrays the path implies. It mirrors the gateway's own pointer writer.
export function setPointer(
  target: Record<string, unknown>,
  pointer: string,
  value: unknown,
) {
  const tokens = pointer
    .replace(/^\//, '')
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = target;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const key = tokens[index];
    const childIsArray = /^\d+$/.test(tokens[index + 1]);
    const child = node[key];
    if (
      typeof child !== 'object' ||
      child === null ||
      Array.isArray(child) !== childIsArray
    ) {
      node[key] = childIsArray ? [] : {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[tokens[tokens.length - 1]] = value;
}

function contentSlots(
  content: NonNullable<RequestForm['prompt']['content']>,
): MediaSlot[] {
  return (content.media ?? []).flatMap((media) => {
    const roles = media.roles?.length
      ? media.roles
      : [media.default_role ?? ''];
    return roles.map((role) => ({
      id: `${media.type}:${role}`,
      group: isFrameRole(role) ? ('frame' as const) : ('reference' as const),
      label: formatLabel(role || media.type.replace(/_url$/, '')),
      mimePrefix: media.mime_prefix,
      multiple: !isFrameRole(role),
      content: {
        pointer: content.pointer,
        type: media.type,
        field: media.field,
        urlField: media.url_field,
        role,
      },
    }));
  });
}

function inputSlots(inputs: FormInput[]): MediaSlot[] {
  return inputs.map((input) => ({
    id: input.pointer,
    group: isFrameRole(input.name)
      ? ('frame' as const)
      : ('reference' as const),
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
  if (slot.group !== 'frame')
    return 10 + kindOrder.indexOf(mediaKind(slot.mimePrefix));
  const label = slot.label.toLowerCase();
  const position = framePositions.findIndex((keyword) =>
    label.includes(keyword),
  );
  return position < 0 ? framePositions.length : position;
}

// Every model is served from its own path prefix, which is the model id.
export function modelPathSlug(value: string) {
  return value.trim().toLowerCase();
}
