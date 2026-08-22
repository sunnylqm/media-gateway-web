import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Dialog } from 'radix-ui';
import { Activity, Boxes, Check, Copy, Eye, EyeOff, KeyRound, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { APIError, api } from '../api';
import { GenerationComposer } from '../components/Composer';
import { GenerationDetails, GenerationsTable } from '../components/Generations';
import { Shell } from '../components/Shell';
import { formatDate, formatStatus } from '../format';
import { useI18n } from '../i18n';
import { modelPathSlug } from '../lib/requestForm';
import type { APIKey, APIKeySecret, Artifact, CreatedAPIKey, Generation, IdentityProfile, PublicModel } from '../types';

type GenerationList = { data: Generation[] };

export function TenantConsole() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Generation | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

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
      setModels((current) => JSON.stringify(current) === JSON.stringify(publicModels) ? current : publicModels);
    } catch (reason) {
      if (reason instanceof APIError && reason.status === 401) {
        navigate('/app/login', { replace: true });
        return;
      }
      setError(reason instanceof Error ? reason.message : t('tenant.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [navigate, t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!generations.some((item) => ['queued', 'submitting', 'submitted', 'in_progress'].includes(item.status))) return;
    const timer = window.setInterval(() => { void load(); }, 2_000);
    return () => window.clearInterval(timer);
  }, [generations, load]);

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
      setError(reason instanceof Error ? reason.message : t('tenant.errorDetails'));
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
  if (loading) return <LoadingScreen />;
  if (!profile) return null;

  return (
    <Shell
      identity={profile.user.email}
      navigation={[
        { label: t('tenant.navOverview'), to: '/app', icon: <Activity size={17} /> },
        { label: t('tenant.navGenerations'), to: '/app/generations', icon: <Boxes size={17} /> },
        { label: t('tenant.navAPIKeys'), to: '/app/api-keys', icon: <KeyRound size={17} /> },
      ]}
      title={t('tenant.title')}
      description={t('tenant.description', { email: profile.user.email })}
      actions={location.pathname === '/app/api-keys'
        ? undefined
        : <GenerationComposer models={models} onCreated={load} />}
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
  const { t } = useI18n();
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
      setError(reason instanceof Error ? reason.message : t('apiKeys.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setError(reason instanceof Error ? reason.message : t('apiKeys.errorCreate'));
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
      setError(reason instanceof Error ? reason.message : t('apiKeys.errorRevoke'));
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
      setError(t('apiKeys.errorClipboard'));
    }
  }

  async function revealKey(key: APIKey) {
    const cached = secrets[key.id];
    if (cached) return cached;
    if (!key.secret_available) {
      setError(t('apiKeys.errorLegacy'));
      return '';
    }
    try {
      const secret = await api<APIKeySecret>(`/v1/api-keys/${key.id}/reveal`, { method: 'POST' });
      setSecrets((current) => ({ ...current, [key.id]: secret.key }));
      return secret.key;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('apiKeys.errorReveal'));
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
      <div><span className="eyebrow">{t('apiKeys.baseEyebrow')}</span><h2>{t('apiKeys.endpointsTitle')}</h2><p>{t('apiKeys.endpointsNote')}</p></div>
      <div className="endpoint-values">{endpoints.map((endpoint) => <div className="endpoint-value" key={endpoint.url}><span>{endpoint.model}</span><div className="copy-value"><code>{endpoint.url}</code><button className="button secondary" onClick={() => void copyValue(endpoint.url, `endpoint-${endpoint.url}`)}>{copied === `endpoint-${endpoint.url}` ? <Check size={15} /> : <Copy size={15} />}{t(copied === `endpoint-${endpoint.url}` ? 'common.copied' : 'common.copy')}</button></div></div>)}</div>
    </section>
    <section className="panel table-wrap">
      <div className="panel-heading table-heading"><div><h2>{t('apiKeys.title')}</h2><p>{t('apiKeys.note')}</p></div><button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16} />{t('apiKeys.create')}</button></div>
      {loading ? <div className="empty-state"><span className="loader" />{t('apiKeys.loading')}</div> : keys.length ? <table><thead><tr><th>{t('apiKeys.columnName')}</th><th>{t('apiKeys.columnKey')}</th><th>{t('apiKeys.columnStatus')}</th><th>{t('apiKeys.columnLastUsed')}</th><th>{t('apiKeys.columnCreated')}</th><th /></tr></thead><tbody>{keys.map((key) => <tr key={key.id}><td><b>{key.name}</b></td><td className="key-secret-cell"><code>{secrets[key.id] ?? `${key.prefix}…`}</code></td><td><span className={`status status-${key.status}`}>{formatStatus(key.status)}</span></td><td>{key.last_used_at ? formatDate(key.last_used_at) : t('common.never')}</td><td>{formatDate(key.created_at)}</td><td><div className="key-actions"><button className="row-action" disabled={!key.secret_available} aria-label={t(secrets[key.id] ? 'apiKeys.hideKey' : 'apiKeys.viewKey', { name: key.name })} onClick={() => void toggleKey(key)}>{secrets[key.id] ? <EyeOff size={14} /> : <Eye size={14} />}</button><button className="row-action" disabled={!key.secret_available} aria-label={t('apiKeys.copyKeyAria', { name: key.name })} onClick={() => void copyKey(key)}>{copied === `key-${key.id}` ? <Check size={14} /> : <Copy size={14} />}</button>{key.status === 'active' ? <button className="row-action" aria-label={t('apiKeys.revokeKeyAria', { name: key.name })} onClick={() => setRevoking(key)}><Trash2 size={14} /></button> : null}</div></td></tr>)}</tbody></table> : <div className="empty-state"><KeyRound size={22} /><b>{t('apiKeys.emptyTitle')}</b><span>{t('apiKeys.emptyNote')}</span></div>}
    </section>
    <Dialog.Root open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setCreated(null); setCopied(''); } }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content small"><div className="dialog-heading"><div><Dialog.Title>{t(created ? 'apiKeys.createdTitle' : 'apiKeys.createTitle')}</Dialog.Title><Dialog.Description>{t(created ? 'apiKeys.createdNote' : 'apiKeys.createNote')}</Dialog.Description></div><Dialog.Close className="icon-button"><X size={18} /></Dialog.Close></div>{created ? <div className="created-key"><div className="secret-value"><code>{created.key}</code></div><button className="button primary wide" onClick={() => void copyValue(created.key, 'secret')}>{copied === 'secret' ? <Check size={16} /> : <Copy size={16} />}{t(copied === 'secret' ? 'common.copied' : 'apiKeys.copySecret')}</button><div className="warning-box"><span>{t('apiKeys.storedNote')}</span></div><Dialog.Close className="button secondary wide">{t('common.done')}</Dialog.Close></div> : <form className="dialog-form" onSubmit={createKey}><label className="field"><span className="field-label">{t('apiKeys.name')}</span><input required maxLength={80} autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t('apiKeys.namePlaceholder')} /></label><div className="dialog-actions"><Dialog.Close className="button secondary" type="button">{t('common.cancel')}</Dialog.Close><button className="button primary" disabled={busy}>{t(busy ? 'apiKeys.creating' : 'apiKeys.create')}</button></div></form>}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={Boolean(revoking)} onOpenChange={(open) => !open && setRevoking(null)}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content small"><div className="dialog-heading"><div><Dialog.Title>{t('apiKeys.revokeTitle')}</Dialog.Title><Dialog.Description>{t('apiKeys.revokeDescription', { name: revoking?.name ?? '' })}</Dialog.Description></div><Dialog.Close className="icon-button"><X size={18} /></Dialog.Close></div><div className="warning-box"><span>{t('apiKeys.revokeWarning')}</span></div><div className="dialog-actions"><Dialog.Close className="button secondary">{t('common.cancel')}</Dialog.Close><button className="button danger-button" disabled={busy} onClick={() => void revokeKey()}>{t(busy ? 'apiKeys.revoking' : 'apiKeys.revoke')}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}

function Overview({ stats, generations, onSelect }: { stats: Record<string, number>; generations: Generation[]; onSelect: (generation: Generation) => void }) {
  const { t } = useI18n();
  return <><section className="metric-grid">
    <Metric label={t('overview.total')} value={stats.total} note={t('overview.totalNote')} />
    <Metric label={t('overview.active')} value={stats.active} note={t('overview.activeNote')} tone="amber" />
    <Metric label={t('overview.completed')} value={stats.completed} note={t('overview.completedNote')} tone="green" />
    <Metric label={t('overview.failed')} value={stats.failed} note={t('overview.failedNote')} tone="red" />
  </section><section className="panel"><div className="panel-heading"><div><h2>{t('overview.recent')}</h2><p>{t('overview.recentNote')}</p></div><Sparkles size={19} /></div><GenerationsTable generations={generations} compact onSelect={onSelect} /></section></>;
}

function Metric({ label, value, note, tone = 'blue' }: { label: string; value: number; note: string; tone?: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function LoadingScreen() {
  const { t } = useI18n();
  return <div className="loading-screen"><span className="loader" /><b>{t('tenant.loading')}</b></div>;
}
