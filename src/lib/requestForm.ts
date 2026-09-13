import { formatLabel } from '../format';
import { getLocale, translate } from '../i18n';
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
  // The slot's name in the provider's own words. It is translated where it is
  // shown, so the slots of a form never go stale when the language changes.
  name: string;
  mimePrefix: string;
  multiple: boolean;
  // How many files the provider takes in this slot, when it says.
  maxItems?: number;
  // Exactly one placement is set: a typed content item, or a flat body field.
  content?: {
    pointer: string;
    type: string;
    field: string;
    urlField: string;
    flat: boolean;
    typedByKey: boolean;
    role: string;
  };
  // A typed input names each entry's purpose in `typeField`.
  input?: {
    pointer: string;
    array: boolean;
    typeField?: string;
    type?: string;
  };
  // The role in the provider's own words, which orders frames regardless of
  // the language the label is shown in.
  role?: string;
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
  'aigc_watermark',
  'watermark',
]);

export function isHiddenParameter(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    HIDDEN_PARAMETERS.has(lower) ||
    lower.includes('watermark') ||
    lower === 'aigc_watermark'
  );
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
      content.typed_by_key
        ? { [content.text_field]: prompt }
        : { type: content.text_type, [content.text_field]: prompt },
    ];
    for (const { slot, url } of media) {
      if (!slot.content) continue;
      const { type, field, urlField, flat, typedByKey, role } = slot.content;
      items.push({
        ...(typedByKey ? {} : { type }),
        ...(flat ? { [urlField]: url } : { [field]: { [urlField]: url } }),
        ...(role ? { role } : {}),
      });
    }
    setPointer(body, content.pointer, items);
  } else {
    setPointer(body, form.prompt.pointer ?? '/prompt', prompt);
    const grouped = new Map<string, { array: boolean; items: unknown[] }>();
    for (const { slot, url } of media) {
      if (!slot.input) continue;
      const { pointer, array, typeField, type } = slot.input;
      const entry = grouped.get(pointer) ?? { array, items: [] };
      entry.items.push(typeField && type ? { [typeField]: type, url } : url);
      grouped.set(pointer, entry);
    }
    for (const [pointer, { array, items }] of grouped) {
      setPointer(body, pointer, array ? items : items[0]);
    }
  }

  for (const parameter of form.parameters ?? []) {
    const raw = parameters[parameter.name] ?? '';
    if (raw === '') {
      if (parameter.required)
        throw new Error(
          translate('form.required', {
            label: formatLabel(parameter.name, getLocale()),
          }),
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
        translate('form.integer', {
          label: formatLabel(parameter.name, getLocale()),
        }),
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
  if (!rate || rate.unit_scale <= 0 || rate.unit_price < 0) return null;
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

// resolveRate picks the rate a request is charged: the one whose selector
// matches the most request parameters. It returns null when no rate matches,
// which the gateway refuses rather than charging a fallback — so the console
// shows the gap instead of a price nobody set.
export function resolveRate(
  billing: ModelBilling,
  dimensions: Record<string, string>,
): ResolvedRate | null {
  if (billing.mode === 'free') {
    return {
      label: 'Free',
      dimensions: {},
      unit_price: 0,
      unit_scale: 1,
      minimum_charge: 0,
    };
  }
  let selected: ResolvedRate | null = null;
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
      name: role || media.type.replace(/_url$/, ''),
      role,
      mimePrefix: media.mime_prefix,
      multiple: !isFrameRole(role),
      content: {
        pointer: content.pointer,
        type: media.type,
        field: media.field,
        urlField: media.url_field,
        flat: Boolean(media.flat),
        typedByKey: Boolean(content.typed_by_key),
        role,
      },
    }));
  });
}

function inputSlots(inputs: FormInput[]): MediaSlot[] {
  return inputs.flatMap((input) => {
    const array = Boolean(input.array);
    if (input.types?.length) {
      const typeField = input.type_field || 'type';
      return input.types.map((entry) => ({
        id: `${input.pointer}:${entry.type}`,
        group: isFrameRole(entry.role)
          ? ('frame' as const)
          : ('reference' as const),
        name: entry.type,
        role: entry.type,
        mimePrefix: entry.mime_prefix,
        multiple: array && entry.max_items !== 1,
        maxItems: entry.max_items,
        input: { pointer: input.pointer, array, typeField, type: entry.type },
      }));
    }
    const name = input.name ?? '';
    return [
      {
        id: input.pointer,
        group: isFrameRole(name) ? ('frame' as const) : ('reference' as const),
        name: name || 'media',
        role: name,
        mimePrefix: input.mime_prefix ?? '',
        multiple: array,
        maxItems: input.max_items,
        input: { pointer: input.pointer, array },
      },
    ];
  });
}

function isFrameRole(role: string) {
  return role === 'frame' || framePattern.test(role);
}

// Frames read start to end before the reference pool, and the pool follows the
// order a person expects to fill it: images, then video, then audio.
function slotRank(slot: MediaSlot) {
  if (slot.group !== 'frame')
    return 10 + kindOrder.indexOf(mediaKind(slot.mimePrefix));
  const role = (slot.role ?? slot.name).toLowerCase();
  const position = framePositions.findIndex((keyword) =>
    role.includes(keyword),
  );
  return position < 0 ? framePositions.length : position;
}

// Every model is served from its own path prefix, which is the model id.
export function modelPathSlug(value: string) {
  return value.trim().toLowerCase();
}
