import {
  Activity,
  ArrowLeft,
  Boxes,
  Building2,
  ChevronDown,
  CircleDollarSign,
  CirclePause,
  CirclePlay,
  Cpu,
  CreditCard,
  Film,
  Gauge,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  Plus,
  ReceiptText,
  RotateCcw,
  Server,
  ShieldAlert,
  Sliders,
  Trash2,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Dialog, DropdownMenu } from 'radix-ui';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router';
import { APIError, absoluteGatewayURL, api, gatewayURL } from '../api';
import { GenerationComposer } from '../components/Composer';
import { GenerationDetails, GenerationsTable } from '../components/Generations';
import { Shell } from '../components/Shell';
import { TopupDialog } from '../components/TopupDialog';
import { TransactionsTable, useTransactions } from '../components/Transactions';
import { formatAmount, formatDate, formatDay, formatStatus } from '../format';
import { t, useI18n } from '../i18n';
import { currentAdminUserPath } from '../lib/adminUserPath';
import type { CreditRequest } from '../lib/billing';
import {
  exchangeRateLabel,
  formatExchangeRate,
  parseExchangeRate,
} from '../lib/currency';
import {
  adminInvoicePath,
  formatPresetAmounts,
  majorUnitsLabel,
  parseBoundAmount,
  parsePresetAmounts,
  stripeWebhookURL,
  topupAmountLabel,
  topupOrdersPageSize,
  topupStatusClass,
  topupStatuses,
  validateTopupConfig,
} from '../lib/topup';
import type {
  AdminModel,
  AdminOverview,
  AdminProfile,
  AdminTopup,
  AdminTopupList,
  AdminUser,
  Artifact,
  AssetStorage,
  Generation,
  ModelBilling,
  ProtocolPreset,
  Tenant,
  Topup,
  TopupConfig,
} from '../types';
import { ImagePlayground } from './ImagePlayground';
import { VideoStudio } from './VideoStudio';

export function AdminConsole() {
  const { t: translate } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [presets, setPresets] = useState<ProtocolPreset[]>([]);
  const [storage, setStorage] = useState<AssetStorage | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selected, setSelected] = useState<Generation | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [
        administrator,
        summary,
        userList,
        modelList,
        presetList,
        storageConfig,
        generationList,
      ] = await Promise.all([
        api<AdminProfile>('/v1/admin/auth/me', {}, true),
        api<AdminOverview>('/v1/admin/overview', {}, true),
        api<{ data: AdminUser[] }>('/v1/admin/users', {}, true),
        api<{ data: AdminModel[] }>('/v1/admin/models', {}, true),
        api<{ data: ProtocolPreset[] }>(
          '/v1/admin/protocol-profiles',
          {},
          true,
        ),
        api<AssetStorage>('/v1/admin/storage', {}, true),
        api<{ data: Generation[] }>('/v1/admin/generations?limit=50', {}, true),
      ]);
      setProfile(administrator);
      setOverview(summary);
      setUsers(userList.data);
      setModels(modelList.data);
      setPresets(presetList.data);
      setStorage(storageConfig);
      setGenerations(generationList.data);
    } catch (reason) {
      if (reason instanceof APIError && reason.status === 401) {
        navigate('/admin/login', { replace: true });
        return;
      }
      setError(
        reason instanceof Error ? reason.message : translate('admin.errorLoad'),
      );
    } finally {
      setLoading(false);
    }
  }, [navigate, translate]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadGenerations = useCallback(async () => {
    try {
      const generationList = await api<{ data: Generation[] }>(
        '/v1/admin/generations?limit=50',
        {},
        true,
      );
      setGenerations(generationList.data);
    } catch (reason) {
      if (reason instanceof APIError && reason.status === 401) {
        navigate('/admin/login', { replace: true });
        return;
      }
      setError(
        reason instanceof Error ? reason.message : translate('admin.errorLoad'),
      );
    }
  }, [navigate, translate]);

  useEffect(() => {
    if (
      !generations.some((item) =>
        ['queued', 'submitting', 'submitted', 'in_progress'].includes(
          item.status,
        ),
      )
    )
      return;
    const timer = window.setInterval(() => {
      void loadGenerations();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [generations, loadGenerations]);

  async function openGenerationDetails(generation: Generation) {
    setSelected(generation);
    setArtifacts([]);
    setDetailsLoading(true);
    try {
      const [freshGeneration, artifactList] = await Promise.all([
        api<Generation>(`/v1/admin/generations/${generation.id}`, {}, true),
        api<{ data: Artifact[] }>(
          `/v1/admin/generations/${generation.id}/artifacts`,
          {},
          true,
        ),
      ]);
      setSelected(freshGeneration);
      setGenerations((current) =>
        current.map((item) =>
          item.id === freshGeneration.id ? freshGeneration : item,
        ),
      );
      setArtifacts(artifactList.data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : translate('tenant.errorDetails'),
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  // Suspension acts on the workspace, which is what carries session and API access.
  async function setStatus(user: AdminUser, status: Tenant['status']) {
    setError('');
    try {
      await api(
        `/v1/admin/tenants/${encodeURIComponent(user.tenant.id)}`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        true,
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : translate('admin.errorStatus'),
      );
    }
  }

  async function updateCapabilities(
    user: AdminUser,
    capabilities: { image_enabled?: boolean; video_enabled?: boolean },
  ) {
    setError('');
    try {
      await api(
        `/v1/admin/users/${encodeURIComponent(user.id)}`,
        { method: 'PATCH', body: JSON.stringify(capabilities) },
        true,
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : translate('users.capabilitiesError'),
      );
      throw reason;
    }
  }

  async function topupUser(user: AdminUser, request: CreditRequest) {
    setError('');
    try {
      await api(
        `/v1/admin/users/${encodeURIComponent(user.id)}/credits`,
        {
          method: 'POST',
          body: JSON.stringify(request),
        },
        true,
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : translate('users.topupError'),
      );
      throw reason;
    }
  }

  async function logout() {
    try {
      await api('/v1/admin/auth/logout', { method: 'POST' }, true);
    } finally {
      navigate('/admin/login', { replace: true });
    }
  }

  // The composer keeps operator input across a poll only while the catalogue it
  // was handed stays the same array, so the filtering happens once per change
  // rather than on every refresh of the generation list.
  const playableModels = useMemo(
    () =>
      models.filter(
        (item) =>
          item.status === 'active' &&
          (item.modality === 'video' || item.modality === 'image') &&
          item.provider !== 'development' &&
          Boolean(item.request_form),
      ),
    [models],
  );
  const playableGenerations = useMemo(
    () =>
      generations.filter(
        (item) => item.modality === 'video' || item.modality === 'image',
      ),
    [generations],
  );

  if (loading)
    return (
      <div className="loading-screen">
        <span className="loader" />
        <b>{translate('admin.loading')}</b>
      </div>
    );
  if (!profile || !overview) return null;

  return (
    <Shell
      admin
      identity={translate('admin.identity')}
      navigation={[
        {
          label: translate('admin.navOverview'),
          to: '/admin',
          icon: <Gauge size={17} />,
        },
        {
          label: translate('admin.navImage'),
          to: '/admin/image',
          icon: <ImageIcon size={17} />,
        },
        {
          label: translate('admin.navVideo'),
          to: '/admin/video',
          icon: <Film size={17} />,
        },
        {
          label: translate('admin.navVideoGeneration'),
          to: '/admin/generations',
          icon: <Boxes size={17} />,
        },
        {
          label: translate('admin.navAccounts'),
          to: '/admin/users',
          icon: <Users size={17} />,
          nested: true,
        },
        {
          label: translate('admin.navModels'),
          to: '/admin/models',
          icon: <Cpu size={17} />,
        },
        {
          label: translate('admin.navStorage'),
          to: '/admin/storage',
          icon: <HardDrive size={17} />,
        },
        {
          label: translate('admin.navTopup'),
          to: '/admin/topup',
          icon: <CreditCard size={17} />,
        },
        {
          label: translate('admin.navTopupOrders'),
          to: '/admin/topups',
          icon: <ReceiptText size={17} />,
        },
      ]}
      title={translate('admin.title')}
      description={translate('admin.description', { email: profile.email })}
      onLogout={() => void logout()}
    >
      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}
      <Routes>
        <Route
          index
          element={
            <AdminOverviewView
              overview={overview}
              users={users}
              models={models}
            />
          }
        />
        <Route
          path="image"
          element={
            <ImagePlayground
              models={playableModels}
              generations={playableGenerations}
              onCreated={loadGenerations}
              admin
            />
          }
        />
        <Route
          path="video"
          element={
            <VideoStudio
              models={playableModels}
              generations={playableGenerations}
              onCreated={loadGenerations}
              admin
            />
          }
        />
        <Route
          path="generations"
          element={
            <AdminGenerationsView
              models={playableModels}
              generations={playableGenerations}
              onCreated={loadGenerations}
              onSelect={openGenerationDetails}
            />
          }
        />
        <Route
          path="storage"
          element={
            storage ? (
              <StoragePanel
                storage={storage}
                onSaved={load}
                onError={setError}
              />
            ) : null
          }
        />
        <Route path="topup" element={<TopupSettingsPanel />} />
        <Route path="topups" element={<TopupOrdersPanel />} />
        <Route
          path="users"
          element={
            <UsersTable
              users={users}
              onStatus={setStatus}
              onUpdateCapabilities={updateCapabilities}
              onTopup={topupUser}
            />
          }
        />
        <Route path="users/:userId" element={<UserDetail />} />
        <Route
          path="tenants"
          element={<Navigate to="/admin/users" replace />}
        />
        <Route
          path="models"
          element={
            <ModelsPanel
              models={models}
              presets={presets}
              onSaved={load}
              onError={setError}
            />
          }
        />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
      <GenerationDetails
        generation={selected}
        artifacts={artifacts}
        loading={detailsLoading}
        onClose={() => setSelected(null)}
      />
    </Shell>
  );
}

function AdminGenerationsView({
  models,
  generations,
  onCreated,
  onSelect,
}: {
  models: AdminModel[];
  generations: Generation[];
  onCreated: () => Promise<void>;
  onSelect: (generation: Generation) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="panel admin-generations-panel">
      <div className="panel-heading">
        <div>
          <h2>{t('adminGenerations.title')}</h2>
          <p>{t('adminGenerations.note')}</p>
        </div>
        <GenerationComposer models={models} onCreated={onCreated} admin />
      </div>
      <GenerationsTable
        generations={generations}
        compact
        emptyHint={t('adminGenerations.empty')}
        onSelect={onSelect}
      />
    </section>
  );
}

function AdminOverviewView({
  overview,
  users,
  models,
}: {
  overview: AdminOverview;
  users: AdminUser[];
  models: AdminModel[];
}) {
  const { t } = useI18n();
  const utilization = useMemo(
    () =>
      overview.tenant_count
        ? Math.round(
            (overview.active_tenant_count / overview.tenant_count) * 100,
          )
        : 0,
    [overview],
  );
  return (
    <>
      <section className="metric-grid admin-metrics">
        <article className="metric blue">
          <span>{t('adminOverview.tenants')}</span>
          <strong>{overview.tenant_count}</strong>
          <small>
            {t('adminOverview.tenantsNote', {
              count: overview.active_tenant_count,
            })}
          </small>
        </article>
        <article className="metric green">
          <span>{t('adminOverview.users')}</span>
          <strong>{overview.user_count}</strong>
          <small>{t('adminOverview.usersNote')}</small>
        </article>
        <article className="metric amber">
          <span>{t('adminOverview.generations')}</span>
          <strong>{overview.generation_count}</strong>
          <small>
            {t('adminOverview.generationsNote', {
              count: overview.queued_count,
            })}
          </small>
        </article>
        <article className="metric red">
          <span>{t('adminOverview.failed')}</span>
          <strong>{overview.failed_count}</strong>
          <small>{t('adminOverview.failedNote')}</small>
        </article>
      </section>
      <div className="admin-grid">
        <section className="panel health-panel">
          <div className="panel-heading">
            <div>
              <h2>{t('adminOverview.posture')}</h2>
              <p>{t('adminOverview.postureNote')}</p>
            </div>
            <Activity size={19} />
          </div>
          <div className="health-score">
            <strong>{utilization}%</strong>
            <span>{t('adminOverview.tenantsActive')}</span>
          </div>
          <div className="health-track">
            <i style={{ width: `${utilization}%` }} />
          </div>
          <div className="health-list">
            <span>
              <i className="dot green-dot" />
              {t('adminOverview.storage')}
            </span>
            <span>
              <i className="dot green-dot" />
              {t('adminOverview.activeModels', {
                count: models.filter((model) => model.status === 'active')
                  .length,
              })}
            </span>
            <span>
              <i
                className={`dot ${models.some((model) => model.billing.mode !== 'free') ? 'green-dot' : 'amber-dot'}`}
              />
              {t(
                models.some((model) => model.billing.mode !== 'free')
                  ? 'adminOverview.billable'
                  : 'adminOverview.allFree',
              )}
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t('adminOverview.newest')}</h2>
              <p>{t('adminOverview.newestNote')}</p>
            </div>
            <Users size={19} />
          </div>
          <div className="tenant-stack">
            {users.slice(0, 4).map((user) => (
              <div className="tenant-stack-item" key={user.id}>
                <span className="tenant-monogram">
                  {user.email.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <b>{user.email}</b>
                  <small>
                    {user.tenant.name || t('adminOverview.noWorkspace')} ·{' '}
                    {t('adminOverview.jobs', { count: user.generation_count })}
                  </small>
                </div>
                <span
                  className={`status status-${user.tenant.status || user.status}`}
                >
                  {formatStatus(user.tenant.status || 'none')}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

type ModelForm = {
  id: string;
  displayName: string;
  provider: string;
  modality: 'image' | 'video';
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

type StorageForm = {
  backend: 'local' | 's3';
  localPath: string;
  maxBytes: string;
  cdnBaseURL: string;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyID: string;
  s3SecretAccessKey: string;
};

function storageForm(storage: AssetStorage): StorageForm {
  return {
    backend: storage.backend,
    localPath: storage.local_path,
    maxBytes: String(storage.max_bytes),
    cdnBaseURL: storage.cdn_base_url ?? '',
    s3Endpoint: storage.s3_endpoint ?? '',
    s3Region: storage.s3_region ?? '',
    s3Bucket: storage.s3_bucket ?? '',
    s3AccessKeyID: '',
    s3SecretAccessKey: '',
  };
}

function StoragePanel({
  storage,
  onSaved,
  onError,
}: {
  storage: AssetStorage;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<StorageForm>(() => storageForm(storage));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(storageForm(storage));
  }, [storage]);

  async function save(event: FormEvent) {
    event.preventDefault();
    onError('');
    const maxBytes = Number(form.maxBytes);
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      onError(t('storage.errorMaxBytes'));
      return;
    }
    setSaving(true);
    try {
      await api<AssetStorage>(
        '/v1/admin/storage',
        {
          method: 'PUT',
          body: JSON.stringify({
            backend: form.backend,
            local_path: form.localPath,
            max_bytes: maxBytes,
            cdn_base_url: form.cdnBaseURL,
            s3_endpoint: form.s3Endpoint,
            s3_region: form.s3Region,
            s3_bucket: form.s3Bucket,
            s3_access_key_id: form.s3AccessKeyID,
            s3_secret_access_key: form.s3SecretAccessKey,
          }),
        },
        true,
      );
      await onSaved();
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : t('storage.errorSave'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel storage-panel">
      <div className="panel-heading">
        <div>
          <h2>{t('storage.title')}</h2>
          <p>{t('storage.note')}</p>
        </div>
        <HardDrive size={19} />
      </div>
      <form className="panel-body dialog-form" onSubmit={save}>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">{t('storage.backend')}</span>
            <select
              value={form.backend}
              onChange={(event) =>
                setForm({
                  ...form,
                  backend: event.target.value as StorageForm['backend'],
                })
              }
            >
              <option value="local">{t('storage.local')}</option>
              <option value="s3">{t('storage.s3')}</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('storage.maxBytes')}</span>
            <input
              type="number"
              min="1"
              value={form.maxBytes}
              onChange={(event) =>
                setForm({ ...form, maxBytes: event.target.value })
              }
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">{t('storage.localPath')}</span>
          <input
            value={form.localPath}
            onChange={(event) =>
              setForm({ ...form, localPath: event.target.value })
            }
            placeholder="./data/assets"
          />
          <small>{t('storage.localPathNote')}</small>
        </label>
        <label className="field">
          <span className="field-label">{t('storage.cdnBaseURL')}</span>
          <input
            type="url"
            value={form.cdnBaseURL}
            onChange={(event) =>
              setForm({ ...form, cdnBaseURL: event.target.value })
            }
            placeholder="https://cdn.example.com/media"
          />
          <small>{t('storage.cdnNote')}</small>
        </label>
        {form.backend === 's3' && (
          <>
            <div className="form-section-title">{t('storage.s3Section')}</div>
            <div className="field-grid">
              <label className="field">
                <span className="field-label">{t('storage.endpoint')}</span>
                <input
                  type="url"
                  value={form.s3Endpoint}
                  onChange={(event) =>
                    setForm({ ...form, s3Endpoint: event.target.value })
                  }
                  placeholder="https://s3.example.com"
                />
              </label>
              <label className="field">
                <span className="field-label">{t('storage.region')}</span>
                <input
                  value={form.s3Region}
                  onChange={(event) =>
                    setForm({ ...form, s3Region: event.target.value })
                  }
                  placeholder="us-east-1"
                />
              </label>
            </div>
            <label className="field">
              <span className="field-label">{t('storage.bucket')}</span>
              <input
                value={form.s3Bucket}
                onChange={(event) =>
                  setForm({ ...form, s3Bucket: event.target.value })
                }
                placeholder="media"
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span className="field-label">{t('storage.accessKey')}</span>
                <input
                  value={form.s3AccessKeyID}
                  onChange={(event) =>
                    setForm({ ...form, s3AccessKeyID: event.target.value })
                  }
                  placeholder={
                    storage.s3_access_key_configured
                      ? t('storage.keepConfigured')
                      : t('storage.required')
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">{t('storage.secretKey')}</span>
                <input
                  type="password"
                  value={form.s3SecretAccessKey}
                  onChange={(event) =>
                    setForm({ ...form, s3SecretAccessKey: event.target.value })
                  }
                  placeholder={
                    storage.s3_secret_key_configured
                      ? t('storage.keepConfigured')
                      : t('storage.required')
                  }
                />
              </label>
            </div>
            <small className="muted">{t('storage.secretNote')}</small>
          </>
        )}
        <div className="dialog-actions">
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? t('storage.saving') : t('storage.save')}
          </button>
        </div>
      </form>
    </section>
  );
}

type TopupForm = {
  enabled: boolean;
  currency: string;
  amounts: string;
  customAmount: boolean;
  minAmount: string;
  maxAmount: string;
  // The alternate offer shown outside the base-currency regions. `altEnabled`
  // is the console's own switch: the gateway reads an empty `alt_currency` as
  // off, so the other fields are only sent when the switch is on.
  altEnabled: boolean;
  altCurrency: string;
  altAmounts: string;
  altMinAmount: string;
  altMaxAmount: string;
  altRate: string;
};

function topupForm(config: TopupConfig): TopupForm {
  const altCurrency = config.alt_currency ?? '';
  return {
    enabled: config.enabled,
    currency: config.currency,
    amounts: formatPresetAmounts(config.amounts),
    customAmount: config.custom_amount,
    minAmount: majorUnitsLabel(config.min_amount),
    maxAmount: majorUnitsLabel(config.max_amount),
    altEnabled: altCurrency !== '',
    altCurrency,
    altAmounts: formatPresetAmounts(config.alt_amounts ?? []),
    altMinAmount: config.alt_min_amount
      ? majorUnitsLabel(config.alt_min_amount)
      : '',
    altMaxAmount: config.alt_max_amount
      ? majorUnitsLabel(config.alt_max_amount)
      : '',
    altRate: config.alt_rate ? formatExchangeRate(config.alt_rate) : '',
  };
}

// The self-service top-up settings behind `GET/PUT /v1/admin/billing/topup`.
// Amounts are edited in major units and stored in minor units, the same as
// every other billing figure.
function TopupSettingsPanel() {
  const { t } = useI18n();
  const [config, setConfig] = useState<TopupConfig | null>(null);
  const [form, setForm] = useState<TopupForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await api<TopupConfig>(
        '/v1/admin/billing/topup',
        {},
        true,
      );
      setConfig(current);
      setForm(topupForm(current));
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('topupAdmin.errorLoad'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaved(false);
    setError('');

    const currency = form.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError(t('topupAdmin.errorCurrency'));
      return;
    }
    const presets = parsePresetAmounts(form.amounts);
    if (!presets.ok) {
      setError(
        t(
          presets.reason === 'empty'
            ? 'topupAdmin.errorAmountsEmpty'
            : presets.reason === 'too_many'
              ? 'topupAdmin.errorAmountsTooMany'
              : 'topupAdmin.errorAmounts',
        ),
      );
      return;
    }
    const minAmount = parseBoundAmount(form.minAmount);
    const maxAmount = parseBoundAmount(form.maxAmount);
    if (minAmount === null || maxAmount === null) {
      setError(t('topupAdmin.errorMin'));
      return;
    }
    const problem = validateTopupConfig({
      amounts: presets.amounts,
      minAmount,
      maxAmount,
    });
    if (problem) {
      setError(
        t(
          problem === 'range'
            ? 'topupAdmin.errorRange'
            : problem === 'outside'
              ? 'topupAdmin.errorOutside'
              : 'topupAdmin.errorMin',
        ),
      );
      return;
    }

    // The alternate offer is validated exactly like the base one, and is sent
    // as empty rather than as leftover values when the switch is off.
    let alt = {
      alt_currency: '',
      alt_amounts: [] as number[],
      alt_min_amount: 0,
      alt_max_amount: 0,
      alt_rate: 0,
    };
    if (form.altEnabled) {
      const altCurrency = form.altCurrency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(altCurrency) || altCurrency === currency) {
        setError(t('topupAdmin.errorAltCurrency'));
        return;
      }
      const altPresets = parsePresetAmounts(form.altAmounts);
      if (!altPresets.ok) {
        setError(
          t(
            altPresets.reason === 'empty'
              ? 'topupAdmin.errorAmountsEmpty'
              : altPresets.reason === 'too_many'
                ? 'topupAdmin.errorAmountsTooMany'
                : 'topupAdmin.errorAmounts',
          ),
        );
        return;
      }
      const altMin = parseBoundAmount(form.altMinAmount);
      const altMax = parseBoundAmount(form.altMaxAmount);
      if (altMin === null || altMax === null) {
        setError(t('topupAdmin.errorMin'));
        return;
      }
      const altProblem = validateTopupConfig({
        amounts: altPresets.amounts,
        minAmount: altMin,
        maxAmount: altMax,
      });
      if (altProblem) {
        setError(
          t(
            altProblem === 'range'
              ? 'topupAdmin.errorRange'
              : altProblem === 'outside'
                ? 'topupAdmin.errorOutside'
                : 'topupAdmin.errorMin',
          ),
        );
        return;
      }
      const altRate = parseExchangeRate(form.altRate);
      if (altRate === null) {
        setError(t('topupAdmin.errorAltRate'));
        return;
      }
      alt = {
        alt_currency: altCurrency,
        alt_amounts: altPresets.amounts,
        alt_min_amount: altMin,
        alt_max_amount: altMax,
        alt_rate: altRate,
      };
    }

    setSaving(true);
    try {
      const updated = await api<TopupConfig>(
        '/v1/admin/billing/topup',
        {
          method: 'PUT',
          body: JSON.stringify({
            enabled: form.enabled,
            currency,
            amounts: presets.amounts,
            custom_amount: form.customAmount,
            min_amount: minAmount,
            max_amount: maxAmount,
            ...alt,
          }),
        },
        true,
      );
      setConfig(updated);
      setForm(topupForm(updated));
      setSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('topupAdmin.errorSave'),
      );
    } finally {
      setSaving(false);
    }
  }

  const presets = form ? parsePresetAmounts(form.amounts) : null;
  const currency = form?.currency.trim().toUpperCase() || 'CNY';
  const altPresets =
    form?.altEnabled && form.altAmounts
      ? parsePresetAmounts(form.altAmounts)
      : null;
  const altCurrency = form?.altCurrency.trim().toUpperCase() || '';
  const altRate = form ? parseExchangeRate(form.altRate) : null;
  // The preview reads the rate back the way a tenant sees it, so the
  // administrator can tell 7.15 from 0.0715 without saving first.
  const altRateLabel =
    altRate !== null && /^[A-Z]{3}$/.test(altCurrency)
      ? exchangeRateLabel({
          currency: altCurrency,
          base_currency: currency,
          rate: altRate,
        })
      : '';
  const baseCountries = config?.base_countries ?? [];
  const webhook = stripeWebhookURL(gatewayURL);

  return (
    <section className="panel storage-panel">
      <div className="panel-heading">
        <div>
          <h2>{t('topupAdmin.title')}</h2>
          <p>{t('topupAdmin.note')}</p>
        </div>
        <CreditCard size={19} />
      </div>
      {error && (
        <div
          className="banner-error"
          role="alert"
          style={{ margin: '16px 20px 0' }}
        >
          {error}
        </div>
      )}
      {saved && (
        <div
          className="banner-success"
          role="status"
          style={{ margin: '16px 20px 0' }}
        >
          <span>{t('topupAdmin.saved')}</span>
        </div>
      )}
      {loading || !form ? (
        <div className="empty-state">
          <span className="loader" />
          {t('topupAdmin.loading')}
        </div>
      ) : (
        <form className="panel-body dialog-form" onSubmit={save}>
          {config && !config.stripe_configured && (
            <div className="warning-box" style={{ margin: 0 }}>
              <ShieldAlert size={16} />
              <span>{t('topupAdmin.stripeHint')}</span>
            </div>
          )}
          <label className="topup-switch">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm({ ...form, enabled: event.target.checked })
              }
            />
            <span>{t('topupAdmin.enabled')}</span>
          </label>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">{t('topupAdmin.currency')}</span>
              <input
                value={form.currency}
                maxLength={3}
                style={{ textTransform: 'uppercase' }}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currency: event.target.value.toUpperCase(),
                  })
                }
                placeholder="CNY"
              />
              <small>{t('topupAdmin.currencyNote')}</small>
            </label>
            <label className="topup-switch">
              <input
                type="checkbox"
                checked={form.customAmount}
                onChange={(event) =>
                  setForm({ ...form, customAmount: event.target.checked })
                }
              />
              <span>{t('topupAdmin.customAmount')}</span>
            </label>
          </div>
          <label className="field">
            <span className="field-label">{t('topupAdmin.amounts')}</span>
            <input
              value={form.amounts}
              onChange={(event) =>
                setForm({ ...form, amounts: event.target.value })
              }
              placeholder="20, 50, 100, 200, 500, 1000"
            />
            <small>{t('topupAdmin.amountsNote')}</small>
          </label>
          {presets?.ok && (
            <div className="topup-preview">
              <span className="field-label">
                {t('topupAdmin.amountsPreview')}
              </span>
              <div className="topup-preview-chips">
                {presets.amounts.map((amount) => (
                  <span className="topup-preview-chip" key={amount}>
                    {topupAmountLabel(amount, currency)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="field-grid">
            <label className="field">
              <span className="field-label">{t('topupAdmin.minAmount')}</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.minAmount}
                onChange={(event) =>
                  setForm({ ...form, minAmount: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">{t('topupAdmin.maxAmount')}</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.maxAmount}
                onChange={(event) =>
                  setForm({ ...form, maxAmount: event.target.value })
                }
              />
            </label>
          </div>
          <small className="muted">{t('topupAdmin.limitsNote')}</small>
          <div className="form-section-title">{t('topupAdmin.altSection')}</div>
          <p className="muted">{t('topupAdmin.altNote')}</p>
          <div className="field">
            <span className="field-label">{t('topupAdmin.baseCountries')}</span>
            <div className="topup-preview-chips">
              {baseCountries.length > 0 ? (
                baseCountries.map((code) => (
                  <span className="topup-preview-chip" key={code}>
                    {code}
                  </span>
                ))
              ) : (
                <span className="muted">
                  {t('topupAdmin.baseCountriesEmpty')}
                </span>
              )}
            </div>
            <small>{t('topupAdmin.baseCountriesNote')}</small>
          </div>
          <label className="topup-switch">
            <input
              type="checkbox"
              checked={form.altEnabled}
              onChange={(event) =>
                setForm({ ...form, altEnabled: event.target.checked })
              }
            />
            <span>{t('topupAdmin.altEnabled')}</span>
          </label>
          {!form.altEnabled && (
            <small className="muted">{t('topupAdmin.altOff')}</small>
          )}
          {form.altEnabled && (
            <>
              <div className="field-grid">
                <label className="field">
                  <span className="field-label">
                    {t('topupAdmin.altCurrency')}
                  </span>
                  <input
                    value={form.altCurrency}
                    maxLength={3}
                    style={{ textTransform: 'uppercase' }}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        altCurrency: event.target.value.toUpperCase(),
                      })
                    }
                    placeholder="USD"
                  />
                  <small>{t('topupAdmin.altCurrencyNote')}</small>
                </label>
                <label className="field">
                  <span className="field-label">{t('topupAdmin.altRate')}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.altRate}
                    onChange={(event) =>
                      setForm({ ...form, altRate: event.target.value })
                    }
                    placeholder="7.15"
                  />
                  <small>
                    {t('topupAdmin.altRateNote', {
                      rate: altRateLabel || '¥7.15 = $1.00',
                    })}
                  </small>
                </label>
              </div>
              <label className="field">
                <span className="field-label">
                  {t('topupAdmin.altAmounts')}
                </span>
                <input
                  value={form.altAmounts}
                  onChange={(event) =>
                    setForm({ ...form, altAmounts: event.target.value })
                  }
                  placeholder="5, 10, 20, 50, 100"
                />
                <small>{t('topupAdmin.amountsNote')}</small>
              </label>
              {altPresets?.ok && altCurrency && (
                <div className="topup-preview">
                  <span className="field-label">
                    {t('topupAdmin.amountsPreview')}
                  </span>
                  <div className="topup-preview-chips">
                    {altPresets.amounts.map((amount) => (
                      <span className="topup-preview-chip" key={amount}>
                        {topupAmountLabel(amount, altCurrency)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="field-grid">
                <label className="field">
                  <span className="field-label">
                    {t('topupAdmin.altMinAmount')}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.altMinAmount}
                    onChange={(event) =>
                      setForm({ ...form, altMinAmount: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">
                    {t('topupAdmin.altMaxAmount')}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.altMaxAmount}
                    onChange={(event) =>
                      setForm({ ...form, altMaxAmount: event.target.value })
                    }
                  />
                </label>
              </div>
              {altRateLabel && (
                <small className="muted">
                  {t('topupAdmin.altRatePreview', { rate: altRateLabel })}
                </small>
              )}
            </>
          )}
          <div className="form-section-title">
            {t('topupAdmin.serverSection')}
          </div>
          <div className="field-grid">
            <div className="field">
              <span className="field-label">{t('topupAdmin.stripeKey')}</span>
              <span
                className={`credential-state${
                  config?.stripe_configured ? ' configured' : ''
                }`}
              >
                {t(
                  config?.stripe_configured
                    ? 'topupAdmin.configured'
                    : 'topupAdmin.missing',
                )}
              </span>
            </div>
            <div className="field">
              <span className="field-label">
                {t('topupAdmin.webhookSecret')}
              </span>
              <span
                className={`credential-state${
                  config?.webhook_configured ? ' configured' : ''
                }`}
              >
                {t(
                  config?.webhook_configured
                    ? 'topupAdmin.configured'
                    : 'topupAdmin.missing',
                )}
              </span>
            </div>
          </div>
          <div className="endpoint-value">
            <span>{t('topupAdmin.webhookURL')}</span>
            <div className="copy-value">
              <code>{webhook}</code>
            </div>
            <small className="muted">{t('topupAdmin.webhookEvents')}</small>
          </div>
          <div className="dialog-actions">
            <button className="button primary" type="submit" disabled={saving}>
              {t(saving ? 'topupAdmin.saving' : 'topupAdmin.save')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// Every Stripe order across the install, behind `GET /v1/admin/billing/topups`.
// The panel owns its own fetching: the console's start-up load would otherwise
// wait on a list nobody has asked to see yet.
function TopupOrdersPanel() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<AdminTopup[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({
      limit: String(topupOrdersPageSize),
      offset: String(offset),
    });
    if (status) query.set('status', status);
    api<AdminTopupList>(
      `/v1/admin/billing/topups?${query.toString()}`,
      { signal: controller.signal },
      true,
    ).then(
      (response) => {
        if (sequence !== requestSequence.current) return;
        setOrders(response.data ?? []);
        setTotal(response.total ?? 0);
        setLoading(false);
      },
      (reason: unknown) => {
        if (
          sequence !== requestSequence.current ||
          (reason instanceof DOMException && reason.name === 'AbortError')
        ) {
          return;
        }
        setError(
          reason instanceof Error ? reason.message : t('topupOrders.errorLoad'),
        );
        setOrders([]);
        setTotal(0);
        setLoading(false);
      },
    );
    return () => {
      controller.abort();
    };
  }, [offset, status, t]);

  const first = total === 0 ? 0 : offset + 1;
  const last = offset + orders.length;

  return (
    <section className="panel table-wrap">
      <div className="panel-heading table-heading">
        <div>
          <h2>{t('topupOrders.title')}</h2>
          <p>{t('topupOrders.note')}</p>
        </div>
        <label className="topup-orders-filter">
          <span className="field-label">{t('topupOrders.filterLabel')}</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">{t('topupOrders.filterAll')}</option>
            {topupStatuses.map((value) => (
              <option key={value} value={value}>
                {formatStatus(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}
      <div className="topup-orders-summary">
        <span className="count-pill">
          {t('topupOrders.summary', { count: total })}
        </span>
      </div>
      {loading ? (
        <div className="empty-state">
          <span className="loader" />
          <span>{t('topupOrders.loading')}</span>
        </div>
      ) : orders.length === 0 ? (
        error ? null : (
          <div className="empty-state">
            <b>{t('topupOrders.empty')}</b>
            <span>{t('topupOrders.emptyNote')}</span>
          </div>
        )
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>{t('topupOrders.columnTime')}</th>
                <th>{t('topupOrders.columnUser')}</th>
                <th>{t('topupOrders.columnAmount')}</th>
                <th>{t('topupOrders.columnStatus')}</th>
                <th>{t('topupOrders.columnCompleted')}</th>
                <th>{t('topupOrders.columnInvoice')}</th>
                <th>{t('topupOrders.columnID')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{formatDate(order.created_at)}</td>
                  <td>
                    {order.user_id ? (
                      <Link
                        className="text-action"
                        to={`/admin/users/${encodeURIComponent(order.user_id)}`}
                      >
                        {order.email || order.user_id}
                      </Link>
                    ) : (
                      (order.email ?? '—')
                    )}
                  </td>
                  <td>
                    <b>{topupAmountLabel(order.amount, order.currency)}</b>
                  </td>
                  <td>
                    <span
                      className={`status ${topupStatusClass(order.status)}`}
                    >
                      {formatStatus(order.status)}
                    </span>
                  </td>
                  <td>
                    {order.completed_at ? formatDate(order.completed_at) : '—'}
                  </td>
                  <td>
                    {order.invoice_number ? (
                      <a
                        className="text-action"
                        href={absoluteGatewayURL(adminInvoicePath(order.id))}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {order.invoice_number}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="endpoint-cell">{order.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-pagination spread">
            <button
              type="button"
              className="button secondary"
              disabled={offset === 0}
              onClick={() =>
                setOffset(Math.max(0, offset - topupOrdersPageSize))
              }
            >
              {t('topupOrders.prev')}
            </button>
            <span className="muted">
              {t('topupOrders.range', { first, last, total })}
            </span>
            <button
              type="button"
              className="button secondary"
              disabled={last >= total}
              onClick={() => setOffset(offset + topupOrdersPageSize)}
            >
              {t('topupOrders.next')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const officialH3Rates: RateForm[] = [
  {
    label: '2K output',
    dimensions: 'resolution=2K',
    unitPrice: '80',
    unitScale: '1',
    minimumCharge: '0',
  },
  {
    label: '768P output',
    dimensions: 'resolution=768P',
    unitPrice: '50',
    unitScale: '1',
    minimumCharge: '0',
  },
];

// Grok Imagine Video 1.5 selling tiers by output resolution, CNY minor units
// per second. xAI itself charges one flat rate per second regardless of
// resolution, so these tiers are a pricing decision, not a cost pass-through:
// a starting point an administrator adjusts. The fallback is the top tier.
const officialGrokRates: RateForm[] = [
  {
    label: '480p output',
    dimensions: 'resolution=480p',
    unitPrice: '60',
    unitScale: '1',
    minimumCharge: '0',
  },
  {
    label: '720p output',
    dimensions: 'resolution=720p',
    unitPrice: '80',
    unitScale: '1',
    minimumCharge: '0',
  },
  {
    label: '1080p output',
    dimensions: 'resolution=1080p',
    unitPrice: '120',
    unitScale: '1',
    minimumCharge: '0',
  },
];

// Where each provider publishes its own price list, for the tier editor.
const pricingReferences: Record<
  string,
  {
    href: string;
    key: 'models.pricingReferenceMinimax' | 'models.pricingReferenceXai';
  }
> = {
  minimax: {
    href: 'https://platform.minimaxi.com/docs/guides/pricing-paygo',
    key: 'models.pricingReferenceMinimax',
  },
  xai: {
    href: 'https://docs.x.ai/developers/models',
    key: 'models.pricingReferenceXai',
  },
};

function tiersNoteKey(form: ModelForm) {
  if (form.modality === 'image') return 'models.tiersNoteImage' as const;
  if (form.provider === 'minimax') return 'models.tiersNoteMinimax' as const;
  if (form.provider === 'xai') return 'models.tiersNoteXai' as const;
  return 'models.tiersNote' as const;
}

function newBinding(alias: string, endpoint: string): BindingForm {
  return {
    alias,
    endpoint,
    apiKey: '',
    status: 'active',
    weight: '1',
    configured: false,
  };
}

// GPT Image 2 is billed at one flat price per image, CNY 0.15 by default,
// regardless of size and quality: the upstream's cost spread is small next to
// the confusion a price grid causes, and the "auto" defaults would otherwise
// have to be billed at the most expensive tier. Tiers stay available for a
// model that needs them.
const flatImagePrice = '15';

const emptyModelForm: ModelForm = {
  id: '',
  displayName: '',
  provider: 'minimax',
  modality: 'video',
  upstreamModel: 'MiniMax-H3',
  profile: '',
  bindings: [newBinding('default', 'https://api.minimax.io')],
  status: 'inactive',
  billingMode: 'per_output_second',
  currency: 'CNY',
  unitPrice: '80',
  unitScale: '1',
  minimumCharge: '0',
  rates: officialH3Rates.map((rate) => ({ ...rate })),
};

function presetForm(preset: ProtocolPreset): ModelForm {
  return {
    ...emptyModelForm,
    id: preset.model_id,
    displayName: preset.display_name,
    provider: preset.name,
    modality: preset.modality === 'image' ? 'image' : 'video',
    upstreamModel: preset.upstream_model,
    billingMode:
      preset.modality === 'image' ? 'per_request' : 'per_output_second',
    bindings: [newBinding('default', preset.endpoint)],
    profile: JSON.stringify(preset.profile, null, 2),
    rates:
      preset.name === 'minimax'
        ? officialH3Rates.map((rate) => ({ ...rate }))
        : preset.name === 'xai'
          ? officialGrokRates.map((rate) => ({ ...rate }))
          : [],
    unitPrice:
      preset.name === 'minimax'
        ? '80'
        : preset.name === 'xai'
          ? '120'
          : preset.modality === 'image'
            ? flatImagePrice
            : '0',
  };
}

function ModelsPanel({
  models,
  presets,
  onSaved,
  onError,
}: {
  models: AdminModel[];
  presets: ProtocolPreset[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminModel | null>(null);
  const [form, setForm] = useState<ModelForm>(emptyModelForm);
  const [saving, setSaving] = useState(false);

  function edit(model?: AdminModel, preset?: ProtocolPreset) {
    setEditing(model ?? null);
    setForm(
      model
        ? {
            id: model.id,
            displayName: model.display_name,
            provider: model.provider,
            modality: model.modality,
            upstreamModel: model.upstream_model,
            profile: model.protocol_profile
              ? JSON.stringify(model.protocol_profile, null, 2)
              : '',
            bindings: (model.bindings ?? []).map((binding) => ({
              alias: binding.alias,
              endpoint: binding.endpoint,
              apiKey: '',
              status: binding.status,
              weight: String(binding.weight || 1),
              configured: binding.api_key_configured,
            })),
            status: model.status,
            billingMode: model.billing.mode,
            currency: model.billing.currency,
            unitPrice: String(model.billing.unit_price),
            unitScale: String(model.billing.unit_scale),
            minimumCharge: String(model.billing.minimum_charge),
            rates: (model.billing.rates ?? []).map((rate) => ({
              label: rate.label,
              dimensions: Object.entries(rate.dimensions)
                .map(([name, value]) => `${name}=${value}`)
                .join(', '),
              unitPrice: String(rate.unit_price),
              unitScale: String(rate.unit_scale),
              minimumCharge: String(rate.minimum_charge),
            })),
          }
        : preset
          ? presetForm(preset)
          : { ...emptyModelForm },
    );
    setOpen(true);
  }

  // Restoring the default clears the stored override; the gateway then serves
  // the built-in profile again.
  function restoreDefault() {
    const preset = presets.find(
      (candidate) => candidate.name === form.provider,
    );
    setForm((current) => ({
      ...current,
      profile: preset ? JSON.stringify(preset.profile, null, 2) : '',
    }));
  }

  const resetPreset = presets.find(
    (candidate) =>
      candidate.name === form.provider &&
      (candidate.modality === 'image' ? 'image' : 'video') === form.modality,
  );

  // Resetting puts the shipped preset back into the form: display name,
  // protocol profile, and the whole billing rule with its tiers. The upstream
  // side is left alone: bindings (endpoints and keys), the upstream model
  // name, and availability stay as they are. Nothing is saved until the
  // administrator submits.
  function resetToDefaults() {
    if (!resetPreset) return;
    const defaults = presetForm(resetPreset);
    setForm((current) => ({
      ...current,
      displayName: defaults.displayName,
      profile: defaults.profile,
      billingMode: defaults.billingMode,
      currency: defaults.currency,
      unitPrice: defaults.unitPrice,
      unitScale: defaults.unitScale,
      minimumCharge: defaults.minimumCharge,
      rates: defaults.rates,
    }));
  }

  function field<K extends keyof ModelForm>(key: K, value: ModelForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateBinding(index: number, key: keyof BindingForm, value: string) {
    setForm((current) => ({
      ...current,
      bindings: current.bindings.map((binding, bindingIndex) =>
        bindingIndex === index ? { ...binding, [key]: value } : binding,
      ),
    }));
  }

  function addBinding() {
    setForm((current) => ({
      ...current,
      bindings: [
        ...current.bindings,
        newBinding(`backup-${current.bindings.length}`, ''),
      ],
    }));
  }

  function removeBinding(index: number) {
    setForm((current) => ({
      ...current,
      bindings: current.bindings.filter(
        (_, bindingIndex) => bindingIndex !== index,
      ),
    }));
  }

  function updateRate(index: number, key: keyof RateForm, value: string) {
    setForm((current) => ({
      ...current,
      rates: current.rates.map((rate, rateIndex) =>
        rateIndex === index ? { ...rate, [key]: value } : rate,
      ),
    }));
  }

  function addRate() {
    setForm((current) => ({
      ...current,
      rates: [
        ...current.rates,
        {
          label: '',
          dimensions: '',
          unitPrice: '0',
          unitScale: '1',
          minimumCharge: '0',
        },
      ],
    }));
  }

  function removeRate(index: number) {
    setForm((current) => ({
      ...current,
      rates: current.rates.filter((_, rateIndex) => rateIndex !== index),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    onError('');
    try {
      await api<AdminModel>(
        `/v1/admin/models/${encodeURIComponent(form.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            id: form.id,
            display_name: form.displayName,
            provider: form.provider,
            upstream_model: form.upstreamModel,
            protocol_profile: parseProfile(form.profile),
            bindings: form.bindings.map((binding) => ({
              alias: binding.alias,
              endpoint: binding.endpoint,
              api_key: binding.apiKey || undefined,
              status: binding.status,
              weight: Number(binding.weight) || 1,
            })),
            status: form.status,
            billing: {
              mode: form.billingMode,
              currency: form.currency,
              unit_price: Number(form.unitPrice),
              unit_scale: Number(form.unitScale),
              minimum_charge: Number(form.minimumCharge),
              rates: form.rates.map((rate) => ({
                label: rate.label,
                dimensions: parseRateDimensions(rate.dimensions),
                unit_price: Number(rate.unitPrice),
                unit_scale: Number(rate.unitScale),
                minimum_charge: Number(rate.minimumCharge),
              })),
            },
          }),
        },
        true,
      );
      await onSaved();
      setOpen(false);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : t('models.errorSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel table-wrap">
      <div className="panel-heading table-heading">
        <div>
          <h2>{t('models.title')}</h2>
          <p>{t('models.note')}</p>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="button primary">
            <Plus size={16} />
            {t('models.add')}
            <ChevronDown size={15} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
              {presets.map((preset) => (
                <DropdownMenu.Item
                  className="menu-item stacked"
                  key={preset.name}
                  onSelect={() => edit(undefined, preset)}
                >
                  <b>{preset.display_name}</b>
                  <small>{preset.name}</small>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Item
                className="menu-item stacked"
                onSelect={() => edit()}
              >
                <b>{t('models.custom')}</b>
                <small>{t('models.customNote')}</small>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t('models.columnModel')}</th>
            <th>{t('models.columnEndpoint')}</th>
            <th>{t('models.columnCredential')}</th>
            <th>{t('models.columnBilling')}</th>
            <th>{t('models.columnStatus')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id}>
              <td>
                <div className="model-cell">
                  <span className="provider-icon">
                    <Cpu size={17} />
                  </span>
                  <div>
                    <b>{model.display_name}</b>
                    <small>
                      {model.id} · {model.provider}/{model.upstream_model}
                      {model.profile_customized
                        ? ` · ${t('models.customProfile')}`
                        : ''}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <span className="endpoint-cell">
                  <Server size={14} />
                  {model.endpoint
                    ? new URL(model.endpoint).host
                    : t('models.builtInEndpoint')}
                  {(model.bindings?.length ?? 0) > 1
                    ? ` ${t('models.moreBindings', { count: (model.bindings?.length ?? 1) - 1 })}`
                    : ''}
                </span>
              </td>
              <td>
                {model.provider === 'development' ? (
                  <span className="muted">
                    {t('models.credentialNotRequired')}
                  </span>
                ) : (
                  <span
                    className={`credential-state ${model.api_key_configured ? 'configured' : ''}`}
                  >
                    <KeyRound size={14} />
                    {t(
                      model.api_key_configured
                        ? 'models.credentialConfigured'
                        : 'models.credentialMissing',
                    )}
                  </span>
                )}
              </td>
              <td>
                <span className="billing-cell">
                  <CircleDollarSign size={14} />
                  {billingLabel(model.billing, model.modality)}
                </span>
              </td>
              <td>
                <span className={`status status-${model.status}`}>
                  {formatStatus(model.status)}
                </span>
              </td>
              <td>
                {model.provider === 'development' ? (
                  <span className="count-pill">{t('models.builtIn')}</span>
                ) : (
                  <button
                    className="row-action text-action"
                    onClick={() => edit(model)}
                  >
                    {t('models.configure')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content model-dialog">
            <div className="dialog-heading">
              <div>
                <Dialog.Title>
                  {editing
                    ? t('models.dialogEdit', { name: editing.display_name })
                    : t('models.dialogAdd')}
                </Dialog.Title>
                <Dialog.Description>
                  {t('models.dialogNote')}
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon-button">
                <X size={18} />
              </Dialog.Close>
            </div>
            <form className="dialog-form" onSubmit={save}>
              <div className="field-grid two">
                <label className="field">
                  <span className="field-label">{t('models.id')}</span>
                  <input
                    required
                    pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                    value={form.id}
                    disabled={Boolean(editing)}
                    onChange={(event) => field('id', event.target.value)}
                    placeholder="MiniMax-H3"
                  />
                </label>
                <label className="field">
                  <span className="field-label">{t('models.displayName')}</span>
                  <input
                    required
                    value={form.displayName}
                    onChange={(event) =>
                      field('displayName', event.target.value)
                    }
                    placeholder="MiniMax H3"
                  />
                </label>
              </div>
              <div className="field-grid two">
                <label className="field">
                  <span className="field-label">{t('models.provider')}</span>
                  <input
                    required
                    pattern="[a-z][a-z0-9_-]*"
                    value={form.provider}
                    disabled={Boolean(editing)}
                    onChange={(event) => field('provider', event.target.value)}
                    placeholder="xai"
                  />
                  <small>{t('models.providerNote')}</small>
                </label>
                <label className="field">
                  <span className="field-label">
                    {t('models.upstreamModel')}
                  </span>
                  <input
                    required
                    value={form.upstreamModel}
                    onChange={(event) =>
                      field('upstreamModel', event.target.value)
                    }
                    placeholder="grok-imagine-video-1.5"
                  />
                </label>
              </div>
              <section className="rate-editor">
                <div className="rate-editor-heading">
                  <div>
                    <h4>{t('models.bindings')}</h4>
                    <p>{t('models.bindingsNote')}</p>
                  </div>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={addBinding}
                  >
                    <Plus size={14} />
                    {t('models.addBinding')}
                  </button>
                </div>
                {form.bindings.length ? (
                  <div className="rate-stack">
                    {form.bindings.map((binding, index) => (
                      <article className="rate-card" key={index}>
                        <div className="rate-card-heading">
                          <strong>
                            {binding.alias ||
                              t('models.binding', { index: index + 1 })}
                          </strong>
                          {form.bindings.length > 1 && (
                            <button
                              type="button"
                              className="icon-button danger-icon"
                              onClick={() => removeBinding(index)}
                              aria-label={t('models.removeBinding', {
                                alias: binding.alias,
                              })}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <div className="field-grid three">
                          <label className="field">
                            <span className="field-label">
                              {t('models.alias')}
                            </span>
                            <input
                              required
                              pattern="[a-z0-9][a-z0-9_-]*"
                              value={binding.alias}
                              onChange={(event) =>
                                updateBinding(
                                  index,
                                  'alias',
                                  event.target.value,
                                )
                              }
                              placeholder="hk-relay"
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">
                              {t('models.availability')}
                            </span>
                            <select
                              value={binding.status}
                              onChange={(event) =>
                                updateBinding(
                                  index,
                                  'status',
                                  event.target.value,
                                )
                              }
                            >
                              <option value="active">
                                {t('models.statusActive')}
                              </option>
                              <option value="inactive">
                                {t('models.statusInactive')}
                              </option>
                            </select>
                          </label>
                          <label className="field">
                            <span className="field-label">
                              {t('models.weight')}
                            </span>
                            <input
                              type="number"
                              min="1"
                              max="1000"
                              required
                              value={binding.weight}
                              onChange={(event) =>
                                updateBinding(
                                  index,
                                  'weight',
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        </div>
                        <label className="field">
                          <span className="field-label">
                            {t('models.endpoint')}
                          </span>
                          <input
                            type="url"
                            required
                            value={binding.endpoint}
                            onChange={(event) =>
                              updateBinding(
                                index,
                                'endpoint',
                                event.target.value,
                              )
                            }
                          />
                          <small>{t('models.endpointNote')}</small>
                        </label>
                        <label className="field">
                          <span className="field-label">
                            {t('models.apiKey')}
                          </span>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={binding.apiKey}
                            onChange={(event) =>
                              updateBinding(index, 'apiKey', event.target.value)
                            }
                            placeholder={t(
                              binding.configured
                                ? 'models.apiKeyKeep'
                                : 'models.apiKeyRequired',
                            )}
                          />
                          <small>{t('models.apiKeyNote')}</small>
                        </label>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rate-empty">{t('models.bindingsEmpty')}</div>
                )}
              </section>
              <div className="form-section-title">
                <CircleDollarSign size={16} />
                {t('models.billing')}
              </div>
              <div className="field-grid two">
                <label className="field">
                  <span className="field-label">{t('models.billingMode')}</span>
                  <select
                    value={form.billingMode}
                    onChange={(event) =>
                      field(
                        'billingMode',
                        event.target.value as ModelBilling['mode'],
                      )
                    }
                  >
                    <option value="free">{t('models.billingFree')}</option>
                    <option value="per_request">
                      {t('models.billingPerRequest')}
                    </option>
                    <option value="per_output_second">
                      {t('models.billingPerSecond')}
                    </option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">{t('models.currency')}</span>
                  <input
                    required
                    maxLength={3}
                    value={form.currency}
                    onChange={(event) =>
                      field('currency', event.target.value.toUpperCase())
                    }
                  />
                </label>
              </div>
              <div className="field-grid three">
                <label className="field">
                  <span className="field-label">
                    {t('models.unitPriceFallback')}
                  </span>
                  <input
                    type="number"
                    min="0"
                    required
                    disabled={form.billingMode === 'free'}
                    value={form.unitPrice}
                    onChange={(event) => field('unitPrice', event.target.value)}
                  />
                  <small>{t('models.unitPriceFallbackNote')}</small>
                </label>
                <label className="field">
                  <span className="field-label">{t('models.unitScale')}</span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.unitScale}
                    onChange={(event) => field('unitScale', event.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">
                    {t('models.minimumCharge')}
                  </span>
                  <input
                    type="number"
                    min="0"
                    required
                    disabled={form.billingMode === 'free'}
                    value={form.minimumCharge}
                    onChange={(event) =>
                      field('minimumCharge', event.target.value)
                    }
                  />
                </label>
              </div>
              {form.billingMode !== 'free' && (
                <section className="rate-editor">
                  <div className="rate-editor-heading">
                    <div>
                      <h4>{t('models.tiers')}</h4>
                      <p>{t(tiersNoteKey(form))}</p>
                    </div>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={addRate}
                    >
                      <Plus size={14} />
                      {t('models.addTier')}
                    </button>
                  </div>
                  {form.rates.length ? (
                    <div className="rate-stack">
                      {form.rates.map((rate, index) => (
                        <article className="rate-card" key={index}>
                          <div className="rate-card-heading">
                            <strong>
                              {t('models.tier', { index: index + 1 })}
                            </strong>
                            <button
                              type="button"
                              className="icon-button danger-icon"
                              onClick={() => removeRate(index)}
                              aria-label={t('models.removeTier', {
                                index: index + 1,
                              })}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="field-grid two">
                            <label className="field">
                              <span className="field-label">
                                {t('models.tierLabel')}
                              </span>
                              <input
                                required
                                value={rate.label}
                                onChange={(event) =>
                                  updateRate(index, 'label', event.target.value)
                                }
                                placeholder={
                                  form.modality === 'image'
                                    ? 'High quality'
                                    : t('models.tierLabelPlaceholder')
                                }
                              />
                            </label>
                            <label className="field">
                              <span className="field-label">
                                {t('models.tierSelectors')}
                              </span>
                              <input
                                required
                                value={rate.dimensions}
                                onChange={(event) =>
                                  updateRate(
                                    index,
                                    'dimensions',
                                    event.target.value,
                                  )
                                }
                                placeholder={
                                  form.modality === 'image'
                                    ? 'quality=high, size=1536x1024'
                                    : 'resolution=2K, ratio=16:9'
                                }
                              />
                              <small>{t('models.tierSelectorsNote')}</small>
                            </label>
                          </div>
                          <div className="field-grid three">
                            <label className="field">
                              <span className="field-label">
                                {t('models.unitPrice')}
                              </span>
                              <input
                                type="number"
                                min="0"
                                required
                                value={rate.unitPrice}
                                onChange={(event) =>
                                  updateRate(
                                    index,
                                    'unitPrice',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="field">
                              <span className="field-label">
                                {t('models.unitScale')}
                              </span>
                              <input
                                type="number"
                                min="1"
                                required
                                value={rate.unitScale}
                                onChange={(event) =>
                                  updateRate(
                                    index,
                                    'unitScale',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="field">
                              <span className="field-label">
                                {t('models.minimumCharge')}
                              </span>
                              <input
                                type="number"
                                min="0"
                                required
                                value={rate.minimumCharge}
                                onChange={(event) =>
                                  updateRate(
                                    index,
                                    'minimumCharge',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rate-empty">{t('models.tiersEmpty')}</div>
                  )}
                  {pricingReferences[form.provider] && (
                    <a
                      className="pricing-reference"
                      href={pricingReferences[form.provider].href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t(pricingReferences[form.provider].key)}
                    </a>
                  )}
                </section>
              )}
              <details
                className="profile-editor"
                open={Boolean(editing?.profile_customized)}
              >
                <summary>
                  {t('models.profile')} ·{' '}
                  {t(
                    editing?.profile_customized
                      ? 'models.profileCustomized'
                      : 'models.profileDefault',
                  )}
                </summary>
                <label className="field">
                  <textarea
                    rows={16}
                    spellCheck={false}
                    value={form.profile}
                    onChange={(event) => field('profile', event.target.value)}
                    placeholder={t('models.profilePlaceholder')}
                  />
                  <small>{t('models.profileNote')}</small>
                </label>
                <button
                  className="button secondary"
                  type="button"
                  onClick={restoreDefault}
                >
                  {t('models.restoreDefault')}
                </button>
              </details>
              <label className="field">
                <span className="field-label">{t('models.availability')}</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    field('status', event.target.value as ModelForm['status'])
                  }
                >
                  <option value="inactive">{t('models.statusInactive')}</option>
                  <option value="active">
                    {t('models.availabilityActive')}
                  </option>
                </select>
              </label>
              <div className="dialog-actions">
                {editing && resetPreset && (
                  <button
                    className="button secondary reset-button"
                    type="button"
                    onClick={resetToDefaults}
                    title={t('models.resetDefaultsNote')}
                  >
                    <RotateCcw size={14} />
                    {t('models.resetDefaults')}
                  </button>
                )}
                <Dialog.Close className="button secondary" type="button">
                  {t('common.cancel')}
                </Dialog.Close>
                <button className="button primary" disabled={saving}>
                  {t(saving ? 'models.saving' : 'models.save')}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

// parseProfile sends an edited profile as JSON. An empty editor means "use the
// provider's built-in default".
function parseProfile(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(t('models.errorProfileJSON'));
  }
}

function billingLabel(billing: ModelBilling, modality?: 'image' | 'video') {
  if (billing.mode === 'free') return t('models.billingFree');
  const unit = t(
    billing.mode === 'per_request'
      ? modality === 'image'
        ? 'models.billingUnitImage'
        : 'models.billingUnitRequest'
      : 'models.billingUnitSecond',
  );
  const summary = t('models.billingSummary', {
    price: billing.unit_price,
    scale: billing.unit_scale,
    currency: billing.currency,
    unit,
  });
  return billing.rates?.length
    ? `${summary} · ${t('models.billingTiers', { count: billing.rates.length })}`
    : summary;
}

function parseRateDimensions(value: string): Record<string, string> {
  const dimensions: Record<string, string> = {};
  for (const entry of value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const separator = entry.indexOf('=');
    if (separator <= 0 || separator === entry.length - 1) {
      throw new Error(t('models.errorSelector', { entry }));
    }
    dimensions[entry.slice(0, separator).trim()] = entry
      .slice(separator + 1)
      .trim();
  }
  if (!Object.keys(dimensions).length)
    throw new Error(t('models.errorSelectorMissing'));
  return dimensions;
}

function UsersTable({
  users,
  onStatus,
  onUpdateCapabilities,
  onTopup,
}: {
  users: AdminUser[];
  onStatus: (user: AdminUser, status: Tenant['status']) => Promise<void>;
  onUpdateCapabilities: (
    user: AdminUser,
    capabilities: { image_enabled?: boolean; video_enabled?: boolean },
  ) => Promise<void>;
  onTopup: (user: AdminUser, request: CreditRequest) => Promise<void>;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [nextStatus, setNextStatus] = useState<Tenant['status']>('suspended');
  const [capabilityUser, setCapabilityUser] = useState<AdminUser | null>(null);
  const [imageEnabled, setImageEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [capBusy, setCapBusy] = useState(false);
  const [topupUser, setTopupUser] = useState<AdminUser | null>(null);

  function confirm(user: AdminUser, status: Tenant['status']) {
    setSelected(user);
    setNextStatus(status);
  }

  async function handleSaveCapabilities() {
    if (!capabilityUser) return;
    setCapBusy(true);
    try {
      await onUpdateCapabilities(capabilityUser, {
        image_enabled: imageEnabled,
        video_enabled: videoEnabled,
      });
      setCapabilityUser(null);
    } finally {
      setCapBusy(false);
    }
  }

  return (
    <section className="panel table-wrap">
      <div className="panel-heading table-heading">
        <div>
          <h2>{t('users.title')}</h2>
          <p>{t('users.note')}</p>
        </div>
        <span className="count-pill">
          {t('users.total', { count: users.length })}
        </span>
      </div>
      {users.length ? (
        <table>
          <thead>
            <tr>
              <th>{t('users.columnAccount')}</th>
              <th>{t('users.columnWorkspace')}</th>
              <th>{t('users.columnBalance')}</th>
              <th>{t('users.capabilities')}</th>
              <th>{t('users.columnRole')}</th>
              <th>{t('users.columnMembers')}</th>
              <th>{t('users.columnGenerations')}</th>
              <th>{t('users.columnAPIKeys')}</th>
              <th>{t('users.columnStatus')}</th>
              <th>{t('users.columnLastSeen')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="tenant-cell">
                    <span className="tenant-monogram">
                      {user.email.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <b>{user.email}</b>
                      <small>
                        {t('users.registered', {
                          date: formatDate(user.created_at),
                        })}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  {user.tenant.id ? (
                    <div className="tenant-cell">
                      <div>
                        <b>{user.tenant.name}</b>
                        <small>{user.tenant.slug}</small>
                      </div>
                    </div>
                  ) : (
                    <span className="muted">{t('users.noWorkspace')}</span>
                  )}
                </td>
                <td>
                  {user.tenant.id && user.balance ? (
                    <div>
                      <b>
                        {formatAmount(
                          user.balance.available,
                          user.balance.currency || 'CNY',
                        )}
                      </b>
                      {user.balance.reserved > 0 && (
                        <small
                          className="muted"
                          style={{ display: 'block', fontSize: '11px' }}
                        >
                          {t('billing.reserved')}:{' '}
                          {formatAmount(
                            user.balance.reserved,
                            user.balance.currency || 'CNY',
                          )}
                        </small>
                      )}
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <div
                    className="status-cell"
                    style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}
                  >
                    <span
                      className={`status ${user.image_enabled !== false ? 'status-active' : 'status-suspended'}`}
                    >
                      {t('users.imageCapability')}:{' '}
                      {user.image_enabled !== false
                        ? t('models.statusActive')
                        : t('models.statusInactive')}
                    </span>
                    <span
                      className={`status ${user.video_enabled !== false ? 'status-active' : 'status-suspended'}`}
                    >
                      {t('users.videoCapability')}:{' '}
                      {user.video_enabled !== false
                        ? t('models.statusActive')
                        : t('models.statusInactive')}
                    </span>
                  </div>
                </td>
                <td>{user.role ? formatStatus(user.role) : '—'}</td>
                <td>{user.tenant.id ? user.member_count : '—'}</td>
                <td>{user.generation_count}</td>
                <td>{user.api_key_count}</td>
                <td>
                  <div className="status-cell">
                    {user.tenant.id ? (
                      <span className={`status status-${user.tenant.status}`}>
                        {formatStatus(user.tenant.status)}
                      </span>
                    ) : (
                      <span className="muted">{t('users.noWorkspace')}</span>
                    )}
                    {user.status !== 'active' && (
                      <span className={`status status-${user.status}`}>
                        {t('users.accountStatus', {
                          status: formatStatus(user.status),
                        })}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  {user.last_seen_at
                    ? formatDate(user.last_seen_at)
                    : t('common.never')}
                </td>
                <td>
                  <div className="key-actions">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger
                        className="row-menu"
                        disabled={!user.tenant.id}
                      >
                        {t('users.manage')} <ChevronDown size={14} />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="menu" align="end">
                          <DropdownMenu.Item
                            className="menu-item"
                            onSelect={() => {
                              setCapabilityUser(user);
                              setImageEnabled(user.image_enabled !== false);
                              setVideoEnabled(user.video_enabled !== false);
                            }}
                          >
                            <Sliders size={15} />
                            {t('users.editCapabilities')}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="menu-item"
                            disabled={!user.tenant.id}
                            onSelect={() => setTopupUser(user)}
                          >
                            <Wallet size={15} />
                            {t('users.topup')}
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className="menu-separator" />
                          <DropdownMenu.Item
                            className="menu-item"
                            disabled={user.tenant.status === 'active'}
                            onSelect={() => confirm(user, 'active')}
                          >
                            <CirclePlay size={15} />
                            {t('users.activate')}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="menu-item"
                            disabled={user.tenant.status === 'suspended'}
                            onSelect={() => confirm(user, 'suspended')}
                          >
                            <CirclePause size={15} />
                            {t('users.suspend')}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                    <Link
                      className="row-action text-action"
                      to={`/admin/users/${encodeURIComponent(user.id)}`}
                    >
                      {t('users.inspect')}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <Users size={22} />
          <b>{t('users.emptyTitle')}</b>
          <span>{t('users.emptyNote')}</span>
        </div>
      )}

      {/* Tenant status dialog */}
      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content small">
            <div className="dialog-heading">
              <div>
                <Dialog.Title>
                  {t(
                    nextStatus === 'active'
                      ? 'users.confirmActivateTitle'
                      : 'users.confirmSuspendTitle',
                  )}
                </Dialog.Title>
                <Dialog.Description>
                  {t(
                    nextStatus === 'active'
                      ? 'users.confirmActivateDescription'
                      : 'users.confirmSuspendDescription',
                    {
                      name: selected?.tenant.name ?? '',
                      email: selected?.email ?? '',
                    },
                  )}
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon-button">
                <X size={18} />
              </Dialog.Close>
            </div>
            <div className="warning-box">
              <ShieldAlert size={18} />
              <span>{t('users.auditNote')}</span>
            </div>
            <div className="dialog-actions">
              <Dialog.Close className="button secondary">
                {t('common.cancel')}
              </Dialog.Close>
              <button
                className={`button ${nextStatus === 'active' ? 'primary' : 'danger-button'}`}
                onClick={() =>
                  selected &&
                  void onStatus(selected, nextStatus).then(() =>
                    setSelected(null),
                  )
                }
              >
                {t(
                  nextStatus === 'active'
                    ? 'users.confirmActivate'
                    : 'users.confirmSuspend',
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Capability dialog */}
      <Dialog.Root
        open={Boolean(capabilityUser)}
        onOpenChange={(open) => !open && setCapabilityUser(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content small">
            <div className="dialog-heading">
              <div>
                <Dialog.Title>
                  {t('users.dialogCapabilitiesTitle')}
                </Dialog.Title>
                <Dialog.Description>
                  {t('users.dialogCapabilitiesNote')}
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon-button">
                <X size={18} />
              </Dialog.Close>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                margin: '16px 0',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={imageEnabled}
                  onChange={(e) => setImageEnabled(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <b>{t('users.imageEnabled')}</b>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={videoEnabled}
                  onChange={(e) => setVideoEnabled(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <b>{t('users.videoEnabled')}</b>
              </label>
            </div>
            <div className="dialog-actions">
              <Dialog.Close className="button secondary">
                {t('common.cancel')}
              </Dialog.Close>
              <button
                className="button primary"
                disabled={capBusy}
                onClick={() => void handleSaveCapabilities()}
              >
                {t(
                  capBusy
                    ? 'users.savingCapabilities'
                    : 'users.saveCapabilities',
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <TopupDialog
        user={topupUser}
        open={Boolean(topupUser)}
        onOpenChange={(open) => !open && setTopupUser(null)}
        onSubmit={(request) =>
          topupUser ? onTopup(topupUser, request) : Promise.resolve()
        }
      />
    </section>
  );
}

function UserDetail() {
  const { t } = useI18n();
  const { userId = '' } = useParams();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selected, setSelected] = useState<Generation | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [topupOpen, setTopupOpen] = useState(false);
  const [capBusy, setCapBusy] = useState(false);
  const [topups, setTopups] = useState<Topup[]>([]);
  const base = `/v1/admin/users/${encodeURIComponent(userId)}`;
  const currentUserID = useRef(userId);
  const loadSequence = useRef(0);
  currentUserID.current = userId;
  const transactions = useTransactions(`${base}/transactions`, true);

  const loadData = useCallback(
    async (signal?: AbortSignal, reset = false) => {
      const sequence = ++loadSequence.current;
      if (reset) {
        setLoading(true);
        setUser(null);
        setGenerations([]);
        setTopups([]);
        setSelected(null);
        setArtifacts([]);
        setDetailsLoading(false);
        setTopupOpen(false);
        setCapBusy(false);
      }
      setError('');
      try {
        // A gateway without Stripe answers this one with an error; the rest of
        // the page does not depend on it, so it is kept out of the failure path.
        const topupList = api<{ data: Topup[] }>(
          `${base}/topups?limit=20&offset=0`,
          signal ? { signal } : {},
          true,
        ).then(
          (response) => response.data,
          () => [] as Topup[],
        );
        const [profile, jobs, topupHistory] = await Promise.all([
          api<AdminUser>(base, signal ? { signal } : {}, true),
          api<{ data: Generation[] }>(
            `${base}/generations?limit=50`,
            signal ? { signal } : {},
            true,
          ),
          topupList,
        ]);
        if (signal?.aborted || sequence !== loadSequence.current) return;
        setUser(profile);
        setGenerations(jobs.data);
        setTopups(topupHistory);
      } catch (reason) {
        if (
          signal?.aborted ||
          sequence !== loadSequence.current ||
          (reason instanceof DOMException && reason.name === 'AbortError')
        ) {
          return;
        }
        setError(
          reason instanceof Error ? reason.message : t('userDetail.errorLoad'),
        );
      } finally {
        if (!signal?.aborted && sequence === loadSequence.current) {
          setLoading(false);
        }
      }
    },
    [base, t],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal, true);
    return () => {
      controller.abort();
      loadSequence.current += 1;
    };
  }, [loadData]);

  async function toggleCapability(
    key: 'image_enabled' | 'video_enabled',
    currentValue: boolean,
  ) {
    const target = user;
    const path = target
      ? currentAdminUserPath(target.id, currentUserID.current)
      : null;
    if (!target || !path) return;
    setCapBusy(true);
    setError('');
    try {
      const updated = await api<AdminUser>(
        path,
        {
          method: 'PATCH',
          body: JSON.stringify({ [key]: !currentValue }),
        },
        true,
      );
      if (currentUserID.current === target.id) setUser(updated);
    } catch (reason) {
      if (currentUserID.current === target.id) {
        setError(
          reason instanceof Error
            ? reason.message
            : t('users.capabilitiesError'),
        );
      }
    } finally {
      if (currentUserID.current === target.id) setCapBusy(false);
    }
  }

  async function handleTopup(request: CreditRequest) {
    const target = user;
    const path = target
      ? currentAdminUserPath(target.id, currentUserID.current, '/credits')
      : null;
    if (!target || !path) {
      throw new Error(t('userDetail.errorUserChanged'));
    }
    await api(path, { method: 'POST', body: JSON.stringify(request) }, true);
    if (currentUserID.current === target.id) {
      await Promise.all([loadData(), transactions.reload()]);
    }
  }

  async function openDetails(generationOrId: Generation | string) {
    const target = user;
    const id =
      typeof generationOrId === 'string' ? generationOrId : generationOrId.id;
    const path = target
      ? currentAdminUserPath(
          target.id,
          currentUserID.current,
          `/generations/${encodeURIComponent(id)}`,
        )
      : null;
    if (!target || !path) return;
    const initial =
      typeof generationOrId === 'string'
        ? (generations.find((item) => item.id === id) ??
          ({
            id,
            status: 'queued',
            modality: 'image',
            model: '',
            created_at: '',
            updated_at: '',
            parameters: {},
          } as Generation))
        : generationOrId;
    setSelected(initial);
    setArtifacts([]);
    setDetailsLoading(true);
    setError('');
    try {
      const [details, artifactList] = await Promise.all([
        api<Generation>(path, {}, true),
        api<{ data: Artifact[] }>(`${path}/artifacts`, {}, true),
      ]);
      if (currentUserID.current !== target.id) return;
      setSelected(details);
      setGenerations((current) =>
        current.map((item) => (item.id === details.id ? details : item)),
      );
      setArtifacts(artifactList.data);
    } catch (reason) {
      if (currentUserID.current === target.id) {
        setSelected(null);
        setError(
          reason instanceof Error ? reason.message : t('tenant.errorDetails'),
        );
      }
    } finally {
      if (currentUserID.current === target.id) setDetailsLoading(false);
    }
  }

  return (
    <div className="user-detail">
      <Link className="back-link" to="/admin/users">
        <ArrowLeft size={14} />
        {t('userDetail.back')}
      </Link>
      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="panel">
          <div className="empty-state">
            <span className="loader" />
            {t('userDetail.loading')}
          </div>
        </div>
      ) : user ? (
        <>
          <div
            className="panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <b>{t('users.capabilities')}:</b>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  disabled={capBusy}
                  checked={user.image_enabled !== false}
                  onChange={() =>
                    void toggleCapability(
                      'image_enabled',
                      user.image_enabled !== false,
                    )
                  }
                  style={{ width: '16px', height: '16px' }}
                />
                <span>
                  {t('users.imageCapability')} (
                  {user.image_enabled !== false
                    ? t('models.statusActive')
                    : t('models.statusInactive')}
                  )
                </span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  disabled={capBusy}
                  checked={user.video_enabled !== false}
                  onChange={() =>
                    void toggleCapability(
                      'video_enabled',
                      user.video_enabled !== false,
                    )
                  }
                  style={{ width: '16px', height: '16px' }}
                />
                <span>
                  {t('users.videoCapability')} (
                  {user.video_enabled !== false
                    ? t('models.statusActive')
                    : t('models.statusInactive')}
                  )
                </span>
              </label>
            </div>
            {user.tenant.id && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                {user.balance && (
                  <div style={{ textAlign: 'right' }}>
                    <small
                      className="muted"
                      style={{ display: 'block', fontSize: '11px' }}
                    >
                      {t('billing.available')}
                    </small>
                    <strong
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 700,
                      }}
                    >
                      {formatAmount(
                        user.balance.available,
                        user.balance.currency || 'CNY',
                      )}
                    </strong>
                  </div>
                )}
                <button
                  type="button"
                  className="button primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onClick={() => setTopupOpen(true)}
                >
                  <Wallet size={15} />
                  {t('users.topup')}
                </button>
              </div>
            )}
          </div>
          <div className="admin-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{t('userDetail.personal')}</h2>
                  <p>{t('userDetail.personalNote')}</p>
                </div>
                <UserRound size={19} />
              </div>
              <div className="panel-body">
                <dl className="parameter-list">
                  <div>
                    <dt>{t('userDetail.email')}</dt>
                    <dd>{user.email}</dd>
                  </div>
                  <div>
                    <dt>{t('userDetail.displayName')}</dt>
                    <dd>{user.display_name}</dd>
                  </div>
                  <div>
                    <dt>{t('userDetail.userID')}</dt>
                    <dd>{user.id}</dd>
                  </div>
                  <div>
                    <dt>{t('userDetail.accountStatus')}</dt>
                    <dd>{formatStatus(user.status)}</dd>
                  </div>
                  <div>
                    <dt>{t('userDetail.role')}</dt>
                    <dd>{user.role ? formatStatus(user.role) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('userDetail.verified')}</dt>
                    <dd>
                      {user.email_verified_at
                        ? formatDay(user.email_verified_at)
                        : t('common.no')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('userDetail.registered')}</dt>
                    <dd>{formatDay(user.created_at)}</dd>
                  </div>
                  <div>
                    <dt>{t('userDetail.lastSeen')}</dt>
                    <dd>
                      {user.last_seen_at
                        ? formatDate(user.last_seen_at)
                        : t('common.never')}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{t('userDetail.workspace')}</h2>
                  <p>{t('userDetail.workspaceNote')}</p>
                </div>
                <Building2 size={19} />
              </div>
              <div className="panel-body">
                {user.tenant.id ? (
                  <dl className="parameter-list">
                    <div>
                      <dt>{t('userDetail.name')}</dt>
                      <dd>{user.tenant.name}</dd>
                    </div>
                    <div>
                      <dt>{t('userDetail.slug')}</dt>
                      <dd>{user.tenant.slug}</dd>
                    </div>
                    <div>
                      <dt>{t('userDetail.tenantID')}</dt>
                      <dd>{user.tenant.id}</dd>
                    </div>
                    <div>
                      <dt>{t('userDetail.status')}</dt>
                      <dd>{formatStatus(user.tenant.status)}</dd>
                    </div>
                    <div>
                      <dt>{t('userDetail.generations')}</dt>
                      <dd>{user.generation_count}</dd>
                    </div>
                    <div>
                      <dt>{t('userDetail.apiKeys')}</dt>
                      <dd>{user.api_key_count}</dd>
                    </div>
                    <div>
                      <dt>{t('userDetail.created')}</dt>
                      <dd>{formatDay(user.tenant.created_at)}</dd>
                    </div>
                    <div>
                      <dt>{t('userDetail.lastActivity')}</dt>
                      <dd>
                        {user.last_activity_at
                          ? formatDate(user.last_activity_at)
                          : t('common.none')}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="muted">{t('userDetail.noWorkspace')}</p>
                )}
              </div>
            </section>
          </div>
          {user.tenant.id && user.balance && (
            <section className="metric-grid" style={{ marginTop: '20px' }}>
              <article className="metric green">
                <span>{t('billing.available')}</span>
                <strong>
                  {formatAmount(
                    user.balance.available,
                    user.balance.currency || 'CNY',
                  )}
                </strong>
                <small>
                  {t(
                    user.balance.enforced
                      ? 'billing.enforcedOn'
                      : 'billing.enforcedOff',
                  )}
                </small>
              </article>
              <article className="metric blue">
                <span>{t('billing.totalCredited')}</span>
                <strong>
                  {formatAmount(
                    user.balance.credited,
                    user.balance.currency || 'CNY',
                  )}
                </strong>
                <small>{t('billing.totalCreditedNote')}</small>
              </article>
              <article className="metric amber">
                <span>{t('billing.totalSpent')}</span>
                <strong>
                  {formatAmount(
                    user.balance.spent,
                    user.balance.currency || 'CNY',
                  )}
                </strong>
                <small>{t('billing.totalSpentNote')}</small>
              </article>
              <article className="metric">
                <span>{t('billing.reserved')}</span>
                <strong>
                  {formatAmount(
                    user.balance.reserved,
                    user.balance.currency || 'CNY',
                  )}
                </strong>
                <small>{t('billing.reservedNote')}</small>
              </article>
            </section>
          )}
          <section className="panel table-wrap">
            <div className="panel-heading table-heading">
              <div>
                <h2>{t('userDetail.generations')}</h2>
                <p>{t('userDetail.generationsNote')}</p>
              </div>
              <span className="count-pill">
                {t('userDetail.loaded', { count: generations.length })}
              </span>
            </div>
            <GenerationsTable
              generations={generations}
              compact
              emptyHint={t('userDetail.generationsEmpty')}
              onSelect={openDetails}
            />
          </section>
          {topups.length > 0 && (
            <section className="panel table-wrap" style={{ marginTop: '24px' }}>
              <div className="panel-heading table-heading">
                <div>
                  <h2>{t('topupAdmin.userHistory')}</h2>
                  <p>{t('topupAdmin.userHistoryNote')}</p>
                </div>
                <CreditCard size={19} />
              </div>
              <table>
                <thead>
                  <tr>
                    <th>{t('topupAdmin.columnTime')}</th>
                    <th>{t('topupAdmin.columnAmount')}</th>
                    <th>{t('topupAdmin.columnStatus')}</th>
                    <th>{t('topupOrders.columnInvoice')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topups.map((topup) => (
                    <tr key={topup.id}>
                      <td>{formatDate(topup.created_at)}</td>
                      <td>
                        <b>{formatAmount(topup.amount, topup.currency)}</b>
                      </td>
                      <td>
                        <span
                          className={`status ${topupStatusClass(topup.status)}`}
                        >
                          {formatStatus(topup.status)}
                        </span>
                      </td>
                      <td>
                        {topup.invoice_number ? (
                          <a
                            className="text-action"
                            href={absoluteGatewayURL(
                              adminInvoicePath(topup.id),
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {topup.invoice_number}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section className="panel table-wrap" style={{ marginTop: '24px' }}>
            <div className="panel-heading table-heading">
              <div>
                <h2>{t('billing.transactions')}</h2>
                <p>{t('billing.note')}</p>
              </div>
              <span className="count-pill">
                {t('userDetail.loaded', {
                  count: transactions.transactions.length,
                })}
              </span>
            </div>
            <TransactionsTable
              transactions={transactions.transactions}
              loading={transactions.loading}
              loadingMore={transactions.loadingMore}
              error={transactions.error}
              hasMore={transactions.hasMore}
              onLoadMore={transactions.loadMore}
              onReload={transactions.reload}
              onSelectGeneration={openDetails}
            />
          </section>

          <TopupDialog
            user={user}
            open={topupOpen}
            onOpenChange={setTopupOpen}
            onSubmit={handleTopup}
          />
        </>
      ) : null}
      <GenerationDetails
        generation={selected}
        artifacts={artifacts}
        loading={detailsLoading}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
