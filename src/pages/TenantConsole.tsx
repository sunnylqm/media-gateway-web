import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Dialog, Select } from 'radix-ui';
import { Activity, Boxes, Check, Copy, Eye, EyeOff, FileUp, KeyRound, ListFilter, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { APIError, api } from '../api';
import { GenerationDetails, GenerationsTable } from '../components/Generations';
import { Shell } from '../components/Shell';
import { formatDate } from '../format';
import type { APIKey, APIKeySecret, Artifact, CreatedAPIKey, FormParameter, Generation, IdentityProfile, PublicModel } from '../types';

type GenerationList = { data: Generation[] };

export function TenantConsole() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [modality, setModality] = useState<'image' | 'video'>('video');
  const [model, setModel] = useState('');
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [inputRole, setInputRole] = useState('');
  const [selected, setSelected] = useState<Generation | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [identity, jobs, catalog] = await Promise.all([
        api<IdentityProfile>('/v1/auth/me'),
        api<GenerationList>('/v1/generations?limit=50'),
        api<{ data: PublicModel[] }>('/v1/models'),
      ]);
      setProfile(identity);
      setGenerations(jobs.data);
      const publicModels = catalog.data.filter((item) => item.provider !== 'development');
      setModels(publicModels);
      setModel((current) => publicModels.some((item) => item.id === current)
        ? current
        : (publicModels.find((item) => item.modality === 'video') ?? publicModels[0])?.id ?? '');
    } catch (reason) {
      if (reason instanceof APIError && reason.status === 401) {
        navigate('/app/login', { replace: true });
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load workspace');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (models.some((item) => item.id === model && item.modality === modality)) return;
    setModel(models.find((item) => item.modality === modality)?.id ?? '');
  }, [modality, model, models]);

  // Each model publishes its own parameters, so the form resets to that
  // model's declared defaults rather than carrying values across models.
  useEffect(() => {
    const form = models.find((item) => item.id === model)?.request_form;
    setParameters(Object.fromEntries((form?.parameters ?? []).map((parameter) => [
      parameter.name, defaultParameterValue(parameter),
    ])));
    setInputFile(null);
  }, [model, models]);

  useEffect(() => {
    if (!generations.some((item) => ['queued', 'submitting', 'submitted', 'in_progress'].includes(item.status))) return;
    const timer = window.setInterval(() => { void load(); }, 2_000);
    return () => window.clearInterval(timer);
  }, [generations, load]);

  async function createGeneration(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const configuredModel = models.find((item) => item.id === model);
      if (!configuredModel) throw new Error('Select an active model');
      const form = configuredModel.request_form;
      if (!form) throw new Error('This model does not publish a request form');

      const body: Record<string, unknown> = {};
      setPointer(body, form.model, model);
      const reference = inputFile ? { file: inputFile, url: await fileDataURL(inputFile) } : null;

      if (form.prompt.content) {
        const content = form.prompt.content;
        const items: Array<Record<string, unknown>> = [
          { type: content.text_type, [content.text_field]: prompt },
        ];
        if (reference) {
          const media = mediaFor(content.media ?? [], reference.file.type);
          if (!media) throw new Error('This model does not accept that reference file type');
          items.push({
            type: media.type,
            [media.field]: { [media.url_field]: reference.url },
            ...(inputRole ? { role: inputRole } : {}),
          });
        }
        setPointer(body, content.pointer, items);
      } else {
        setPointer(body, form.prompt.pointer ?? '/prompt', prompt);
        if (reference) {
          const slot = (form.inputs ?? []).find((input) => reference.file.type.startsWith(input.mime_prefix));
          if (!slot) throw new Error('This model does not accept that reference file type');
          setPointer(body, slot.pointer, slot.array ? [reference.url] : reference.url);
        }
      }

      for (const parameter of form.parameters ?? []) {
        const raw = parameters[parameter.name] ?? '';
        if (raw === '') {
          if (parameter.required) throw new Error(`${formatParameterLabel(parameter.name)} is required`);
          continue;
        }
        setPointer(body, parameter.pointer, coerceParameter(parameter, raw));
      }

      await api(`/${modelPathSlug(model)}${form.path}`, {
        method: form.method || 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      setPrompt('');
      setInputFile(null);
      setDialogOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create generation');
    } finally {
      setCreating(false);
    }
  }

  async function openDetails(generation: Generation) {
    setSelected(generation);
    setArtifacts([]);
    setDetailsLoading(true);
    try {
      const [freshGeneration, artifactList] = await Promise.all([
        api<Generation>(`/v1/generations/${generation.id}`),
        api<{ data: Artifact[] }>(`/v1/generations/${generation.id}/artifacts`),
      ]);
      setSelected(freshGeneration);
      setGenerations((current) => current.map((item) => item.id === freshGeneration.id ? freshGeneration : item));
      setArtifacts(artifactList.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load generation details');
    } finally {
      setDetailsLoading(false);
    }
  }

  async function logout() {
    try { await api('/v1/auth/logout', { method: 'POST' }); } finally { navigate('/app/login', { replace: true }); }
  }

  const stats = useMemo(() => ({
    total: generations.length,
    active: generations.filter((item) => ['queued', 'submitting', 'submitted', 'in_progress'].includes(item.status)).length,
    completed: generations.filter((item) => item.status === 'completed').length,
    failed: generations.filter((item) => ['failed', 'submission_unknown'].includes(item.status)).length,
  }), [generations]);
  const availableModels = useMemo(() => models.filter((item) => item.modality === modality), [models, modality]);
  const selectedModel = useMemo(() => models.find((item) => item.id === model), [models, model]);
  // The reference picker only offers what the model's own request form accepts.
  const referenceAccept = useMemo(() => {
    const form = selectedModel?.request_form;
    const prefixes = form?.prompt.content
      ? (form.prompt.content.media ?? []).map((media) => media.mime_prefix)
      : (form?.inputs ?? []).map((input) => input.mime_prefix);
    return [...new Set(prefixes)].map((prefix) => `${prefix}*`).join(',');
  }, [selectedModel]);
  // The role vocabulary depends on the media type, so it only exists once a
  // file has been chosen.
  const referenceRoles = useMemo(() => {
    if (!inputFile) return [];
    const media = selectedModel?.request_form?.prompt.content?.media ?? [];
    const matched = media.find((entry) => inputFile.type.startsWith(entry.mime_prefix));
    if (!matched) return [];
    return matched.default_role
      ? [matched.default_role, ...(matched.roles ?? []).filter((role) => role !== matched.default_role)]
      : (matched.roles ?? []);
  }, [selectedModel, inputFile]);

  // A reference role only exists for the media type actually chosen, so the
  // selection follows the picked file rather than the previous model.
  useEffect(() => {
    if (referenceRoles.includes(inputRole)) return;
    setInputRole(referenceRoles[0] ?? '');
  }, [referenceRoles, inputRole]);

  if (loading) return <LoadingScreen />;
  if (!profile) return null;

  const actions = (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Trigger className="button primary"><Plus size={16} /> New generation</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-heading"><div><Dialog.Title>New generation</Dialog.Title><Dialog.Description>Send the selected provider's native request through the gateway.</Dialog.Description></div><Dialog.Close className="icon-button"><X size={18} /></Dialog.Close></div>
          <form onSubmit={createGeneration} className="dialog-form">
            <label className="field"><span className="field-label">Modality</span>
              <Select.Root value={modality} onValueChange={(value) => {
                const next = value as 'image' | 'video';
                setModality(next);
              }}>
                <Select.Trigger className="select-trigger"><Select.Value /><Select.Icon><ListFilter size={15} /></Select.Icon></Select.Trigger>
                <Select.Portal><Select.Content className="select-content" position="popper"><Select.Viewport>
                  <Select.Item className="select-item" value="image"><Select.ItemText>Image</Select.ItemText></Select.Item>
                  <Select.Item className="select-item" value="video"><Select.ItemText>Video</Select.ItemText></Select.Item>
                </Select.Viewport></Select.Content></Select.Portal>
              </Select.Root>
            </label>
            <label className="field"><span className="field-label">Model</span>
              <Select.Root value={model} onValueChange={setModel}>
                <Select.Trigger className="select-trigger"><Select.Value /><Select.Icon><ListFilter size={15} /></Select.Icon></Select.Trigger>
                <Select.Portal><Select.Content className="select-content" position="popper"><Select.Viewport>
                  {availableModels.map((item) => <Select.Item className="select-item" value={item.id} key={item.id}><Select.ItemText>{item.display_name}</Select.ItemText></Select.Item>)}
                </Select.Viewport></Select.Content></Select.Portal>
              </Select.Root>
            </label>
            <label className="field"><span className="field-label">Prompt</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the output you need…" required /></label>
            {(selectedModel?.request_form?.parameters ?? []).length > 0 && <div className="field-grid three">
              {(selectedModel?.request_form?.parameters ?? []).map((parameter) => <label className="field" key={parameter.name}>
                <span className="field-label">{formatParameterLabel(parameter.name)}</span>
                {parameter.enum?.length
                  ? <select value={parameters[parameter.name] ?? ''} onChange={(event) => setParameters((current) => ({ ...current, [parameter.name]: event.target.value }))}>
                      {!parameter.required && <option value="">Provider default</option>}
                      {parameter.enum.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  : parameter.type === 'boolean'
                    ? <select value={parameters[parameter.name] ?? ''} onChange={(event) => setParameters((current) => ({ ...current, [parameter.name]: event.target.value }))}>
                        {!parameter.required && <option value="">Provider default</option>}
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    : <input
                        type={parameter.type === 'integer' ? 'number' : 'text'}
                        min={parameter.minimum} max={parameter.maximum}
                        required={parameter.required}
                        value={parameters[parameter.name] ?? ''}
                        onChange={(event) => setParameters((current) => ({ ...current, [parameter.name]: event.target.value }))}
                      />}
              </label>)}
            </div>}
            {referenceAccept && <div className="upload-row">
              <label className="file-picker"><FileUp size={17} /><span>{inputFile ? inputFile.name : 'Optional reference file'}</span><input type="file" accept={referenceAccept} onChange={(event) => setInputFile(event.target.files?.[0] ?? null)} /></label>
              {inputFile && referenceRoles.length > 1 && <select value={inputRole} onChange={(event) => setInputRole(event.target.value)}>
                {referenceRoles.map((role) => <option key={role} value={role}>{formatParameterLabel(role)}</option>)}
              </select>}
            </div>}
            {!availableModels.length && <div className="warning-box"><span>No active {modality} model is configured.</span></div>}
            <div className="dialog-actions"><Dialog.Close className="button secondary" type="button">Cancel</Dialog.Close><button className="button primary" disabled={creating || !model}>{creating ? 'Submitting…' : 'Create generation'}</button></div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );

  return (
    <Shell
      identity={profile.user.email}
      navigation={[
        { label: 'Overview', to: '/app', icon: <Activity size={17} /> },
        { label: 'Generations', to: '/app/generations', icon: <Boxes size={17} /> },
        { label: 'API keys', to: '/app/api-keys', icon: <KeyRound size={17} /> },
      ]}
      title="Your workspace"
      description={`Signed in as ${profile.user.email}`}
      actions={location.pathname === '/app/api-keys' ? undefined : actions}
      onLogout={() => void logout()}
    >
      {error && <div className="banner-error" role="alert">{error}</div>}
      <Routes>
        <Route index element={<Overview stats={stats} generations={generations.slice(0, 6)} onSelect={openDetails} />} />
        <Route path="generations" element={<GenerationsTable generations={generations} onSelect={openDetails} />} />
		<Route path="api-keys" element={<APIKeysView models={models} />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      <GenerationDetails generation={selected} artifacts={artifacts} loading={detailsLoading} onClose={() => setSelected(null)} />
    </Shell>
  );
}

function APIKeysView({ models }: { models: PublicModel[] }) {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedAPIKey | null>(null);
  const [revoking, setRevoking] = useState<APIKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const endpoints = models.map((item) => ({
    model: item.display_name,
    url: `${window.location.origin}/${modelPathSlug(item.id)}`,
  }));

  const loadKeys = useCallback(async () => {
    try {
      const response = await api<{ data: APIKey[] }>('/v1/api-keys');
      setKeys(response.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadKeys(); }, [loadKeys]);

  async function createKey(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const key = await api<CreatedAPIKey>('/v1/api-keys', {
        method: 'POST', body: JSON.stringify({ name }),
      });
      setCreated(key);
      setName('');
      await loadKeys();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create API key');
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey() {
    if (!revoking) return;
    setBusy(true);
    setError('');
    try {
      await api(`/v1/api-keys/${revoking.id}`, { method: 'DELETE' });
      setRevoking(null);
      await loadKeys();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to revoke API key');
    } finally {
      setBusy(false);
    }
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => current === label ? '' : current), 1_500);
    } catch {
      setError('Clipboard access was denied');
    }
  }

  async function revealKey(key: APIKey) {
    const cached = secrets[key.id];
    if (cached) return cached;
    if (!key.secret_available) {
      setError('This legacy API key must be replaced before it can be viewed');
      return '';
    }
    try {
      const secret = await api<APIKeySecret>(`/v1/api-keys/${key.id}/reveal`, { method: 'POST' });
      setSecrets((current) => ({ ...current, [key.id]: secret.key }));
      return secret.key;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to reveal API key');
      return '';
    }
  }

  async function toggleKey(key: APIKey) {
    if (secrets[key.id]) {
      setSecrets((current) => { const next = { ...current }; delete next[key.id]; return next; });
      return;
    }
    await revealKey(key);
  }

  async function copyKey(key: APIKey) {
    const secret = await revealKey(key);
    if (secret) await copyValue(secret, `key-${key.id}`);
  }

  return <div className="api-key-page">
    {error && <div className="banner-error" role="alert">{error}</div>}
    <section className="panel endpoint-panel">
      <div><span className="eyebrow">API base URL</span><h2>Model endpoints</h2><p>Append the provider's official paths and authenticate with a Bearer API key.</p></div>
      <div className="endpoint-values">{endpoints.map((endpoint) => <div className="endpoint-value" key={endpoint.url}><span>{endpoint.model}</span><div className="copy-value"><code>{endpoint.url}</code><button className="button secondary" onClick={() => void copyValue(endpoint.url, `endpoint-${endpoint.url}`)}>{copied === `endpoint-${endpoint.url}` ? <Check size={15} /> : <Copy size={15} />}{copied === `endpoint-${endpoint.url}` ? 'Copied' : 'Copy'}</button></div></div>)}</div>
    </section>
    <section className="panel table-wrap">
      <div className="panel-heading table-heading"><div><h2>API keys</h2><p>Create, reveal, copy, and revoke credentials for your applications.</p></div><button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16} />Create key</button></div>
      {loading ? <div className="empty-state"><span className="loader" />Loading API keys…</div> : keys.length ? <table><thead><tr><th>Name</th><th>API key</th><th>Status</th><th>Last used</th><th>Created</th><th /></tr></thead><tbody>{keys.map((key) => <tr key={key.id}><td><b>{key.name}</b></td><td className="key-secret-cell"><code>{secrets[key.id] ?? `${key.prefix}…`}</code></td><td><span className={`status status-${key.status}`}>{key.status}</span></td><td>{key.last_used_at ? formatDate(key.last_used_at) : 'Never'}</td><td>{formatDate(key.created_at)}</td><td><div className="key-actions"><button className="row-action" disabled={!key.secret_available} aria-label={`${secrets[key.id] ? 'Hide' : 'View'} ${key.name}`} onClick={() => void toggleKey(key)}>{secrets[key.id] ? <EyeOff size={14} /> : <Eye size={14} />}</button><button className="row-action" disabled={!key.secret_available} aria-label={`Copy ${key.name}`} onClick={() => void copyKey(key)}>{copied === `key-${key.id}` ? <Check size={14} /> : <Copy size={14} />}</button>{key.status === 'active' ? <button className="row-action" aria-label={`Revoke ${key.name}`} onClick={() => setRevoking(key)}><Trash2 size={14} /></button> : null}</div></td></tr>)}</tbody></table> : <div className="empty-state"><KeyRound size={22} /><b>No API keys yet</b><span>Create a key for your first application.</span></div>}
    </section>
    <Dialog.Root open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setCreated(null); setCopied(''); } }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content small"><div className="dialog-heading"><div><Dialog.Title>{created ? 'API key created' : 'Create API key'}</Dialog.Title><Dialog.Description>{created ? 'Copy it now, or reveal and copy it again later from this page.' : 'Give the key a recognizable name for this application.'}</Dialog.Description></div><Dialog.Close className="icon-button"><X size={18} /></Dialog.Close></div>{created ? <div className="created-key"><div className="secret-value"><code>{created.key}</code></div><button className="button primary wide" onClick={() => void copyValue(created.key, 'secret')}>{copied === 'secret' ? <Check size={16} /> : <Copy size={16} />}{copied === 'secret' ? 'Copied' : 'Copy API key'}</button><div className="warning-box"><span>The server keeps an encrypted copy so signed-in users can reveal it again.</span></div><Dialog.Close className="button secondary wide">Done</Dialog.Close></div> : <form className="dialog-form" onSubmit={createKey}><label className="field"><span className="field-label">Key name</span><input required maxLength={80} autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Production app" /></label><div className="dialog-actions"><Dialog.Close className="button secondary" type="button">Cancel</Dialog.Close><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create key'}</button></div></form>}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={Boolean(revoking)} onOpenChange={(open) => !open && setRevoking(null)}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content small"><div className="dialog-heading"><div><Dialog.Title>Revoke API key?</Dialog.Title><Dialog.Description>{revoking?.name} will stop working immediately.</Dialog.Description></div><Dialog.Close className="icon-button"><X size={18} /></Dialog.Close></div><div className="warning-box"><span>Applications using this key will receive authentication errors.</span></div><div className="dialog-actions"><Dialog.Close className="button secondary">Cancel</Dialog.Close><button className="button danger-button" disabled={busy} onClick={() => void revokeKey()}>{busy ? 'Revoking…' : 'Revoke key'}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}

function Overview({ stats, generations, onSelect }: { stats: Record<string, number>; generations: Generation[]; onSelect: (generation: Generation) => void }) {
  return <><section className="metric-grid">
    <Metric label="All generations" value={stats.total} note="Recent retained jobs" />
    <Metric label="In flight" value={stats.active} note="Queued or processing" tone="amber" />
    <Metric label="Completed" value={stats.completed} note="Ready artifacts" tone="green" />
    <Metric label="Needs attention" value={stats.failed} note="Failed or ambiguous" tone="red" />
  </section><section className="panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>The latest jobs across image and video.</p></div><Sparkles size={19} /></div><GenerationsTable generations={generations} compact onSelect={onSelect} /></section></>;
}

function Metric({ label, value, note, tone = 'blue' }: { label: string; value: number; note: string; tone?: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function LoadingScreen() { return <div className="loading-screen"><span className="loader" /><b>Preparing your workspace</b></div>; }
function modelPathSlug(value: string) { return value.trim().toLowerCase(); }

// setPointer writes value at an RFC 6901 pointer, creating the objects and
// arrays the path implies. It mirrors the gateway's own pointer writer.
function setPointer(target: Record<string, unknown>, pointer: string, value: unknown) {
  const tokens = pointer.replace(/^\//, '').split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = target as Record<string, unknown>;
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

function coerceParameter(parameter: FormParameter, raw: string): unknown {
  if (parameter.type === 'integer') {
    const value = Number(raw);
    if (!Number.isInteger(value)) throw new Error(`${formatParameterLabel(parameter.name)} must be a whole number`);
    return value;
  }
  if (parameter.type === 'boolean') return raw === 'true';
  return raw;
}

function defaultParameterValue(parameter: FormParameter): string {
  if (parameter.default !== undefined && parameter.default !== null) return String(parameter.default);
  if (!parameter.required) return '';
  if (parameter.enum?.length) return parameter.enum[0];
  if (parameter.minimum !== undefined) return String(parameter.minimum);
  return '';
}

function mediaFor(media: { type: string; field: string; url_field: string; mime_prefix: string }[], mimeType: string) {
  return media.find((entry) => mimeType.startsWith(entry.mime_prefix));
}

function formatParameterLabel(name: string) {
  return name.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
}
function fileDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read reference file'));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read reference file'));
    reader.readAsDataURL(file);
  });
}
