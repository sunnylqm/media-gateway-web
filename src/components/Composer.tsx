import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Dialog, Select, Slider, Tabs } from 'radix-ui';
import {
  AudioLines, Film, Image as ImageIcon, ListFilter, Plus, RotateCw, Send, Trash2, Upload, X,
} from 'lucide-react';
import { api } from '../api';
import { formatAmount, formatBytes, formatLabel } from '../format';
import {
  acceptAttribute, buildRequestBody, defaultParameterValue, estimateAmount, mediaKind, mediaSlots,
  modelPathSlug, slotAccepts, type MediaKind, type MediaSlot,
} from '../lib/requestForm';
import type { Asset, FormParameter, PublicModel } from '../types';

type Mode = 'frame' | 'reference';

// One picked file, uploaded to the gateway's asset store as soon as it is
// chosen so submitting the job only has to send the reference, not the bytes.
type Attachment = {
  key: string;
  slotID: string;
  file: File;
  preview: string;
  status: 'uploading' | 'ready' | 'error';
  seconds?: number;
  url?: string;
  message?: string;
};

// What a provider accepts per media type is not published in the request form
// yet, so these ceilings stand in for it. They are the limits the reference
// console shows; replace them with profile-published values once the gateway
// carries max_items per media entry.
const referenceLimits: Record<MediaKind, { count: number; seconds?: number }> = {
  image: { count: 9 },
  video: { count: 3, seconds: 15 },
  audio: { count: 3, seconds: 15 },
  file: { count: 9 },
};

const kindIcon: Record<MediaKind, ReactNode> = {
  image: <ImageIcon size={19} />,
  video: <Film size={19} />,
  audio: <AudioLines size={19} />,
  file: <Upload size={19} />,
};

export function GenerationComposer({ models, onCreated }: {
  models: PublicModel[];
  onCreated: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [modality, setModality] = useState<'image' | 'video'>('video');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mode, setMode] = useState<Mode>('frame');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const availableModels = useMemo(
    () => models.filter((item) => item.modality === modality),
    [models, modality],
  );
  const selectedModel = useMemo(() => models.find((item) => item.id === model), [models, model]);
  const form = selectedModel?.request_form;
  const slots = useMemo(() => mediaSlots(form), [form]);
  const slotByID = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const frameSlots = useMemo(() => slots.filter((slot) => slot.group === 'frame'), [slots]);
  const referenceSlots = useMemo(() => slots.filter((slot) => slot.group === 'reference'), [slots]);
  const referenceKinds = useMemo(
    () => [...new Set(referenceSlots.map((slot) => mediaKind(slot.mimePrefix)))],
    [referenceSlots],
  );

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.preview));
      return [];
    });
  }, []);

  // A workspace with no video model still has to open on something usable.
  useEffect(() => {
    if (availableModels.some((item) => item.id === model)) return;
    if (!availableModels.length && models.length) {
      setModality(models[0].modality);
      return;
    }
    setModel(availableModels[0]?.id ?? '');
  }, [availableModels, model, models]);

  // Each model publishes its own parameters and media vocabulary, so the form
  // restarts from that model's declared defaults rather than carrying values.
  useEffect(() => {
    const parameterForms = models.find((item) => item.id === model)?.request_form?.parameters ?? [];
    setParameters(Object.fromEntries(parameterForms.map((parameter) => [
      parameter.name, defaultParameterValue(parameter),
    ])));
    clearAttachments();
    setError('');
  }, [model, models, clearAttachments]);

  // A model that publishes only one of the two groups opens on it; a model
  // that publishes both opens on frames, the narrower choice.
  useEffect(() => {
    if (mode === 'frame' && !frameSlots.length && referenceSlots.length) setMode('reference');
    if (mode === 'reference' && !referenceSlots.length && frameSlots.length) setMode('frame');
  }, [mode, frameSlots, referenceSlots]);

  useEffect(() => clearAttachments, [clearAttachments]);

  async function upload(attachment: Attachment) {
    const body = new FormData();
    body.append('file', attachment.file);
    try {
      const asset = await api<Asset>('/v1/assets', { method: 'POST', body });
      setAttachments((current) => current.map((item) => item.key === attachment.key
        ? { ...item, status: 'ready', url: `asset://${asset.id}`, message: undefined }
        : item));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The upload failed';
      setAttachments((current) => current.map((item) => item.key === attachment.key
        ? { ...item, status: 'error', message }
        : item));
    }
  }

  // Timed media counts against a total length, so the clip is measured in the
  // browser rather than waiting for the provider to reject it.
  function measure(attachment: Attachment) {
    const kind = mediaKind(attachment.file.type);
    if (kind !== 'video' && kind !== 'audio') return;
    const element = document.createElement(kind);
    element.preload = 'metadata';
    element.src = attachment.preview;
    element.onloadedmetadata = () => setAttachments((current) => current.map((item) => item.key === attachment.key
      ? { ...item, seconds: Number.isFinite(element.duration) ? element.duration : undefined }
      : item));
  }

  function attach(files: File[], target?: MediaSlot) {
    const candidates = target ? [target] : (mode === 'frame' ? frameSlots : referenceSlots);
    const additions: Attachment[] = [];
    const room = new Map(referenceKinds.map((kind) => [kind, referenceLimits[kind].count - countOf(kind)]));
    let rejected = '';
    for (const file of files) {
      const slot = candidates.find((item) => slotAccepts(item, file.type));
      if (!slot) {
        rejected = `${file.name} is not a media type this model accepts`;
        continue;
      }
      if (slot.group === 'reference') {
        const kind = mediaKind(slot.mimePrefix);
        const remaining = room.get(kind) ?? referenceLimits[kind].count;
        if (remaining <= 0) {
          rejected = `At most ${referenceLimits[kind].count} ${kind} references`;
          continue;
        }
        room.set(kind, remaining - 1);
      }
      additions.push({
        key: crypto.randomUUID(), slotID: slot.id, file,
        preview: URL.createObjectURL(file), status: 'uploading',
      });
    }
    setError(rejected);
    if (!additions.length) return;
    // A single-file slot holds the newest pick, whether the earlier one came
    // from this drop or from a previous one.
    const kept: Attachment[] = [];
    for (const addition of additions) {
      if (!slotByID.get(addition.slotID)?.multiple) {
        const previous = kept.findIndex((item) => item.slotID === addition.slotID);
        if (previous >= 0) URL.revokeObjectURL(kept.splice(previous, 1)[0].preview);
      }
      kept.push(addition);
    }
    const singles = new Set(kept.map((item) => item.slotID)
      .filter((id) => !slotByID.get(id)?.multiple));
    const replaced = attachments.filter((item) => singles.has(item.slotID));
    setAttachments([...attachments.filter((item) => !singles.has(item.slotID)), ...kept]);
    replaced.forEach((item) => URL.revokeObjectURL(item.preview));
    kept.forEach((item) => { void upload(item); measure(item); });
  }

  function detach(key: string) {
    const removed = attachments.find((item) => item.key === key);
    setAttachments(attachments.filter((item) => item.key !== key));
    if (removed) URL.revokeObjectURL(removed.preview);
  }

  function reassign(key: string, slotID: string) {
    setAttachments(attachments.map((item) => item.key === key ? { ...item, slotID } : item));
  }

  function countOf(kind: MediaKind) {
    return references.filter((item) => mediaKind(item.file.type) === kind).length;
  }

  const references = useMemo(
    () => attachments.filter((item) => slotByID.get(item.slotID)?.group === 'reference'),
    [attachments, slotByID],
  );
  const activeAttachments = useMemo(
    () => attachments.filter((item) => slotByID.get(item.slotID)?.group === mode),
    [attachments, slotByID, mode],
  );
  const promptLength = useMemo(() => [...prompt].length, [prompt]);
  const maxRunes = form?.prompt.max_runes ?? 0;
  const promptTooLong = maxRunes > 0 && promptLength > maxRunes;
  const uploading = activeAttachments.some((item) => item.status === 'uploading');
  const uploadFailed = activeAttachments.some((item) => item.status === 'error');
  const estimate = selectedModel ? estimateAmount(selectedModel.billing, parameters) : null;
  const currency = selectedModel?.billing.currency ?? '';
  const price = estimate === null || !currency ? '' : estimate === 0 ? 'Free' : formatAmount(estimate, currency);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!form) {
      setError('This model does not publish a request form');
      return;
    }
    if (uploading || uploadFailed) {
      setError(uploading ? 'Wait for every upload to finish' : 'Remove or retry the failed upload');
      return;
    }
    setCreating(true);
    try {
      const ordered = slots.flatMap((slot) => activeAttachments
        .filter((item) => item.slotID === slot.id)
        .map((item) => ({ slot, url: item.url ?? '' })));
      const body = buildRequestBody(form, model, prompt, parameters, ordered);
      await api(`/${modelPathSlug(model)}${form.path}`, {
        method: form.method || 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      setPrompt('');
      clearAttachments();
      setOpen(false);
      await onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create generation');
    } finally {
      setCreating(false);
    }
  }

  // The two media groups share one panel: a model that offers both gets tabs,
  // and a model that offers one shows it without a control that has no choice.
  const tabbed = frameSlots.length > 0 && referenceSlots.length > 0;
  const panel = (value: Mode, children: ReactNode) => tabbed
    ? <Tabs.Content value={value} className="composer-section">{children}</Tabs.Content>
    : <div className="composer-section">{children}</div>;

  const mediaSections = <>
    {frameSlots.length > 0 && panel('frame', <>
      <div className="section-heading">
        <b>Images</b>
        <small>{frameSlots.length > 1
          ? 'Set the first and last frame to control how the clip starts and ends.'
          : 'Set the first frame to control how the clip starts.'}</small>
      </div>
      <div className="frame-grid">
        {frameSlots.map((slot) => <FrameCard
          key={slot.id}
          slot={slot}
          attachment={attachments.find((item) => item.slotID === slot.id)}
          onAttach={(files) => attach(files, slot)}
          onDetach={detach}
          onRetry={upload}
        />)}
      </div>
    </>)}
    {referenceSlots.length > 0 && panel('reference', <>
      <div className="section-heading">
        <b>Reference material</b>
        <div className="counter-row">
          {referenceKinds.map((kind) => <Counter key={kind} kind={kind} attachments={references} />)}
        </div>
      </div>
      <Dropzone accept={acceptAttribute(referenceSlots)} onFiles={(files) => attach(files)} />
      {references.length > 0 && <div className="reference-grid">
        {references.map((item, index) => <ReferenceCard
          key={item.key}
          index={index + 1}
          attachment={item}
          slot={slotByID.get(item.slotID)!}
          roles={referenceSlots.filter((slot) => slotAccepts(slot, item.file.type))}
          onRole={(slotID) => reassign(item.key, slotID)}
          onDetach={() => detach(item.key)}
          onRetry={() => void upload(item)}
        />)}
      </div>}
    </>)}
  </>;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(''); }}>
      <Dialog.Trigger className="button primary"><Plus size={16} /> New generation</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content composer-dialog" aria-describedby={undefined}>
          <div className="dialog-heading">
            <div>
              <Dialog.Title>New generation</Dialog.Title>
              <Dialog.Description>Send the selected provider's native request through the gateway.</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button"><X size={18} /></Dialog.Close>
          </div>
          <form onSubmit={submit} className="composer-form">
            <div className="composer-body">
              <div className="composer-models">
                <label className="field">
                  <span className="field-label">Modality</span>
                  <Picker value={modality} onChange={(value) => setModality(value as 'image' | 'video')} options={[
                    { value: 'image', label: 'Image' },
                    { value: 'video', label: 'Video' },
                  ]} />
                </label>
                <label className="field">
                  <span className="field-label">Model</span>
                  <Picker
                    value={model}
                    onChange={setModel}
                    options={availableModels.map((item) => ({ value: item.id, label: item.display_name }))}
                  />
                </label>
              </div>

              <Tabs.Root value={mode} onValueChange={(value) => setMode(value as Mode)} className="composer-tabs">
                {tabbed && <Tabs.List className="mode-tabs" aria-label="Reference mode">
                  <Tabs.Trigger className="mode-tab" value="frame">
                    Text / image to video{countBadge(attachments, slotByID, 'frame')}
                  </Tabs.Trigger>
                  <Tabs.Trigger className="mode-tab" value="reference">
                    Multi-reference{countBadge(attachments, slotByID, 'reference')}
                  </Tabs.Trigger>
                </Tabs.List>}
                {tabbed && attachments.length > activeAttachments.length && <p className="tab-note">
                  The other tab holds {attachments.length - activeAttachments.length} file
                  {attachments.length - activeAttachments.length > 1 ? 's' : ''} this request will not include.
                </p>}

                <div className="field composer-prompt">
                  <span className="field-label">Prompt</span>
                  <div className="prompt-box">
                    <textarea
                      required
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="Describe the shot: subject, action, camera, lighting…"
                    />
                    <span className={promptTooLong ? 'prompt-count over' : 'prompt-count'}>
                      {promptLength}{maxRunes > 0 ? ` / ${maxRunes}` : ''}
                    </span>
                  </div>
                </div>

                {mediaSections}
              </Tabs.Root>

              {(form?.parameters ?? []).length > 0 && <div className="parameter-grid">
                {(form?.parameters ?? []).map((parameter) => <ParameterTile
                  key={parameter.name}
                  parameter={parameter}
                  value={parameters[parameter.name] ?? ''}
                  onChange={(value) => setParameters((current) => ({ ...current, [parameter.name]: value }))}
                />)}
              </div>}

              {!availableModels.length && (
                <div className="warning-box"><span>No active {modality} model is configured.</span></div>
              )}
              {selectedModel && !form && (
                <div className="warning-box"><span>This model does not publish a request form.</span></div>
              )}
              {error && <div className="form-error" role="alert">{error}</div>}
            </div>

            <div className="composer-footer">
              {selectedModel?.billing.mode === 'per_output_second' && <small className="footer-note">
                Estimated from the requested length. The final charge follows the delivered output.
              </small>}
              <button className="button primary create-button" disabled={creating || !model || !form || promptTooLong || uploading}>
                <Send size={15} />
                {creating ? 'Submitting…' : `Create generation${price ? ` (${price})` : ''}`}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function countBadge(attachments: Attachment[], slotByID: Map<string, MediaSlot>, group: Mode) {
  const count = attachments.filter((item) => slotByID.get(item.slotID)?.group === group).length;
  return count ? <i className="segment-count">{count}</i> : null;
}

function Counter({ kind, attachments }: { kind: MediaKind; attachments: Attachment[] }) {
  const limit = referenceLimits[kind];
  const matching = attachments.filter((item) => mediaKind(item.file.type) === kind);
  const seconds = matching.reduce((total, item) => total + (item.seconds ?? 0), 0);
  const over = matching.length > limit.count || (limit.seconds !== undefined && seconds > limit.seconds);
  return <span className={`counter${matching.length ? ' filled' : ''}${over ? ' over' : ''}`}>
    {kindIcon[kind]}
    {matching.length}/{limit.count}
    {limit.seconds !== undefined && ` (${Math.round(seconds)}s/${limit.seconds}s)`}
  </span>;
}

function Dropzone({ accept, onFiles }: { accept: string; onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  return <label
    className={over ? 'dropzone over' : 'dropzone'}
    onDragOver={(event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setOver(true); }}
    onDragLeave={() => setOver(false)}
    onDrop={(event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setOver(false);
      onFiles([...event.dataTransfer.files]);
    }}
  >
    <Plus size={17} />
    <span>Click or drop images, video, or audio</span>
    <input type="file" accept={accept} multiple onChange={(event) => {
      onFiles([...(event.target.files ?? [])]);
      event.target.value = '';
    }} />
  </label>;
}

function FrameCard({ slot, attachment, onAttach, onDetach, onRetry }: {
  slot: MediaSlot;
  attachment?: Attachment;
  onAttach: (files: File[]) => void;
  onDetach: (key: string) => void;
  onRetry: (attachment: Attachment) => void;
}) {
  const [over, setOver] = useState(false);
  if (attachment) {
    return <figure className="frame-card filled">
      <MediaPreview attachment={attachment} />
      <figcaption>
        <div><b>{slot.label}</b><small>{formatBytes(attachment.file.size)}</small></div>
        <AttachmentActions attachment={attachment} onDetach={() => onDetach(attachment.key)} onRetry={() => onRetry(attachment)} />
      </figcaption>
    </figure>;
  }
  return <label
    className={over ? 'frame-card over' : 'frame-card'}
    onDragOver={(event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setOver(true); }}
    onDragLeave={() => setOver(false)}
    onDrop={(event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setOver(false);
      onAttach([...event.dataTransfer.files]);
    }}
  >
    {kindIcon[mediaKind(slot.mimePrefix)]}
    <b>{slot.label}</b>
    <small>Click or drop</small>
    <input type="file" accept={`${slot.mimePrefix}*`} onChange={(event) => {
      onAttach([...(event.target.files ?? [])]);
      event.target.value = '';
    }} />
  </label>;
}

function ReferenceCard({ index, attachment, slot, roles, onRole, onDetach, onRetry }: {
  index: number;
  attachment: Attachment;
  slot: MediaSlot;
  roles: MediaSlot[];
  onRole: (slotID: string) => void;
  onDetach: () => void;
  onRetry: () => void;
}) {
  return <figure className="reference-card">
    <span className="reference-index">{index}</span>
    <MediaPreview attachment={attachment} />
    <figcaption>
      {roles.length > 1
        ? <select value={slot.id} onChange={(event) => onRole(event.target.value)} aria-label={`Role for ${attachment.file.name}`}>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
          </select>
        : <div>
            <b>{slot.label}</b>
            <small>{attachment.seconds ? `${Math.round(attachment.seconds)}s · ` : ''}{formatBytes(attachment.file.size)}</small>
          </div>}
      <AttachmentActions attachment={attachment} onDetach={onDetach} onRetry={onRetry} />
    </figcaption>
  </figure>;
}

function AttachmentActions({ attachment, onDetach, onRetry }: {
  attachment: Attachment;
  onDetach: () => void;
  onRetry: () => void;
}) {
  return <div className="attachment-actions">
    {attachment.status === 'uploading' && <span className="loader small" aria-label="Uploading" />}
    {attachment.status === 'error' && <button type="button" className="row-action" title={attachment.message} onClick={onRetry} aria-label="Retry upload"><RotateCw size={13} /></button>}
    <button type="button" className="row-action" onClick={onDetach} aria-label={`Remove ${attachment.file.name}`}><Trash2 size={13} /></button>
  </div>;
}

function MediaPreview({ attachment }: { attachment: Attachment }) {
  const kind = mediaKind(attachment.file.type);
  const failed = attachment.status === 'error';
  return <div className={failed ? 'media-preview failed' : 'media-preview'}>
    {kind === 'image' && <img src={attachment.preview} alt={attachment.file.name} />}
    {kind === 'video' && <video src={attachment.preview} muted playsInline preload="metadata" />}
    {kind !== 'image' && kind !== 'video' && <span className="media-glyph">{kindIcon[kind]}</span>}
    {failed && <span className="media-note">{attachment.message}</span>}
  </div>;
}

// Each declared parameter becomes the control its own shape implies: chips for
// a short vocabulary, a slider for a bounded number, a field for the rest. A
// long vocabulary takes the full row so every value stays on one line.
function ParameterTile({ parameter, value, onChange }: {
  parameter: FormParameter;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = formatLabel(parameter.name);
  const options = parameter.type === 'boolean'
    ? [{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }]
    : (parameter.enum ?? []).map((option) => ({ value: option, label: option }));
  const chips = options.length > 0 && options.length <= 8 && options.every((option) => option.label.length <= 10);
  const ranged = parameter.type === 'integer'
    && parameter.minimum !== undefined && parameter.maximum !== undefined
    && parameter.maximum > parameter.minimum;

  if (chips) {
    const choices = parameter.required ? options : [{ value: '', label: 'Auto' }, ...options];
    return <div className={choices.length > 3 ? 'parameter-tile wide' : 'parameter-tile'}>
      <span className="tile-label">{label}</span>
      <div className="segmented compact" role="radiogroup" aria-label={label}>
        {choices.map((option) => <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'segment active' : 'segment'}
          onClick={() => onChange(option.value)}
        >{option.label}</button>)}
      </div>
    </div>;
  }

  if (ranged) {
    const minimum = Number(parameter.minimum);
    const maximum = Number(parameter.maximum);
    const current = value === '' ? minimum : Number(value);
    return <div className="parameter-tile">
      <span className="tile-label">{label}</span>
      <div className="slider-cell">
        <Slider.Root
          className="slider"
          min={minimum}
          max={maximum}
          step={1}
          value={[current]}
          onValueChange={([next]) => onChange(String(next))}
        >
          <Slider.Track className="slider-track"><Slider.Range className="slider-range" /></Slider.Track>
          <Slider.Thumb className="slider-thumb" aria-label={label} />
        </Slider.Root>
        <div className="slider-scale">
          <small>{formatQuantity(parameter.name, minimum)}</small>
          <b>{value === '' ? 'Auto' : formatQuantity(parameter.name, current)}</b>
          <small>{formatQuantity(parameter.name, maximum)}</small>
        </div>
      </div>
    </div>;
  }

  if (options.length) {
    return <div className="parameter-tile">
      <span className="tile-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {!parameter.required && <option value="">Provider default</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>;
  }

  return <div className="parameter-tile">
    <span className="tile-label">{label}</span>
    <input
      type={parameter.type === 'integer' ? 'number' : 'text'}
      min={parameter.minimum}
      max={parameter.maximum}
      required={parameter.required}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>;
}

function Picker({ value, onChange, options }: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return <Select.Root value={value} onValueChange={onChange}>
    <Select.Trigger className="select-trigger"><Select.Value /><Select.Icon><ListFilter size={15} /></Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content className="select-content" position="popper"><Select.Viewport>
      {options.map((option) => <Select.Item className="select-item" value={option.value} key={option.value}>
        <Select.ItemText>{option.label}</Select.ItemText>
      </Select.Item>)}
    </Select.Viewport></Select.Content></Select.Portal>
  </Select.Root>;
}

// Seconds are the one unit worth spelling out: a bare number next to a slider
// reads as an index rather than a length.
function formatQuantity(name: string, value: number) {
  return /duration|second/i.test(name) ? `${value}s` : String(value);
}
