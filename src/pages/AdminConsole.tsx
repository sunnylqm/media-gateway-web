import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { Activity, ArrowLeft, Building2, ChevronDown, CircleDollarSign, CirclePause, CirclePlay, Cpu, Gauge, KeyRound, Plus, Server, ShieldAlert, Trash2, UserRound, Users, X } from 'lucide-react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router';
import { APIError, api } from '../api';
import { GenerationDetails, GenerationsTable } from '../components/Generations';
import { Shell } from '../components/Shell';
import { formatDate, formatDay } from '../format';
import type { AdminModel, AdminOverview, AdminProfile, AdminUser, Artifact, Generation, ModelBilling, ProtocolPreset, Tenant } from '../types';

export function AdminConsole() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [presets, setPresets] = useState<ProtocolPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [administrator, summary, userList, modelList, presetList] = await Promise.all([
        api<AdminProfile>('/v1/admin/auth/me', {}, true),
        api<AdminOverview>('/v1/admin/overview', {}, true),
        api<{ data: AdminUser[] }>('/v1/admin/users', {}, true),
        api<{ data: AdminModel[] }>('/v1/admin/models', {}, true),
        api<{ data: ProtocolPreset[] }>('/v1/admin/protocol-profiles', {}, true),
      ]);
      setProfile(administrator);
      setOverview(summary);
      setUsers(userList.data);
      setModels(modelList.data);
      setPresets(presetList.data);
    } catch (reason) {
      if (reason instanceof APIError && reason.status === 401) {
        navigate('/admin/login', { replace: true });
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load administration');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  // Suspension acts on the workspace, which is what carries session and API access.
  async function setStatus(user: AdminUser, status: Tenant['status']) {
    setError('');
    try {
      await api(`/v1/admin/tenants/${encodeURIComponent(user.tenant.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }, true);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update workspace');
    }
  }

  async function logout() {
    try { await api('/v1/admin/auth/logout', { method: 'POST' }, true); } finally { navigate('/admin/login', { replace: true }); }
  }

  if (loading) return <div className="loading-screen"><span className="loader" /><b>Loading system control</b></div>;
  if (!profile || !overview) return null;

  return (
    <Shell
      admin
      identity="System admin"
      navigation={[
        { label: 'Overview', to: '/admin', icon: <Gauge size={17} /> },
        { label: 'Accounts', to: '/admin/users', icon: <Users size={17} />, nested: true },
        { label: 'Models', to: '/admin/models', icon: <Cpu size={17} /> },
      ]}
      title="System control"
      description={`Single administrator · ${profile.email}`}
      onLogout={() => void logout()}
    >
      {error && <div className="banner-error" role="alert">{error}</div>}
      <Routes>
        <Route index element={<AdminOverviewView overview={overview} users={users} models={models} />} />
        <Route path="users" element={<UsersTable users={users} onStatus={setStatus} />} />
        <Route path="users/:userId" element={<UserDetail />} />
        <Route path="tenants" element={<Navigate to="/admin/users" replace />} />
        <Route path="models" element={<ModelsPanel models={models} presets={presets} onSaved={load} onError={setError} />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Shell>
  );
}

function AdminOverviewView({ overview, users, models }: { overview: AdminOverview; users: AdminUser[]; models: AdminModel[] }) {
  const utilization = useMemo(() => overview.tenant_count ? Math.round((overview.active_tenant_count / overview.tenant_count) * 100) : 0, [overview]);
  return <><section className="metric-grid admin-metrics">
    <article className="metric blue"><span>Total tenants</span><strong>{overview.tenant_count}</strong><small>{overview.active_tenant_count} active</small></article>
    <article className="metric green"><span>Registered users</span><strong>{overview.user_count}</strong><small>Across all tenants</small></article>
    <article className="metric amber"><span>Generations</span><strong>{overview.generation_count}</strong><small>{overview.queued_count} currently in flight</small></article>
    <article className="metric red"><span>Needs attention</span><strong>{overview.failed_count}</strong><small>Failed or ambiguous</small></article>
  </section><div className="admin-grid"><section className="panel health-panel"><div className="panel-heading"><div><h2>Platform posture</h2><p>A compact view of operating health.</p></div><Activity size={19} /></div><div className="health-score"><strong>{utilization}%</strong><span>tenants active</span></div><div className="health-track"><i style={{ width: `${utilization}%` }} /></div><div className="health-list"><span><i className="dot green-dot" />SQLite system of record</span><span><i className="dot green-dot" />{models.filter((model) => model.status === 'active').length} active models</span><span><i className={`dot ${models.some((model) => model.billing.mode !== 'free') ? 'green-dot' : 'amber-dot'}`} />{models.some((model) => model.billing.mode !== 'free') ? 'Billable model configured' : 'All models are free'}</span></div></section><section className="panel"><div className="panel-heading"><div><h2>Newest accounts</h2><p>Most recently registered accounts and their workspace.</p></div><Users size={19} /></div><div className="tenant-stack">{users.slice(0, 4).map((user) => <div className="tenant-stack-item" key={user.id}><span className="tenant-monogram">{user.email.slice(0, 2).toUpperCase()}</span><div><b>{user.email}</b><small>{user.tenant.name || 'No workspace'} · {user.generation_count} jobs</small></div><span className={`status status-${user.tenant.status || user.status}`}>{user.tenant.status || 'none'}</span></div>)}</div></section></div></>;
}

type ModelForm = {
  id: string;
  displayName: string;
  provider: string;
  upstreamModel: string;
  profile: string;
  bindings: BindingForm[];
  status: 'active' | 'inactive';
  billingMode: ModelBilling['mode'];
  currency: string;
  unitPrice: string;
  unitScale: string;
  minimumCharge: string;
  rates: RateForm[];
};

type BindingForm = {
  alias: string;
  endpoint: string;
  apiKey: string;
  status: 'active' | 'inactive';
  weight: string;
  configured: boolean;
};

type RateForm = {
  label: string;
  dimensions: string;
  unitPrice: string;
  unitScale: string;
  minimumCharge: string;
};

const officialH3Rates: RateForm[] = [
  { label: '2K output', dimensions: 'resolution=2K', unitPrice: '80', unitScale: '1', minimumCharge: '0' },
  { label: '768P output', dimensions: 'resolution=768P', unitPrice: '50', unitScale: '1', minimumCharge: '0' },
];

function newBinding(alias: string, endpoint: string): BindingForm {
  return { alias, endpoint, apiKey: '', status: 'active', weight: '1', configured: false };
}

const emptyModelForm: ModelForm = {
  id: '', displayName: '', provider: 'minimax', upstreamModel: 'MiniMax-H3', profile: '',
  bindings: [newBinding('default', 'https://api.minimax.io')],
  status: 'inactive', billingMode: 'per_output_second', currency: 'CNY', unitPrice: '80', unitScale: '1', minimumCharge: '0',
  rates: officialH3Rates.map((rate) => ({ ...rate })),
};

function presetForm(preset: ProtocolPreset): ModelForm {
  return {
    ...emptyModelForm,
    id: preset.model_id, displayName: preset.display_name, provider: preset.name,
    upstreamModel: preset.upstream_model,
    bindings: [newBinding('default', preset.endpoint)],
    profile: JSON.stringify(preset.profile, null, 2),
    rates: preset.name === 'minimax' ? officialH3Rates.map((rate) => ({ ...rate })) : [],
    unitPrice: preset.name === 'minimax' ? '80' : '0',
  };
}

function ModelsPanel({ models, presets, onSaved, onError }: { models: AdminModel[]; presets: ProtocolPreset[]; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminModel | null>(null);
  const [form, setForm] = useState<ModelForm>(emptyModelForm);
  const [saving, setSaving] = useState(false);

  function edit(model?: AdminModel, preset?: ProtocolPreset) {
    setEditing(model ?? null);
    setForm(model ? {
      id: model.id, displayName: model.display_name, provider: model.provider,
      upstreamModel: model.upstream_model,
      profile: model.protocol_profile ? JSON.stringify(model.protocol_profile, null, 2) : '',
      bindings: (model.bindings ?? []).map((binding) => ({
        alias: binding.alias, endpoint: binding.endpoint, apiKey: '',
        status: binding.status, weight: String(binding.weight || 1),
        configured: binding.api_key_configured,
      })),
      status: model.status,
      billingMode: model.billing.mode, currency: model.billing.currency,
      unitPrice: String(model.billing.unit_price), unitScale: String(model.billing.unit_scale),
      minimumCharge: String(model.billing.minimum_charge),
      rates: (model.billing.rates ?? []).map((rate) => ({
        label: rate.label,
        dimensions: Object.entries(rate.dimensions).map(([name, value]) => `${name}=${value}`).join(', '),
        unitPrice: String(rate.unit_price), unitScale: String(rate.unit_scale),
        minimumCharge: String(rate.minimum_charge),
      })),
    } : preset ? presetForm(preset) : { ...emptyModelForm });
    setOpen(true);
  }

  // Restoring the default clears the stored override; the gateway then serves
  // the built-in profile again.
  function restoreDefault() {
    const preset = presets.find((candidate) => candidate.name === form.provider);
    setForm((current) => ({ ...current, profile: preset ? JSON.stringify(preset.profile, null, 2) : '' }));
  }

  function field<K extends keyof ModelForm>(key: K, value: ModelForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateBinding(index: number, key: keyof BindingForm, value: string) {
    setForm((current) => ({
      ...current,
      bindings: current.bindings.map((binding, bindingIndex) =>
        bindingIndex === index ? { ...binding, [key]: value } : binding),
    }));
  }

  function addBinding() {
    setForm((current) => ({
      ...current,
      bindings: [...current.bindings, newBinding(`backup-${current.bindings.length}`, '')],
    }));
  }

  function removeBinding(index: number) {
    setForm((current) => ({
      ...current,
      bindings: current.bindings.filter((_, bindingIndex) => bindingIndex !== index),
    }));
  }

  function updateRate(index: number, key: keyof RateForm, value: string) {
    setForm((current) => ({
      ...current,
      rates: current.rates.map((rate, rateIndex) => rateIndex === index ? { ...rate, [key]: value } : rate),
    }));
  }

  function addRate() {
    setForm((current) => ({
      ...current,
      rates: [...current.rates, { label: '', dimensions: '', unitPrice: '0', unitScale: '1', minimumCharge: '0' }],
    }));
  }

  function removeRate(index: number) {
    setForm((current) => ({ ...current, rates: current.rates.filter((_, rateIndex) => rateIndex !== index) }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    onError('');
    try {
      await api<AdminModel>(`/v1/admin/models/${encodeURIComponent(form.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          id: form.id, display_name: form.displayName, provider: form.provider,
          upstream_model: form.upstreamModel,
          protocol_profile: parseProfile(form.profile),
          bindings: form.bindings.map((binding) => ({
            alias: binding.alias, endpoint: binding.endpoint,
            api_key: binding.apiKey || undefined, status: binding.status,
            weight: Number(binding.weight) || 1,
          })),
          status: form.status,
          billing: {
            mode: form.billingMode, currency: form.currency, unit_price: Number(form.unitPrice),
            unit_scale: Number(form.unitScale), minimum_charge: Number(form.minimumCharge),
            rates: form.rates.map((rate) => ({
              label: rate.label,
              dimensions: parseRateDimensions(rate.dimensions),
              unit_price: Number(rate.unitPrice), unit_scale: Number(rate.unitScale),
              minimum_charge: Number(rate.minimumCharge),
            })),
          },
        }),
      }, true);
      await onSaved();
      setOpen(false);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Unable to save model');
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel table-wrap"><div className="panel-heading table-heading"><div><h2>Model catalog</h2><p>Runtime endpoints, write-only credentials, and tenant pricing.</p></div><DropdownMenu.Root><DropdownMenu.Trigger className="button primary"><Plus size={16} />Add model<ChevronDown size={15} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="menu" align="end" sideOffset={6}>{presets.map((preset) => <DropdownMenu.Item className="menu-item stacked" key={preset.name} onSelect={() => edit(undefined, preset)}><b>{preset.display_name}</b><small>{preset.name}</small></DropdownMenu.Item>)}<DropdownMenu.Item className="menu-item stacked" onSelect={() => edit()}><b>Custom provider</b><small>Paste a protocol profile</small></DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div><table><thead><tr><th>Model</th><th>Provider endpoint</th><th>Credential</th><th>Billing</th><th>Status</th><th /></tr></thead><tbody>{models.map((model) => <tr key={model.id}><td><div className="model-cell"><span className="provider-icon"><Cpu size={17} /></span><div><b>{model.display_name}</b><small>{model.id} · {model.provider}/{model.upstream_model}{model.profile_customized ? ' · custom profile' : ''}</small></div></div></td><td><span className="endpoint-cell"><Server size={14} />{model.endpoint ? new URL(model.endpoint).host : 'built in'}{(model.bindings?.length ?? 0) > 1 ? ` +${(model.bindings?.length ?? 1) - 1} more` : ''}</span></td><td>{model.provider === 'development' ? <span className="muted">Not required</span> : <span className={`credential-state ${model.api_key_configured ? 'configured' : ''}`}><KeyRound size={14} />{model.api_key_configured ? 'Configured' : 'Missing'}</span>}</td><td><span className="billing-cell"><CircleDollarSign size={14} />{billingLabel(model.billing)}</span></td><td><span className={`status status-${model.status}`}>{model.status}</span></td><td>{model.provider === 'development' ? <span className="count-pill">Built in</span> : <button className="row-action text-action" onClick={() => edit(model)}>Configure</button>}</td></tr>)}</tbody></table>
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content model-dialog"><div className="dialog-heading"><div><Dialog.Title>{editing ? `Configure ${editing.display_name}` : 'Add model'}</Dialog.Title><Dialog.Description>The protocol profile decides which upstream routes exist, where the task ID and output URL live, and how status maps. Changes become effective for new jobs immediately.</Dialog.Description></div><Dialog.Close className="icon-button"><X size={18} /></Dialog.Close></div><form className="dialog-form" onSubmit={save}>
      <div className="field-grid two"><label className="field"><span className="field-label">Public model ID</span><input required pattern="[A-Za-z0-9][A-Za-z0-9._-]*" value={form.id} disabled={Boolean(editing)} onChange={(event) => field('id', event.target.value)} placeholder="MiniMax-H3" /></label><label className="field"><span className="field-label">Display name</span><input required value={form.displayName} onChange={(event) => field('displayName', event.target.value)} placeholder="MiniMax H3" /></label></div>
      <div className="field-grid two"><label className="field"><span className="field-label">Provider</span><input required pattern="[a-z][a-z0-9_-]*" value={form.provider} disabled={Boolean(editing)} onChange={(event) => field('provider', event.target.value)} placeholder="xai" /><small>Selects the built-in protocol profile when one ships with that name.</small></label><label className="field"><span className="field-label">Upstream model</span><input required value={form.upstreamModel} onChange={(event) => field('upstreamModel', event.target.value)} placeholder="grok-imagine-video-1.5" /></label></div>
      <section className="rate-editor"><div className="rate-editor-heading"><div><h4>Upstream bindings</h4><p>Each binding is one base URL and credential under an alias. The gateway picks an active binding at random by weight and moves to the next one when a submission cannot be placed. Tenants never see or choose a binding.</p></div><button className="button secondary" type="button" onClick={addBinding}><Plus size={14} />Add binding</button></div>{form.bindings.length ? <div className="rate-stack">{form.bindings.map((binding, index) => <article className="rate-card" key={index}><div className="rate-card-heading"><strong>{binding.alias || `Binding ${index + 1}`}</strong>{form.bindings.length > 1 && <button type="button" className="icon-button danger-icon" onClick={() => removeBinding(index)} aria-label={`Remove binding ${binding.alias}`}><Trash2 size={14} /></button>}</div><div className="field-grid three"><label className="field"><span className="field-label">Alias</span><input required pattern="[a-z0-9][a-z0-9_-]*" value={binding.alias} onChange={(event) => updateBinding(index, 'alias', event.target.value)} placeholder="hk-relay" /></label><label className="field"><span className="field-label">Availability</span><select value={binding.status} onChange={(event) => updateBinding(index, 'status', event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="field"><span className="field-label">Weight</span><input type="number" min="1" max="1000" required value={binding.weight} onChange={(event) => updateBinding(index, 'weight', event.target.value)} /></label></div><label className="field"><span className="field-label">API base URL</span><input type="url" required value={binding.endpoint} onChange={(event) => updateBinding(index, 'endpoint', event.target.value)} /><small>The gateway appends the profile's own route paths to this base.</small></label><label className="field"><span className="field-label">API key</span><input type="password" autoComplete="new-password" value={binding.apiKey} onChange={(event) => updateBinding(index, 'apiKey', event.target.value)} placeholder={binding.configured ? 'Leave blank to keep the current encrypted key' : 'Required before activation'} /><small>Encrypted with AES-256-GCM before SQLite persistence.</small></label></article>)}</div> : <div className="rate-empty">Add at least one upstream binding.</div>}</section>
      <div className="form-section-title"><CircleDollarSign size={16} />Billing rule</div><div className="field-grid two"><label className="field"><span className="field-label">Charge by</span><select value={form.billingMode} onChange={(event) => field('billingMode', event.target.value as ModelBilling['mode'])}><option value="free">Free</option><option value="per_request">Per request</option><option value="per_output_second">Per output second</option></select></label><label className="field"><span className="field-label">Currency</span><input required maxLength={3} value={form.currency} onChange={(event) => field('currency', event.target.value.toUpperCase())} /></label></div>
      <div className="field-grid three"><label className="field"><span className="field-label">Fallback unit price</span><input type="number" min="0" required disabled={form.billingMode === 'free'} value={form.unitPrice} onChange={(event) => field('unitPrice', event.target.value)} /><small>Currency minor units when no parameter tier matches.</small></label><label className="field"><span className="field-label">Units per price</span><input type="number" min="1" required value={form.unitScale} onChange={(event) => field('unitScale', event.target.value)} /></label><label className="field"><span className="field-label">Minimum charge</span><input type="number" min="0" required disabled={form.billingMode === 'free'} value={form.minimumCharge} onChange={(event) => field('minimumCharge', event.target.value)} /></label></div>
      {form.billingMode === 'per_output_second' && <section className="rate-editor"><div className="rate-editor-heading"><div><h4>Parameter rate tiers</h4><p>The most specific matching selector wins. MiniMax lists 2K at ¥0.80/s and 768P at ¥0.50/s.</p></div><button className="button secondary" type="button" onClick={addRate}><Plus size={14} />Add tier</button></div>{form.rates.length ? <div className="rate-stack">{form.rates.map((rate, index) => <article className="rate-card" key={index}><div className="rate-card-heading"><strong>Tier {index + 1}</strong><button type="button" className="icon-button danger-icon" onClick={() => removeRate(index)} aria-label={`Remove tier ${index + 1}`}><Trash2 size={14} /></button></div><div className="field-grid two"><label className="field"><span className="field-label">Label</span><input required value={rate.label} onChange={(event) => updateRate(index, 'label', event.target.value)} placeholder="2K output" /></label><label className="field"><span className="field-label">Parameter selectors</span><input required value={rate.dimensions} onChange={(event) => updateRate(index, 'dimensions', event.target.value)} placeholder="resolution=2K, ratio=16:9" /><small>Comma-separated parameter=value pairs.</small></label></div><div className="field-grid three"><label className="field"><span className="field-label">Unit price</span><input type="number" min="0" required value={rate.unitPrice} onChange={(event) => updateRate(index, 'unitPrice', event.target.value)} /></label><label className="field"><span className="field-label">Units per price</span><input type="number" min="1" required value={rate.unitScale} onChange={(event) => updateRate(index, 'unitScale', event.target.value)} /></label><label className="field"><span className="field-label">Minimum charge</span><input type="number" min="0" required value={rate.minimumCharge} onChange={(event) => updateRate(index, 'minimumCharge', event.target.value)} /></label></div></article>)}</div> : <div className="rate-empty">No parameter tiers. The fallback unit price applies to every output second.</div>}<a className="pricing-reference" href="https://platform.minimaxi.com/docs/guides/pricing-paygo" target="_blank" rel="noreferrer">Open MiniMax pay-as-you-go pricing</a></section>}
      <details className="profile-editor" open={Boolean(editing?.profile_customized)}><summary>Protocol profile{editing?.profile_customized ? ' · customized' : ' · built-in default'}</summary><label className="field"><textarea rows={16} spellCheck={false} value={form.profile} onChange={(event) => field('profile', event.target.value)} placeholder="Paste the JSON profile for a provider without a built-in default" /><small>Routes are an allowlist: a client can only reach the paths listed here with the stored credential.</small></label><button className="button secondary" type="button" onClick={restoreDefault}>Restore default</button></details>
      <label className="field"><span className="field-label">Availability</span><select value={form.status} onChange={(event) => field('status', event.target.value as ModelForm['status'])}><option value="inactive">Inactive</option><option value="active">Active for tenants</option></select></label>
      <div className="dialog-actions"><Dialog.Close className="button secondary" type="button">Cancel</Dialog.Close><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save configuration'}</button></div>
    </form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}

// parseProfile sends an edited profile as JSON. An empty editor means "use the
// provider's built-in default".
function parseProfile(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('The protocol profile must be valid JSON');
  }
}

function billingLabel(billing: ModelBilling) {
  if (billing.mode === 'free') return 'Free';
  const unit = billing.mode === 'per_request' ? 'request' : 'second';
  const tiers = billing.rates?.length ? ` · ${billing.rates.length} parameter tiers` : '';
  return `${billing.unit_price}/${billing.unit_scale} ${billing.currency} minor units per ${unit}${tiers}`;
}

function parseRateDimensions(value: string): Record<string, string> {
  const dimensions: Record<string, string> = {};
  for (const entry of value.split(',').map((item) => item.trim()).filter(Boolean)) {
    const separator = entry.indexOf('=');
    if (separator <= 0 || separator === entry.length - 1) {
      throw new Error(`Invalid rate selector “${entry}”; use parameter=value`);
    }
    dimensions[entry.slice(0, separator).trim()] = entry.slice(separator + 1).trim();
  }
  if (!Object.keys(dimensions).length) throw new Error('Every parameter rate needs at least one selector');
  return dimensions;
}

function UsersTable({ users, onStatus }: { users: AdminUser[]; onStatus: (user: AdminUser, status: Tenant['status']) => Promise<void> }) {
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [nextStatus, setNextStatus] = useState<Tenant['status']>('suspended');
  function confirm(user: AdminUser, status: Tenant['status']) { setSelected(user); setNextStatus(status); }
  return <section className="panel table-wrap">
    <div className="panel-heading table-heading"><div><h2>Accounts</h2><p>Registered accounts, the workspace they own, and their activity.</p></div><span className="count-pill">{users.length} total</span></div>
    {users.length ? <table><thead><tr><th>Account</th><th>Workspace</th><th>Role</th><th>Members</th><th>Generations</th><th>API keys</th><th>Status</th><th>Last seen</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="tenant-cell"><span className="tenant-monogram">{user.email.slice(0, 2).toUpperCase()}</span><div><b>{user.email}</b><small>Registered {formatDate(user.created_at)}</small></div></div></td><td>{user.tenant.id ? <div className="tenant-cell"><div><b>{user.tenant.name}</b><small>{user.tenant.slug}</small></div></div> : <span className="muted">No workspace</span>}</td><td>{user.role || '—'}</td><td>{user.tenant.id ? user.member_count : '—'}</td><td>{user.generation_count}</td><td>{user.api_key_count}</td><td><div className="status-cell">{user.tenant.id ? <span className={`status status-${user.tenant.status}`}>{user.tenant.status}</span> : <span className="muted">No workspace</span>}{user.status !== 'active' && <span className={`status status-${user.status}`}>account {user.status}</span>}</div></td><td>{user.last_seen_at ? formatDate(user.last_seen_at) : 'Never'}</td><td><div className="key-actions"><DropdownMenu.Root><DropdownMenu.Trigger className="row-menu" disabled={!user.tenant.id}>Manage <ChevronDown size={14} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="menu" align="end"><DropdownMenu.Item className="menu-item" disabled={user.tenant.status === 'active'} onSelect={() => confirm(user, 'active')}><CirclePlay size={15} />Activate workspace</DropdownMenu.Item><DropdownMenu.Item className="menu-item" disabled={user.tenant.status === 'suspended'} onSelect={() => confirm(user, 'suspended')}><CirclePause size={15} />Suspend workspace</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root><Link className="row-action text-action" to={`/admin/users/${encodeURIComponent(user.id)}`}>Inspect</Link></div></td></tr>)}</tbody></table> : <div className="empty-state"><Users size={22} /><b>No accounts yet</b><span>Accounts appear here after their first sign-in.</span></div>}
    <Dialog.Root open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content small"><div className="dialog-heading"><div><Dialog.Title>{nextStatus === 'active' ? 'Activate' : 'Suspend'} workspace?</Dialog.Title><Dialog.Description>{selected?.tenant.name} ({selected?.email}) will {nextStatus === 'active' ? 'regain access immediately' : 'lose session and API access immediately'}.</Dialog.Description></div><Dialog.Close className="icon-button"><X size={18} /></Dialog.Close></div><div className="warning-box"><ShieldAlert size={18} /><span>This action is written to the audit trail.</span></div><div className="dialog-actions"><Dialog.Close className="button secondary">Cancel</Dialog.Close><button className={`button ${nextStatus === 'active' ? 'primary' : 'danger-button'}`} onClick={() => selected && void onStatus(selected, nextStatus).then(() => setSelected(null))}>Confirm {nextStatus}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}

function UserDetail() {
  const { userId = '' } = useParams();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selected, setSelected] = useState<Generation | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const base = `/v1/admin/users/${encodeURIComponent(userId)}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [profile, jobs] = await Promise.all([
          api<AdminUser>(base, {}, true),
          api<{ data: Generation[] }>(`${base}/generations?limit=50`, {}, true),
        ]);
        if (cancelled) return;
        setUser(profile);
        setGenerations(jobs.data);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load this account');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [base]);

  async function openDetails(generation: Generation) {
    setSelected(generation);
    setArtifacts([]);
    setDetailsLoading(true);
    try {
      const path = `${base}/generations/${encodeURIComponent(generation.id)}`;
      const [details, artifactList] = await Promise.all([
        api<Generation>(path, {}, true),
        api<{ data: Artifact[] }>(`${path}/artifacts`, {}, true),
      ]);
      setSelected(details);
      setArtifacts(artifactList.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load generation details');
    } finally {
      setDetailsLoading(false);
    }
  }

  return <div className="user-detail">
    <Link className="back-link" to="/admin/users"><ArrowLeft size={14} />All users</Link>
    {error && <div className="banner-error" role="alert">{error}</div>}
    {loading ? <div className="panel"><div className="empty-state"><span className="loader" />Loading account…</div></div> : user ? <>
      <div className="admin-grid">
        <section className="panel"><div className="panel-heading"><div><h2>Personal information</h2><p>What the account holder registered with.</p></div><UserRound size={19} /></div><div className="panel-body"><dl className="parameter-list">
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Display name</dt><dd>{user.display_name}</dd></div>
          <div><dt>User ID</dt><dd>{user.id}</dd></div>
          <div><dt>Account status</dt><dd>{user.status}</dd></div>
          <div><dt>Workspace role</dt><dd>{user.role || '—'}</dd></div>
          <div><dt>Email verified</dt><dd>{user.email_verified_at ? formatDay(user.email_verified_at) : 'No'}</dd></div>
          <div><dt>Registered</dt><dd>{formatDay(user.created_at)}</dd></div>
          <div><dt>Last seen</dt><dd>{user.last_seen_at ? formatDate(user.last_seen_at) : 'Never'}</dd></div>
        </dl></div></section>
        <section className="panel"><div className="panel-heading"><div><h2>Workspace</h2><p>The tenant its generations and API keys belong to.</p></div><Building2 size={19} /></div><div className="panel-body">{user.tenant.id ? <dl className="parameter-list">
          <div><dt>Name</dt><dd>{user.tenant.name}</dd></div>
          <div><dt>Slug</dt><dd>{user.tenant.slug}</dd></div>
          <div><dt>Tenant ID</dt><dd>{user.tenant.id}</dd></div>
          <div><dt>Status</dt><dd>{user.tenant.status}</dd></div>
          <div><dt>Generations</dt><dd>{user.generation_count}</dd></div>
          <div><dt>API keys</dt><dd>{user.api_key_count}</dd></div>
          <div><dt>Created</dt><dd>{formatDay(user.tenant.created_at)}</dd></div>
          <div><dt>Last activity</dt><dd>{user.last_activity_at ? formatDate(user.last_activity_at) : 'None'}</dd></div>
        </dl> : <p className="muted">This account has no active workspace membership.</p>}</div></section>
      </div>
      <section className="panel table-wrap">
        <div className="panel-heading table-heading"><div><h2>Generations</h2><p>Jobs submitted from this workspace, newest first.</p></div><span className="count-pill">{generations.length} loaded</span></div>
        <GenerationsTable generations={generations} compact emptyHint="This account has not submitted a job yet." onSelect={openDetails} />
      </section>
    </> : null}
    <GenerationDetails generation={selected} artifacts={artifacts} loading={detailsLoading} onClose={() => setSelected(null)} />
  </div>;
}
