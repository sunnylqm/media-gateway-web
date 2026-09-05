import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Slider } from 'radix-ui';
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { absoluteGatewayURL, api } from '../api';
import { GenerationDetails } from '../components/Generations';
import { PriceTable } from '../components/PriceTable';
import { ShareOptions } from '../components/ShareOptions';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { formatDimensionOption, formatLabel, formatQuantity } from '../format';
import { useI18n } from '../i18n';
import { useMoney } from '../lib/money';
import {
  buildRequestBody,
  defaultParameterValue,
  estimateAmount,
  fallbackRate,
  isHiddenParameter,
  type MediaSlot,
  mediaSlots,
  unitAmount,
} from '../lib/requestForm';
import {
  readSharePreference,
  type SharePreference,
  withShareParams,
  writeSharePreference,
} from '../lib/share';
import type {
  AdminModel,
  Artifact,
  Asset,
  FormParameter,
  Generation,
  PublicModel,
  User,
} from '../types';

type Attachment = {
  key: string;
  slotID: string;
  file: File;
  preview: string;
  status: 'uploading' | 'ready' | 'error';
  url?: string;
  message?: string;
};

export function ImagePlayground({
  models,
  generations,
  onCreated,
  admin = false,
  user,
}: {
  models: Array<PublicModel | AdminModel>;
  generations: Generation[];
  onCreated: () => Promise<void> | void;
  admin?: boolean;
  user?: User;
}) {
  const { t, locale } = useI18n();
  const { money } = useMoney();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageAllowed = admin || user?.image_enabled !== false;
  const imageModels = useMemo(
    () => models.filter((item) => item.modality === 'image'),
    [models],
  );

  const [modelId, setModelId] = useState<string>(
    () => imageModels[0]?.id ?? '',
  );
  useEffect(() => {
    if (!imageModels.length) return;
    if (!modelId || !imageModels.some((m) => m.id === modelId)) {
      setModelId(imageModels[0].id);
    }
  }, [imageModels, modelId]);

  const selectedModel = useMemo(
    () => imageModels.find((m) => m.id === modelId),
    [imageModels, modelId],
  );
  const form = selectedModel?.request_form;

  const modelPriceTag = useMemo(() => {
    if (!selectedModel) return '';
    const billing = selectedModel.billing;
    if (billing.mode === 'free') return t('composer.free');
    const currency = billing.currency;
    const unit = t('composer.unitImage');
    const rates = billing.rates ?? [];
    if (rates.length === 0) {
      const base = unitAmount(fallbackRate(billing));
      return `${money(base, currency)} / ${unit}`;
    }
    const prices = rates.map((r) =>
      unitAmount({ ...r, dimensions: r.dimensions ?? {} }),
    );
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) {
      return `${money(min, currency)} / ${unit}`;
    }
    return `${money(min, currency)} ~ ${money(max, currency)} / ${unit}`;
  }, [selectedModel, t, money]);

  const [prompt, setPrompt] = useState('');
  const [parameters, setParameters] = useState<Record<string, string>>({});

  const estimate = selectedModel
    ? estimateAmount(selectedModel.billing, parameters)
    : null;
  const currency = selectedModel?.billing.currency ?? '';
  const price =
    estimate === null || !currency
      ? ''
      : estimate === 0
        ? t('composer.free')
        : money(estimate, currency);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [creating, setCreating] = useState(false);
  // The plaza choice is remembered per browser so it is not re-made on every
  // visit; the first visit gets share-on, prompt-off.
  const [sharing, setSharing] = useState<SharePreference>(readSharePreference);
  const [error, setError] = useState('');

  const [inputTab, setInputTab] = useState<'form' | 'json'>('form');
  const [outputTab, setOutputTab] = useState<'preview' | 'json'>('preview');

  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const slots = useMemo(() => mediaSlots(form), [form]);
  const imageRefSlots = useMemo(
    () =>
      slots.filter(
        (slot) =>
          slot.group === 'reference' && slot.mimePrefix.startsWith('image'),
      ),
    [slots],
  );

  // Parameter signature to safely restart parameters on model change
  const parameterSignature = useMemo(
    () => JSON.stringify({ modelId, parameters: form?.parameters ?? [] }),
    [modelId, form],
  );

  useEffect(() => {
    const { parameters: parameterForms } = JSON.parse(parameterSignature) as {
      parameters: FormParameter[];
    };
    setParameters(
      Object.fromEntries(
        parameterForms.map((p) => [p.name, defaultParameterValue(p)]),
      ),
    );
    setError('');
  }, [parameterSignature]);

  // Clean object URLs on unmount
  useEffect(() => {
    return () => {
      for (const item of attachments) {
        URL.revokeObjectURL(item.preview);
      }
    };
  }, [attachments]);

  // Active generation tracking
  const imageGenerations = useMemo(
    () => generations.filter((g) => g.modality === 'image'),
    [generations],
  );

  const [activeGenId, setActiveGenId] = useState<string | null>(null);
  const [activeGen, setActiveGen] = useState<Generation | null>(null);
  const [activeArtifacts, setActiveArtifacts] = useState<Artifact[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>(
    {},
  );
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  // Select newest generation if none is active
  useEffect(() => {
    if (!activeGenId && imageGenerations.length > 0) {
      setActiveGenId(imageGenerations[0].id);
    }
  }, [activeGenId, imageGenerations]);

  // Fetch details and artifacts for active generation
  const fetchActiveDetails = useCallback(
    async (id: string) => {
      try {
        const [freshGen, artifactList] = await Promise.all([
          api<Generation>(
            admin ? `/v1/admin/generations/${id}` : `/v1/generations/${id}`,
            {},
            admin,
          ),
          api<{ data: Artifact[] }>(
            admin
              ? `/v1/admin/generations/${id}/artifacts`
              : `/v1/generations/${id}/artifacts`,
            {},
            admin,
          ),
        ]);
        setActiveGen(freshGen);
        setActiveArtifacts(artifactList.data);
        if (artifactList.data.length > 0) {
          const firstImage =
            artifactList.data.find((a) => a.mime_type.startsWith('image/')) ??
            artifactList.data[0];
          if (firstImage?.url) {
            setThumbnails((prev) =>
              prev[id] === firstImage.url
                ? prev
                : { ...prev, [id]: firstImage.url },
            );
          }
        }
        return freshGen;
      } catch {
        // keep current active gen if background fetch fails
        return null;
      }
    },
    [admin],
  );

  useEffect(() => {
    if (!activeGenId) {
      setActiveGen(null);
      setActiveArtifacts([]);
      return;
    }
    setDetailsLoading(true);
    fetchActiveDetails(activeGenId).finally(() => setDetailsLoading(false));
  }, [activeGenId, fetchActiveDetails]);

  // Fetch thumbnails for visible recent generations that are completed
  const pendingThumbIds = useMemo(() => {
    return imageGenerations
      .slice(0, 14)
      .filter((g) => g.status === 'completed' && thumbnails[g.id] === undefined)
      .map((g) => g.id);
  }, [imageGenerations, thumbnails]);

  useEffect(() => {
    if (pendingThumbIds.length === 0) return;
    let cancelled = false;

    Promise.all(
      pendingThumbIds.map(async (id) => {
        try {
          const res = await api<{ data: Artifact[] }>(
            admin
              ? `/v1/admin/generations/${id}/artifacts`
              : `/v1/generations/${id}/artifacts`,
            {},
            admin,
          );
          const firstImage =
            res.data.find((a) => a.mime_type.startsWith('image/')) ??
            res.data[0];
          return { id, url: firstImage?.url ?? null };
        } catch {
          return { id, url: null };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setThumbnails((prev) => {
        const next = { ...prev };
        for (const item of results) {
          next[item.id] = item.url;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pendingThumbIds, admin]);

  // Poll in-flight active generation
  useEffect(() => {
    if (
      !activeGen ||
      !['queued', 'submitting', 'submitted', 'in_progress'].includes(
        activeGen.status,
      )
    ) {
      return;
    }
    const timer = window.setInterval(async () => {
      const freshGen = await fetchActiveDetails(activeGen.id);
      if (freshGen && ['completed', 'failed'].includes(freshGen.status)) {
        await onCreated();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeGen, fetchActiveDetails, onCreated]);

  // Reference upload
  async function uploadFile(file: File) {
    const defaultSlot = imageRefSlots[0] ?? {
      id: 'image_ref',
      group: 'reference' as const,
      label: 'Image Reference',
      mimePrefix: 'image/',
      multiple: true,
    };
    const key = crypto.randomUUID();
    const item: Attachment = {
      key,
      slotID: defaultSlot.id,
      file,
      preview: URL.createObjectURL(file),
      status: 'uploading',
    };
    setAttachments((current) => [...current, item]);

    const body = new FormData();
    body.append('file', file);
    try {
      const asset = await api<Asset>(
        admin ? '/v1/admin/assets' : '/v1/assets',
        { method: 'POST', body },
        admin,
      );
      setAttachments((current) =>
        current.map((att) =>
          att.key === key
            ? {
                ...att,
                status: 'ready',
                url: asset.url ? absoluteGatewayURL(asset.url) : '',
              }
            : att,
        ),
      );
    } catch (err) {
      setAttachments((current) =>
        current.map((att) =>
          att.key === key
            ? {
                ...att,
                status: 'error',
                message:
                  err instanceof Error
                    ? err.message
                    : t('composer.errorUpload'),
              }
            : att,
        ),
      );
    }
  }

  function handleFiles(files: FileList | File[]) {
    const remaining = Math.max(0, 3 - attachments.length);
    if (remaining <= 0) return;
    const filesToAdd = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, remaining);
    for (const file of filesToAdd) {
      void uploadFile(file);
    }
  }

  function removeAttachment(key: string) {
    setAttachments((current) => {
      const target = current.find((att) => att.key === key);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((att) => att.key !== key);
    });
  }

  function handleReset() {
    setPrompt('');
    for (const att of attachments) {
      URL.revokeObjectURL(att.preview);
    }
    setAttachments([]);
    if (form?.parameters) {
      setParameters(
        Object.fromEntries(
          form.parameters.map((p) => [p.name, defaultParameterValue(p)]),
        ),
      );
    }
    setError('');
  }

  const isUploading = attachments.some((item) => item.status === 'uploading');

  // Submit Generation
  async function handleGenerate(e?: FormEvent) {
    e?.preventDefault();
    if (!prompt.trim()) return;
    if (!form || !modelId) {
      setError(t('composer.errorNoForm'));
      return;
    }
    if (isUploading) {
      setError(t('composer.errorUploading'));
      return;
    }

    setCreating(true);
    setError('');

    try {
      const orderedRefs = attachments
        .filter((att) => att.status === 'ready' && att.url)
        .map((att) => ({
          slot:
            slots.find((s) => s.id === att.slotID) ??
            ({
              id: att.slotID,
              group: 'reference' as const,
              label: 'Image Reference',
              mimePrefix: 'image/',
              multiple: true,
            } as MediaSlot),
          url: att.url as string,
        }));

      const body = buildRequestBody(
        form,
        modelId,
        prompt,
        parameters,
        orderedRefs,
      );

      const res = await api<Generation>(
        admin
          ? `/v1/admin/models/${encodeURIComponent(modelId)}/generations`
          : withShareParams('/v1/generations', sharing),
        {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify(body),
        },
        admin,
      );

      setActiveGenId(res.id);
      setActiveGen(res);
      setActiveArtifacts([]);
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('composer.errorCreate'));
    } finally {
      setCreating(false);
    }
  }

  function handlePromptKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleGenerate();
    }
  }

  // Request body for JSON tab preview
  const jsonRequestBody = useMemo(() => {
    if (!form) return '{}';
    try {
      const orderedRefs = attachments
        .filter((att) => att.status === 'ready' && att.url)
        .map((att) => ({
          slot:
            slots.find((s) => s.id === att.slotID) ??
            ({
              id: att.slotID,
              group: 'reference' as const,
              label: 'Image Reference',
              mimePrefix: 'image/',
              multiple: true,
            } as MediaSlot),
          url: att.url as string,
        }));
      const body = buildRequestBody(
        form,
        modelId,
        prompt || 'Sample prompt text...',
        parameters,
        orderedRefs,
      );
      return JSON.stringify(body, null, 2);
    } catch {
      return JSON.stringify({ model: modelId, prompt, parameters }, null, 2);
    }
  }, [form, modelId, prompt, parameters, attachments, slots]);

  const jsonResponseData = useMemo(() => {
    if (!activeGen) return null;
    return JSON.stringify(
      {
        ...activeGen,
        artifacts: activeArtifacts,
      },
      null,
      2,
    );
  }, [activeGen, activeArtifacts]);

  // Common parameters separation for matching screenshot layout
  const { resolutionParam, aspectParam, qualityParam, otherParams } =
    useMemo(() => {
      const params = form?.parameters ?? [];
      const res = params.find((p) =>
        /^(resolution|size|dimensions?)$/i.test(p.name),
      );
      const aspect = params.find((p) =>
        /^(aspect_ratio|aspectratio|ar)$/i.test(p.name),
      );
      const qual = params.find((p) => /^quality$/i.test(p.name));
      const others = params.filter(
        (p) =>
          p !== res && p !== aspect && p !== qual && !isHiddenParameter(p.name),
      );
      return {
        resolutionParam: res,
        aspectParam: aspect,
        qualityParam: qual,
        otherParams: others,
      };
    }, [form]);

  // Compute output stats string (e.g. 16:9 · 2816x1584 · 138s · $0.08)
  const metaStats = useMemo(() => {
    if (!activeGen) return '';
    const parts: string[] = [];

    // Aspect ratio
    const ar =
      (activeGen.parameters?.aspect_ratio as string) ||
      (activeGen.parameters?.ar as string) ||
      (aspectParam ? parameters[aspectParam.name] : '');
    if (ar) parts.push(ar);

    // Resolution / size
    const res =
      (activeGen.parameters?.resolution as string) ||
      (activeGen.parameters?.size as string) ||
      (resolutionParam ? parameters[resolutionParam.name] : '');
    if (res) parts.push(res);

    // Duration
    if (activeGen.created_at && activeGen.updated_at) {
      const secs = Math.max(
        1,
        Math.round(
          (new Date(activeGen.updated_at).getTime() -
            new Date(activeGen.created_at).getTime()) /
            1000,
        ),
      );
      parts.push(`${secs}s`);
    }

    // Cost
    const amt = activeGen.final_amount ?? activeGen.quote_amount;
    if (amt !== undefined && activeGen.currency) {
      parts.push(money(amt, activeGen.currency));
    }

    return parts.join(' · ');
  }, [activeGen, aspectParam, resolutionParam, parameters, money]);

  const activeArtifact = activeArtifacts[0];
  const activeImageUrl = activeArtifact?.url
    ? absoluteGatewayURL(activeArtifact.url)
    : '';

  return (
    <div className="playground-page">
      {/* Top bar: Playground icon, title */}
      <div className="playground-top-bar">
        <div className="playground-title-box">
          <span className="playground-icon-badge">
            <Sparkles size={17} />
          </span>
          <span>{t('playground.imageTitle')}</span>
        </div>
      </div>

      {!imageAllowed && (
        <div className="banner-error" role="alert">
          {t('playground.disabledModality', {
            modality: t('modality.image'),
          })}
        </div>
      )}

      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}

      {/* Main split 2-column layout */}
      <div className="playground-layout">
        {/* Left Column: INPUT */}
        <div className="playground-panel playground-input-panel">
          <div className="playground-panel-header">
            <div className="playground-model-select-wrap">
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={!imageAllowed || !imageModels.length}
                aria-label={t('playground.model')}
              >
                {imageModels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name} ({item.provider})
                  </option>
                ))}
              </select>
              {modelPriceTag && (
                <span className="playground-model-price-badge">
                  {modelPriceTag}
                </span>
              )}
            </div>
            <div className="playground-tab-group" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={inputTab === 'form'}
                className={`playground-tab-btn ${inputTab === 'form' ? 'active' : ''}`}
                onClick={() => setInputTab('form')}
              >
                <SlidersHorizontal size={13} />
                <span>{t('playground.form')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inputTab === 'json'}
                className={`playground-tab-btn ${inputTab === 'json' ? 'active' : ''}`}
                onClick={() => setInputTab('json')}
              >
                <Code2 size={13} />
                <span>{t('playground.json')}</span>
              </button>
            </div>
          </div>

          {inputTab === 'form' ? (
            <form
              onSubmit={handleGenerate}
              style={{ display: 'grid', gap: '18px' }}
            >
              {/* PROMPT section */}
              <div>
                <label
                  className="playground-field-label"
                  htmlFor="image-prompt-input"
                >
                  {t('playground.prompt')}
                </label>
                <div
                  className="playground-prompt-area"
                  style={{ marginTop: '6px' }}
                >
                  <textarea
                    id="image-prompt-input"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    placeholder={t('playground.promptPlaceholder')}
                    rows={4}
                  />
                  <div className="playground-prompt-hint">
                    <span>{t('playground.promptHint')}</span>
                    {form?.prompt.max_runes ? (
                      <span>
                        {prompt.length} / {form.prompt.max_runes}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Image References section */}
              <div>
                <div className="playground-field-label">
                  <span>{t('playground.imageReferences')}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="playground-tooltip-icon">
                        <Info size={13} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t('playground.referencesTooltip')}
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="playground-ref-list">
                  {attachments.length < 3 && (
                    <button
                      type="button"
                      className="ref-add-btn"
                      onClick={() => fileInputRef.current?.click()}
                      title={t('playground.add')}
                    >
                      <ImageIcon size={18} />
                      <span>{t('playground.add')}</span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files) handleFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />

                  {attachments.map((att) => (
                    <div key={att.key} className="ref-item-thumb">
                      <img src={att.preview} alt={att.file.name} />
                      <button
                        type="button"
                        className="ref-remove-btn"
                        onClick={() => removeAttachment(att.key)}
                        title={t('common.cancel')}
                      >
                        <Trash2 size={10} />
                      </button>
                      {att.status === 'uploading' && (
                        <div className="ref-spinner">
                          <Loader2 size={18} className="loader small" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Standard Parameters: Resolution & Aspect Ratio side by side */}
              <div className="playground-param-row">
                <div className="playground-param-col">
                  <span className="playground-param-label">
                    {resolutionParam
                      ? formatLabel(resolutionParam.name)
                      : t('playground.resolution')}
                  </span>
                  {resolutionParam?.enum?.length ? (
                    <select
                      className="playground-select"
                      value={parameters[resolutionParam.name] ?? ''}
                      onChange={(e) =>
                        setParameters((prev) => ({
                          ...prev,
                          [resolutionParam.name]: e.target.value,
                        }))
                      }
                    >
                      {resolutionParam.enum.map((opt) => (
                        <option key={opt} value={opt}>
                          {formatDimensionOption(opt, locale)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="playground-select"
                      value={
                        resolutionParam
                          ? (parameters[resolutionParam.name] ?? '')
                          : '2K'
                      }
                      onChange={(e) => {
                        if (resolutionParam) {
                          setParameters((prev) => ({
                            ...prev,
                            [resolutionParam.name]: e.target.value,
                          }));
                        }
                      }}
                    >
                      <option value="1K">1K</option>
                      <option value="2K">2K</option>
                      <option value="4K">4K</option>
                    </select>
                  )}
                </div>

                <div className="playground-param-col">
                  <span className="playground-param-label">
                    {aspectParam
                      ? formatLabel(aspectParam.name)
                      : t('playground.aspectRatio')}
                  </span>
                  {aspectParam?.enum?.length ? (
                    <select
                      className="playground-select"
                      value={parameters[aspectParam.name] ?? ''}
                      onChange={(e) =>
                        setParameters((prev) => ({
                          ...prev,
                          [aspectParam.name]: e.target.value,
                        }))
                      }
                    >
                      {aspectParam.enum.map((opt) => (
                        <option key={opt} value={opt}>
                          {formatDimensionOption(opt, locale)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="playground-select"
                      value={
                        aspectParam
                          ? (parameters[aspectParam.name] ?? '')
                          : '16:9'
                      }
                      onChange={(e) => {
                        if (aspectParam) {
                          setParameters((prev) => ({
                            ...prev,
                            [aspectParam.name]: e.target.value,
                          }));
                        }
                      }}
                    >
                      <option value="1:1">
                        {formatDimensionOption('1:1', locale)}
                      </option>
                      <option value="16:9">
                        {formatDimensionOption('16:9', locale)}
                      </option>
                      <option value="9:16">
                        {formatDimensionOption('9:16', locale)}
                      </option>
                      <option value="4:3">
                        {formatDimensionOption('4:3', locale)}
                      </option>
                      <option value="3:4">
                        {formatDimensionOption('3:4', locale)}
                      </option>
                      <option value="21:9">
                        {formatDimensionOption('21:9', locale)}
                      </option>
                    </select>
                  )}
                </div>
              </div>

              {/* Quality parameter below */}
              {qualityParam ? (
                <div className="playground-param-col">
                  <span className="playground-param-label">
                    {formatLabel(qualityParam.name)}
                  </span>
                  {qualityParam.enum?.length ? (
                    <select
                      className="playground-select"
                      value={parameters[qualityParam.name] ?? ''}
                      onChange={(e) =>
                        setParameters((prev) => ({
                          ...prev,
                          [qualityParam.name]: e.target.value,
                        }))
                      }
                    >
                      {qualityParam.enum.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="playground-select"
                      value={parameters[qualityParam.name] ?? 'Standard'}
                      onChange={(e) =>
                        setParameters((prev) => ({
                          ...prev,
                          [qualityParam.name]: e.target.value,
                        }))
                      }
                    >
                      <option value="Low">Low</option>
                      <option value="Standard">Standard</option>
                      <option value="HD">HD</option>
                    </select>
                  )}
                </div>
              ) : null}

              {/* Any additional model parameters */}
              {otherParams.length > 0 && (
                <div className="playground-param-row">
                  {otherParams.map((param) => {
                    const isDuration = /duration|second/i.test(param.name);
                    const isCount =
                      /^(n|count|quantity|num_outputs|number_of_images|samples|batch_size|image_num)$/i.test(
                        param.name,
                      ) || formatLabel(param.name) === '数量';
                    const isRanged =
                      param.type === 'integer' &&
                      param.minimum !== undefined &&
                      param.maximum !== undefined &&
                      param.maximum > param.minimum;

                    if (isDuration || isCount || isRanged) {
                      if (param.enum?.length) {
                        const options = param.enum;
                        const currentVal =
                          parameters[param.name] ??
                          (param.default !== undefined
                            ? String(param.default)
                            : options[0]);
                        const currentIndex = Math.max(
                          0,
                          options.indexOf(currentVal),
                        );
                        const currentNum = Number(
                          options[currentIndex] ?? options[0],
                        );
                        return (
                          <div
                            key={param.name}
                            className="playground-slider-col"
                          >
                            <div className="playground-slider-header">
                              <span className="playground-param-label">
                                {formatLabel(param.name)}
                              </span>
                              <span className="playground-slider-value">
                                {Number.isNaN(currentNum)
                                  ? (options[currentIndex] ?? options[0])
                                  : formatQuantity(param.name, currentNum)}
                              </span>
                            </div>
                            <Slider.Root
                              className="slider"
                              min={0}
                              max={options.length - 1}
                              step={1}
                              value={[currentIndex]}
                              onValueChange={([idx]) =>
                                setParameters((prev) => ({
                                  ...prev,
                                  [param.name]: options[idx],
                                }))
                              }
                            >
                              <Slider.Track className="slider-track">
                                <Slider.Range className="slider-range" />
                              </Slider.Track>
                              <Slider.Thumb
                                className="slider-thumb"
                                aria-label={formatLabel(param.name)}
                              />
                            </Slider.Root>
                            <div className="slider-scale">
                              {options.length <= 6 ? (
                                options.map((opt, i) => (
                                  <small
                                    key={opt}
                                    style={
                                      i === currentIndex
                                        ? {
                                            fontWeight: 700,
                                            color: 'var(--accent)',
                                          }
                                        : undefined
                                    }
                                  >
                                    {Number.isNaN(Number(opt))
                                      ? opt
                                      : formatQuantity(param.name, Number(opt))}
                                  </small>
                                ))
                              ) : (
                                <>
                                  <small>
                                    {Number.isNaN(Number(options[0]))
                                      ? options[0]
                                      : formatQuantity(
                                          param.name,
                                          Number(options[0]),
                                        )}
                                  </small>
                                  <small>
                                    {Number.isNaN(
                                      Number(options[options.length - 1]),
                                    )
                                      ? options[options.length - 1]
                                      : formatQuantity(
                                          param.name,
                                          Number(options[options.length - 1]),
                                        )}
                                  </small>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const min =
                        param.minimum !== undefined
                          ? Number(param.minimum)
                          : isCount
                            ? 1
                            : isDuration
                              ? 5
                              : 1;
                      const max =
                        param.maximum !== undefined
                          ? Number(param.maximum)
                          : isCount
                            ? 4
                            : isDuration
                              ? 10
                              : 100;
                      const rawVal =
                        parameters[param.name] ??
                        (param.default !== undefined
                          ? String(param.default)
                          : String(min));
                      const current = Number(rawVal) || min;

                      return (
                        <div key={param.name} className="playground-slider-col">
                          <div className="playground-slider-header">
                            <span className="playground-param-label">
                              {formatLabel(param.name)}
                            </span>
                            <span className="playground-slider-value">
                              {formatQuantity(param.name, current)}
                            </span>
                          </div>
                          <Slider.Root
                            className="slider"
                            min={min}
                            max={max}
                            step={1}
                            value={[current]}
                            onValueChange={([next]) =>
                              setParameters((prev) => ({
                                ...prev,
                                [param.name]: String(next),
                              }))
                            }
                          >
                            <Slider.Track className="slider-track">
                              <Slider.Range className="slider-range" />
                            </Slider.Track>
                            <Slider.Thumb
                              className="slider-thumb"
                              aria-label={formatLabel(param.name)}
                            />
                          </Slider.Root>
                          <div className="slider-scale">
                            {max - min <= 5 ? (
                              Array.from(
                                { length: max - min + 1 },
                                (_, i) => min + i,
                              ).map((num) => (
                                <small
                                  key={num}
                                  style={
                                    num === current
                                      ? {
                                          fontWeight: 700,
                                          color: 'var(--accent)',
                                        }
                                      : undefined
                                  }
                                >
                                  {formatQuantity(param.name, num)}
                                </small>
                              ))
                            ) : (
                              <>
                                <small>{formatQuantity(param.name, min)}</small>
                                <small>{formatQuantity(param.name, max)}</small>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (param.type === 'boolean') {
                      return (
                        <div key={param.name} className="playground-param-col">
                          <span className="playground-param-label">
                            {formatLabel(param.name)}
                          </span>
                          <select
                            className="playground-select"
                            value={
                              parameters[param.name] ??
                              (param.default !== undefined
                                ? String(param.default)
                                : '')
                            }
                            onChange={(e) =>
                              setParameters((prev) => ({
                                ...prev,
                                [param.name]: e.target.value,
                              }))
                            }
                          >
                            {!param.required && (
                              <option value="">{t('composer.auto')}</option>
                            )}
                            <option value="true">{t('playground.on')}</option>
                            <option value="false">{t('playground.off')}</option>
                          </select>
                        </div>
                      );
                    }

                    return (
                      <div key={param.name} className="playground-param-col">
                        <span className="playground-param-label">
                          {formatLabel(param.name)}
                        </span>
                        {param.enum?.length ? (
                          <select
                            className="playground-select"
                            value={parameters[param.name] ?? ''}
                            onChange={(e) =>
                              setParameters((prev) => ({
                                ...prev,
                                [param.name]: e.target.value,
                              }))
                            }
                          >
                            {!param.required && (
                              <option value="">{t('composer.auto')}</option>
                            )}
                            {param.enum.map((opt) => (
                              <option key={opt} value={opt}>
                                {formatDimensionOption(opt, locale)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={param.type === 'integer' ? 'number' : 'text'}
                            className="playground-input"
                            value={parameters[param.name] ?? ''}
                            onChange={(e) =>
                              setParameters((prev) => ({
                                ...prev,
                                [param.name]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Price Table / 价格说明 */}
              {selectedModel && (
                <PriceTable
                  billing={selectedModel.billing}
                  parameters={parameters}
                  admin={admin}
                />
              )}

              {/* Plaza sharing, decided before the job is created. */}
              {!admin && (
                <ShareOptions
                  value={sharing}
                  onChange={(next) => {
                    setSharing(next);
                    writeSharePreference(next);
                  }}
                />
              )}

              {/* Actions row: Reset and Generate */}
              <div className="playground-actions-bar">
                <button
                  type="button"
                  className="playground-reset-btn"
                  onClick={handleReset}
                >
                  <RotateCcw size={14} />
                  <span>{t('playground.reset')}</span>
                </button>

                <button
                  type="submit"
                  className="playground-generate-btn"
                  disabled={
                    creating ||
                    isUploading ||
                    !prompt.trim() ||
                    !modelId ||
                    !imageAllowed
                  }
                >
                  {creating ? (
                    <>
                      <Loader2 size={16} className="loader small" />
                      <span>{t('playground.generating')}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>
                        {price
                          ? t('playground.generatePriced', { price })
                          : t('playground.generate')}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Left Panel: JSON mode */
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <button
                type="button"
                className="playground-copy-json-btn"
                onClick={() => {
                  void navigator.clipboard.writeText(jsonRequestBody);
                  setCopiedJson(true);
                  setTimeout(() => setCopiedJson(false), 2000);
                }}
              >
                {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                <span>
                  {copiedJson
                    ? t('playground.copied')
                    : t('playground.copyJson')}
                </span>
              </button>
              <pre className="playground-json-view">{jsonRequestBody}</pre>
            </div>
          )}
        </div>

        {/* Right Column: PREVIEW & OUTPUT */}
        <div className="playground-panel playground-output-panel">
          {/* Output Top Bar */}
          <div className="output-top-bar">
            <div className="output-meta-stats">
              {metaStats ? (
                <span>{metaStats}</span>
              ) : (
                <span>{t('playground.preview')}</span>
              )}
            </div>

            <div className="output-view-toggle">
              {activeGen && (
                <button
                  type="button"
                  className="output-details-btn"
                  onClick={() => setShowDetails(true)}
                  title={t('playground.viewDetails')}
                >
                  <Info size={13} />
                  <span>{t('playground.viewDetails')}</span>
                </button>
              )}
              <button
                type="button"
                className={`output-toggle-btn ${outputTab === 'preview' ? 'active' : ''}`}
                onClick={() => setOutputTab('preview')}
              >
                <ImageIcon size={13} />
                <span>{t('playground.preview')}</span>
              </button>
              <button
                type="button"
                className={`output-toggle-btn ${outputTab === 'json' ? 'active' : ''}`}
                onClick={() => setOutputTab('json')}
              >
                <Code2 size={13} />
                <span>{t('playground.json')}</span>
              </button>
            </div>
          </div>

          {outputTab === 'preview' ? (
            /* Canvas Area */
            <div className="checkerboard-canvas">
              {detailsLoading ||
              (activeGen &&
                ['queued', 'submitting', 'submitted', 'in_progress'].includes(
                  activeGen.status,
                )) ? (
                <div className="canvas-loading-card">
                  <Loader2
                    size={28}
                    style={{
                      animation: 'spin .8s linear infinite',
                      color: '#7c3aed',
                    }}
                  />
                  <b>{t('playground.generating')}</b>
                  <span>
                    {activeGen?.model} ·{' '}
                    {activeGen?.status ? formatLabel(activeGen.status) : ''}
                  </span>
                </div>
              ) : activeImageUrl ? (
                <div className="canvas-media-wrap">
                  <img src={activeImageUrl} alt="Generated visual result" />
                  <div className="canvas-toolbar">
                    <button
                      type="button"
                      className="canvas-toolbar-btn"
                      title={t('playground.viewDetails')}
                      onClick={() => setShowDetails(true)}
                    >
                      <Info size={15} />
                    </button>
                    <a
                      href={activeImageUrl}
                      download={`generation-${activeGen?.id || 'image'}.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="canvas-toolbar-btn"
                      title={t('playground.download')}
                    >
                      <Download size={15} />
                    </a>
                    <a
                      href={activeImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="canvas-toolbar-btn"
                      title={t('playground.openOriginal')}
                    >
                      <ExternalLink size={15} />
                    </a>
                    <button
                      type="button"
                      className="canvas-toolbar-btn"
                      title={t('playground.copyUrl')}
                      onClick={() => {
                        void navigator.clipboard.writeText(activeImageUrl);
                        setCopiedUrl(true);
                        setTimeout(() => setCopiedUrl(false), 2000);
                      }}
                    >
                      {copiedUrl ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>
              ) : activeGen?.status === 'failed' ? (
                <div
                  className="canvas-loading-card"
                  style={{ borderColor: '#fca5a5' }}
                >
                  <AlertCircle size={28} style={{ color: '#dc2626' }} />
                  <b style={{ color: '#b91c1c' }}>Generation Failed</b>
                  <span>{activeGen.prompt}</span>
                  <button
                    type="button"
                    className="output-details-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => setShowDetails(true)}
                  >
                    <Info size={13} />
                    <span>{t('playground.viewDetails')}</span>
                  </button>
                </div>
              ) : (
                <div className="canvas-empty-state">
                  <Wand2 size={36} strokeWidth={1.5} />
                  <b>{t('playground.noOutputYet')}</b>
                  <p>{t('playground.imageDescription')}</p>
                </div>
              )}
            </div>
          ) : (
            /* Output JSON view */
            <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
              <button
                type="button"
                className="playground-copy-json-btn"
                onClick={() => {
                  if (jsonResponseData) {
                    void navigator.clipboard.writeText(jsonResponseData);
                    setCopiedJson(true);
                    setTimeout(() => setCopiedJson(false), 2000);
                  }
                }}
              >
                {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                <span>
                  {copiedJson
                    ? t('playground.copied')
                    : t('playground.copyJson')}
                </span>
              </button>
              <pre className="playground-json-view">
                {jsonResponseData || t('playground.noOutputYet')}
              </pre>
            </div>
          )}

          {/* Recent Generations Strip */}
          {imageGenerations.length > 0 && (
            <div className="recent-strip">
              <div className="recent-strip-heading">
                <span>{t('playground.recentGenerations')}</span>
                <span>{imageGenerations.length}</span>
              </div>
              <div className="recent-strip-scroll">
                {imageGenerations.slice(0, 14).map((gen) => {
                  const thumbUrl = thumbnails[gen.id];
                  const hasValidThumb = Boolean(
                    thumbUrl && !failedThumbs[gen.id],
                  );
                  const isInProgress = [
                    'queued',
                    'submitting',
                    'submitted',
                    'in_progress',
                  ].includes(gen.status);

                  return (
                    <button
                      key={gen.id}
                      type="button"
                      className={`recent-strip-item ${activeGenId === gen.id ? 'active' : ''}`}
                      onClick={() => setActiveGenId(gen.id)}
                      title={`${gen.model} - ${gen.prompt || gen.id}`}
                    >
                      {hasValidThumb && thumbUrl ? (
                        <img
                          src={absoluteGatewayURL(thumbUrl)}
                          alt={gen.prompt || gen.id}
                          loading="lazy"
                          onError={() =>
                            setFailedThumbs((prev) => ({
                              ...prev,
                              [gen.id]: true,
                            }))
                          }
                        />
                      ) : isInProgress ? (
                        <div className="status-icon">
                          <Loader2 size={14} className="loader small" />
                        </div>
                      ) : (
                        <div className="status-icon">
                          <ImageIcon size={16} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <GenerationDetails
        generation={showDetails ? activeGen : null}
        artifacts={activeArtifacts}
        loading={detailsLoading}
        onClose={() => setShowDetails(false)}
        sharing={!admin}
        moderation={admin}
        onGenerationChange={(updated) =>
          setActiveGen((current) =>
            current && current.id === updated.id
              ? { ...current, ...updated }
              : current,
          )
        }
      />
    </div>
  );
}
