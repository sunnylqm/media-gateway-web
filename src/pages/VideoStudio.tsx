import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { absoluteGatewayURL, api } from '../api';
import { PriceTable } from '../components/PriceTable';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { formatAmount, formatLabel } from '../format';
import { useI18n } from '../i18n';
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
  seconds?: number;
  message?: string;
};

type VideoThumb = {
  url: string;
  isVideo: boolean;
};

export function VideoStudio({
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
  const { t } = useI18n();

  const videoAllowed = admin || user?.video_enabled !== false;
  const videoModels = useMemo(
    () => models.filter((item) => item.modality === 'video'),
    [models],
  );

  const [modelId, setModelId] = useState<string>(
    () => videoModels[0]?.id ?? '',
  );
  useEffect(() => {
    if (!videoModels.length) return;
    if (!modelId || !videoModels.some((m) => m.id === modelId)) {
      setModelId(videoModels[0].id);
    }
  }, [videoModels, modelId]);

  const selectedModel = useMemo(
    () => videoModels.find((m) => m.id === modelId),
    [videoModels, modelId],
  );
  const form = selectedModel?.request_form;

  const modelPriceTag = useMemo(() => {
    if (admin) return t('composer.free');
    if (!selectedModel) return '';
    const billing = selectedModel.billing;
    if (billing.mode === 'free') return t('composer.free');
    const currency = billing.currency;
    const unit = t('composer.unitSecond');
    const rates = billing.rates ?? [];
    if (rates.length === 0) {
      const base = unitAmount(fallbackRate(billing));
      return `${formatAmount(base, currency)} / ${unit}`;
    }
    const allRates = [...rates, fallbackRate(billing)];
    const prices = allRates.map((r) =>
      unitAmount({ ...r, dimensions: r.dimensions ?? {} }),
    );
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) {
      return `${formatAmount(min, currency)} / ${unit}`;
    }
    return `${formatAmount(min, currency)} ~ ${formatAmount(max, currency)} / ${unit}`;
  }, [admin, selectedModel, t]);

  const [prompt, setPrompt] = useState('');
  const [parameters, setParameters] = useState<Record<string, string>>({});

  const estimate = selectedModel
    ? estimateAmount(selectedModel.billing, parameters)
    : null;
  const currency = selectedModel?.billing.currency ?? '';
  const price = admin
    ? t('composer.free')
    : estimate === null || !currency
      ? ''
      : estimate === 0
        ? t('composer.free')
        : formatAmount(estimate, currency);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [inputTab, setInputTab] = useState<'form' | 'json'>('form');
  const [outputTab, setOutputTab] = useState<'preview' | 'json'>('preview');

  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const slots = useMemo(() => mediaSlots(form), [form]);
  const frameSlots = useMemo(
    () => slots.filter((slot) => slot.group === 'frame'),
    [slots],
  );
  const referenceSlots = useMemo(
    () => slots.filter((slot) => slot.group === 'reference'),
    [slots],
  );

  // Restart parameters on model changes
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
  const videoGenerations = useMemo(
    () => generations.filter((g) => g.modality === 'video'),
    [generations],
  );

  const [activeGenId, setActiveGenId] = useState<string | null>(null);
  const [activeGen, setActiveGen] = useState<Generation | null>(null);
  const [activeArtifacts, setActiveArtifacts] = useState<Artifact[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [thumbnails, setThumbnails] = useState<
    Record<string, VideoThumb | null>
  >({});
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  // Default to newest video generation
  useEffect(() => {
    if (!activeGenId && videoGenerations.length > 0) {
      setActiveGenId(videoGenerations[0].id);
    }
  }, [activeGenId, videoGenerations]);

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
          const imgArtifact = artifactList.data.find((a) =>
            a.mime_type.startsWith('image/'),
          );
          const vidArtifact = artifactList.data.find((a) =>
            a.mime_type.startsWith('video/'),
          );
          const target = imgArtifact ?? vidArtifact ?? artifactList.data[0];
          if (target?.url) {
            const isVideo = target.mime_type.startsWith('video/');
            setThumbnails((prev) => {
              const current = prev[id];
              if (current && current.url === target.url) return prev;
              return { ...prev, [id]: { url: target.url, isVideo } };
            });
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
    return videoGenerations
      .slice(0, 14)
      .filter((g) => g.status === 'completed' && thumbnails[g.id] === undefined)
      .map((g) => g.id);
  }, [videoGenerations, thumbnails]);

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
          const imgArtifact = res.data.find((a) =>
            a.mime_type.startsWith('image/'),
          );
          const vidArtifact = res.data.find((a) =>
            a.mime_type.startsWith('video/'),
          );
          const target = imgArtifact ?? vidArtifact ?? res.data[0];
          if (!target?.url) return { id, thumb: null };
          return {
            id,
            thumb: {
              url: target.url,
              isVideo: target.mime_type.startsWith('video/'),
            },
          };
        } catch {
          return { id, thumb: null };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setThumbnails((prev) => {
        const next = { ...prev };
        for (const item of results) {
          next[item.id] = item.thumb;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pendingThumbIds, admin]);

  // Poll in-flight generation
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

  async function uploadFile(file: File, slot: MediaSlot) {
    const key = crypto.randomUUID();
    const item: Attachment = {
      key,
      slotID: slot.id,
      file,
      preview: URL.createObjectURL(file),
      status: 'uploading',
    };

    setAttachments((current) => {
      // If single slot, replace previous attachment for that slot
      if (!slot.multiple) {
        const filtered = current.filter((att) => att.slotID !== slot.id);
        return [...filtered, item];
      }
      return [...current, item];
    });

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
      const orderedMedia = slots.flatMap((slot) =>
        attachments
          .filter(
            (att) =>
              att.slotID === slot.id && att.status === 'ready' && att.url,
          )
          .map((att) => ({ slot, url: att.url as string })),
      );

      const body = buildRequestBody(
        form,
        modelId,
        prompt,
        parameters,
        orderedMedia,
      );

      const res = await api<Generation>(
        admin
          ? `/v1/admin/models/${encodeURIComponent(modelId)}/generations`
          : '/v1/generations',
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

  const jsonRequestBody = useMemo(() => {
    if (!form) return '{}';
    try {
      const orderedMedia = slots.flatMap((slot) =>
        attachments
          .filter(
            (att) =>
              att.slotID === slot.id && att.status === 'ready' && att.url,
          )
          .map((att) => ({ slot, url: att.url as string })),
      );
      const body = buildRequestBody(
        form,
        modelId,
        prompt || 'Sample prompt text...',
        parameters,
        orderedMedia,
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

  // Compute output stats string
  const metaStats = useMemo(() => {
    if (!activeGen) return '';
    const parts: string[] = [];

    const ar =
      (activeGen.parameters?.aspect_ratio as string) ||
      (activeGen.parameters?.ar as string) ||
      parameters.aspect_ratio ||
      parameters.ar ||
      '';
    if (ar) parts.push(ar);

    const dur =
      (activeGen.parameters?.duration as string) ||
      (activeGen.parameters?.seconds as string) ||
      parameters.duration ||
      '';
    if (dur) parts.push(`${dur}s`);

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

    if (admin) {
      parts.push(t('composer.free'));
    } else {
      const amt = activeGen.final_amount ?? activeGen.quote_amount;
      if (amt !== undefined && activeGen.currency) {
        parts.push(formatAmount(amt, activeGen.currency));
      }
    }

    return parts.join(' · ');
  }, [activeGen, admin, parameters, t]);

  const activeArtifact =
    activeArtifacts.find((a) => a.mime_type.startsWith('video/')) ??
    activeArtifacts[0];
  const activeVideoUrl = activeArtifact?.url
    ? absoluteGatewayURL(activeArtifact.url)
    : '';

  return (
    <div className="playground-page">
      {/* Top bar: Video icon, title, model selector */}
      <div className="playground-top-bar">
        <div className="playground-title-box">
          <span className="playground-icon-badge">
            <Film size={17} />
          </span>
          <span>{t('playground.videoTitle')}</span>
        </div>

        <div className="playground-model-select-wrap">
          <span className="playground-param-label">
            {t('playground.model')}:
          </span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={!videoAllowed || !videoModels.length}
          >
            {videoModels.map((item) => (
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
      </div>

      {!videoAllowed && (
        <div className="banner-error" role="alert">
          {t('playground.disabledModality', {
            modality: t('modality.video'),
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
            <span className="playground-tag">{t('playground.input')}</span>
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
                  htmlFor="video-prompt-input"
                >
                  {t('playground.prompt')}
                </label>
                <div
                  className="playground-prompt-area"
                  style={{ marginTop: '6px' }}
                >
                  <textarea
                    id="video-prompt-input"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    placeholder={t('playground.videoPromptPlaceholder')}
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

              {/* Frame Inputs (e.g. First frame, Last frame) */}
              {frameSlots.length > 0 && (
                <div>
                  <div className="playground-field-label">
                    <span>{t('playground.frames')}</span>
                  </div>
                  <div className="frame-grid" style={{ marginTop: '8px' }}>
                    {frameSlots.map((slot) => {
                      const att = attachments.find((a) => a.slotID === slot.id);
                      return (
                        <div key={slot.id}>
                          {att ? (
                            <div
                              className="ref-item-thumb"
                              style={{ width: '100%', height: '110px' }}
                            >
                              <img src={att.preview} alt={att.file.name} />
                              <button
                                type="button"
                                className="ref-remove-btn"
                                onClick={() => removeAttachment(att.key)}
                                title={t('common.cancel')}
                              >
                                <Trash2 size={11} />
                              </button>
                              {att.status === 'uploading' && (
                                <div className="ref-spinner">
                                  <Loader2 size={18} className="loader small" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <label
                              className="ref-add-btn"
                              style={{ width: '100%', height: '110px' }}
                            >
                              <ImageIcon size={20} />
                              <span>{slot.label}</span>
                              <input
                                type="file"
                                accept={`${slot.mimePrefix}*`}
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void uploadFile(f, slot);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reference Media (if model supports references) */}
              {referenceSlots.length > 0 && (
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

                  <div
                    className="playground-ref-list"
                    style={{ marginTop: '6px' }}
                  >
                    {attachments.filter((att) =>
                      referenceSlots.some((slot) => slot.id === att.slotID),
                    ).length < 3 && (
                      <label className="ref-add-btn">
                        <Plus size={18} />
                        <span>{t('playground.add')}</span>
                        <input
                          type="file"
                          accept="image/*,video/*"
                          multiple
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files) {
                              const defaultRefSlot = referenceSlots[0];
                              const currentRefs = attachments.filter((att) =>
                                referenceSlots.some(
                                  (slot) => slot.id === att.slotID,
                                ),
                              );
                              const remaining = Math.max(
                                0,
                                3 - currentRefs.length,
                              );
                              for (const f of Array.from(e.target.files).slice(
                                0,
                                remaining,
                              )) {
                                void uploadFile(f, defaultRefSlot);
                              }
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}

                    {attachments
                      .filter((att) =>
                        referenceSlots.some((slot) => slot.id === att.slotID),
                      )
                      .map((att) => (
                        <div key={att.key} className="ref-item-thumb">
                          {att.file.type.startsWith('video/') ? (
                            <video src={att.preview} muted />
                          ) : (
                            <img src={att.preview} alt={att.file.name} />
                          )}
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
              )}

              {/* Dynamic Parameters Grid */}
              {(form?.parameters ?? []).filter(
                (p) => !isHiddenParameter(p.name),
              ).length > 0 && (
                <div className="playground-param-row">
                  {(form?.parameters ?? [])
                    .filter((p) => !isHiddenParameter(p.name))
                    .map((param) => (
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
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={param.type === 'integer' ? 'number' : 'text'}
                            className="playground-select"
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
                    ))}
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

              {/* Bottom Action Bar */}
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
                    !videoAllowed
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
                        {admin
                          ? t('playground.adminGenerate')
                          : price
                            ? t('playground.generatePriced', { price })
                            : t('playground.generate')}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* JSON mode */
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
              <button
                type="button"
                className={`output-toggle-btn ${outputTab === 'preview' ? 'active' : ''}`}
                onClick={() => setOutputTab('preview')}
              >
                <Video size={13} />
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
              ) : activeVideoUrl ? (
                <div className="canvas-media-wrap">
                  <video
                    src={activeVideoUrl}
                    controls
                    playsInline
                    loop
                    preload="metadata"
                  />
                  <div className="canvas-toolbar">
                    <a
                      href={activeVideoUrl}
                      download={`generation-${activeGen?.id || 'video'}.mp4`}
                      target="_blank"
                      rel="noreferrer"
                      className="canvas-toolbar-btn"
                      title={t('playground.download')}
                    >
                      <Download size={15} />
                    </a>
                    <a
                      href={activeVideoUrl}
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
                        void navigator.clipboard.writeText(activeVideoUrl);
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
                </div>
              ) : (
                <div className="canvas-empty-state">
                  <Film size={36} strokeWidth={1.5} />
                  <b>{t('playground.noOutputYet')}</b>
                  <p>{t('playground.videoDescription')}</p>
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
          {videoGenerations.length > 0 && (
            <div className="recent-strip">
              <div className="recent-strip-heading">
                <span>{t('playground.recentGenerations')}</span>
                <span>{videoGenerations.length}</span>
              </div>
              <div className="recent-strip-scroll">
                {videoGenerations.slice(0, 14).map((gen) => {
                  const thumb = thumbnails[gen.id];
                  const hasValidThumb = Boolean(thumb && !failedThumbs[gen.id]);
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
                      {hasValidThumb && thumb ? (
                        thumb.isVideo ? (
                          <video
                            src={`${absoluteGatewayURL(thumb.url)}#t=0.001`}
                            muted
                            playsInline
                            preload="metadata"
                            onError={() =>
                              setFailedThumbs((prev) => ({
                                ...prev,
                                [gen.id]: true,
                              }))
                            }
                          />
                        ) : (
                          <img
                            src={absoluteGatewayURL(thumb.url)}
                            alt={gen.prompt || gen.id}
                            loading="lazy"
                            onError={() =>
                              setFailedThumbs((prev) => ({
                                ...prev,
                                [gen.id]: true,
                              }))
                            }
                          />
                        )
                      ) : isInProgress ? (
                        <div className="status-icon">
                          <Loader2 size={14} className="loader small" />
                        </div>
                      ) : (
                        <div className="status-icon">
                          <Video size={16} />
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
    </div>
  );
}
