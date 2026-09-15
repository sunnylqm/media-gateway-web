import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { gatewayURL } from '../../api';
import { useI18n } from '../../i18n';
import type { ProductionClient } from '../../lib/studio/productionClient';
import { ProductionController } from '../../lib/studio/productionController';
import {
  productionCopy,
  productionStatus,
} from '../../lib/studio/productionCopy';
import { ProductionJournal } from '../../lib/studio/productionJournal';
import {
  blocksNewRun,
  defaultParameters,
  editableParameters,
  hasActiveShots,
  quoteConsentKey,
  quoteInput,
  quoteUsable,
  type RunItem,
  type ShotArtifact,
  safeMediaURL,
  supportsExecution,
} from '../../lib/studio/productionTypes';
import type { Project } from '../../lib/studio/types';
import { PlaygroundParameter } from '../PlaygroundParameter';
import '../../styles/studio-production.css';

type Props = {
  client: ProductionClient;
  userID: string;
  project: Project;
  active: boolean;
  blocked: boolean;
};
const money = (amount: number, currency: string) =>
  `${currency} ${(amount / 100).toFixed(2)}`;

/** Only mounted for a current project. Historical snapshots remain read-only. */
export function ProductionPanel({
  client,
  userID,
  project,
  active,
  blocked,
}: Props) {
  const { locale } = useI18n();
  const t = productionCopy(locale);
  const journal = useMemo(() => {
    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      /* Read-only fallback. */
    }
    return new ProductionJournal(gatewayURL, userID, project.id, storage);
  }, [userID, project.id]);
  const controller = useMemo(
    () => new ProductionController(client, journal, project.id),
    [client, journal, project.id],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [modelID, setModelID] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirtyQuoteID, setDirtyQuoteID] = useState<string | null>(null);
  const [consent, setConsent] = useState<string | null>(null);
  const [recoverConsent, setRecoverConsent] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setConsent(null);
    setRecoverConsent(null);
    if (active) void controller.load();
    return () => controller.dispose();
  }, [controller, active]);
  const polling =
    active &&
    !state.error &&
    !state.mutation &&
    state.runs.some(hasActiveShots);
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) await controller.poll();
      if (!stopped) timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [controller, polling]);
  const offered = state.quote?.state === 'offered';
  useEffect(() => {
    if (!active || !offered) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, offered]);
  const model = state.models.find((m) => m.id === modelID);
  const quote = state.quote;
  const pending = state.pending;
  const waiting = state.runs.some(blocksNewRun);
  const locked = !active || blocked || state.busy || !!state.mutation;
  const writable = !locked && supportsExecution(state.info);
  const canQuote =
    writable &&
    !state.error &&
    !pending &&
    !waiting &&
    !!project.plan &&
    !project.pending;
  const canConfirm =
    writable &&
    !state.error &&
    !pending &&
    !waiting &&
    quoteUsable(quote, project.version, now) &&
    quote.id !== dirtyQuoteID;
  const selected = state.runs.find((r) => r.id === state.selectedID);
  const quoteKey = quote ? quoteConsentKey(quote) : '';
  const canRecover =
    writable &&
    !['auth', 'forbidden', 'storage', 'protocol', 'missing'].includes(
      state.error ?? '',
    );
  function refresh() {
    setConsent(null);
    setRecoverConsent(null);
    setSettingsError(false);
    void controller.load();
  }
  function requestQuote() {
    if (!model || !canQuote) return;
    setSettingsError(false);
    setConsent(null);
    try {
      void controller.requestQuote(
        quoteInput(project.id, project.version, model, values),
      );
    } catch {
      setSettingsError(true);
    }
  }
  async function confirm() {
    if (!canConfirm) return;
    const accepted = consent;
    setConsent(null);
    await controller.confirm(project.version, accepted);
  }
  return (
    <section
      className="studio-production"
      aria-labelledby="studio-production-title"
    >
      <div className="studio-section-heading">
        <div>
          <h2 id="studio-production-title">{t('title')}</h2>
          <p>{t('intro')}</p>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={locked}
          onClick={refresh}
        >
          {t('refresh')}
        </button>
      </div>
      {state.busy && <p role="status">{t('loading')}</p>}
      {state.error && (
        <p className="studio-notice" role="alert">
          {t(`error_${state.error}`)}
        </p>
      )}
      {settingsError && <p role="alert">{t('error_settings')}</p>}
      {state.info && !supportsExecution(state.info) && <p>{t('disabled')}</p>}
      {!project.plan && <p>{t('adopt')}</p>}
      {waiting && <p className="studio-notice">{t('blocked')}</p>}
      {supportsExecution(state.info) && (
        <fieldset
          className="studio-production-settings"
          disabled={!canQuote}
          inert={!canQuote}
        >
          <label className="field">
            <span>{t('settings')}</span>
            <select
              value={modelID}
              onChange={(e) => {
                setDirtyQuoteID(quote?.id ?? null);
                setModelID(e.target.value);
                setValues(
                  defaultParameters(
                    state.models.find((m) => m.id === e.target.value),
                  ),
                );
                setConsent(null);
              }}
            >
              <option value="">{t('choose')}</option>
              {state.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name || m.id}
                </option>
              ))}
            </select>
          </label>
          <small>{state.models.length ? t('modelHint') : t('noModels')}</small>
          {model && (
            <details>
              <summary>{t('parameters')}</summary>
              <div className="studio-production-parameters">
                {editableParameters(model).map((p) => (
                  <PlaygroundParameter
                    key={p.name}
                    param={p}
                    parameters={values}
                    setParameters={(next) => {
                      setDirtyQuoteID(quote?.id ?? null);
                      setConsent(null);
                      setValues(next);
                    }}
                  />
                ))}
              </div>
            </details>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={!model || !canQuote}
            onClick={requestQuote}
          >
            {t('quote')}
          </button>
        </fieldset>
      )}
      {pending?.kind === 'quote' && (
        <div className="studio-notice">
          <p>{t('pendingQuote')}</p>
          <small>
            {pending.body.model} · {t('version')}{' '}
            {pending.body.expected_version}
          </small>
          <button
            type="button"
            className="button secondary"
            disabled={!canRecover}
            onClick={() => void controller.retryQuote()}
          >
            {t('recoverQuote')}
          </button>
        </div>
      )}
      {quote && (
        <div className="studio-production-offer">
          <h3>
            {t('offer')}: {money(quote.max_amount, quote.currency)}
          </h3>
          <p>
            {quote.model} · {t('version')} {quote.project_version} ·{' '}
            {productionStatus(quote.state, locale)}
          </p>
          <p>
            {t('expires')}:{' '}
            <time dateTime={quote.expires_at}>
              {new Date(quote.expires_at).toLocaleString(
                locale === 'zh' ? 'zh-CN' : 'en-US',
              )}
            </time>
          </p>
          <small>{quote.id}</small>
          <details>
            <summary>{t('shots')}</summary>
            <div className="studio-production-shots">
              {quote.preview.shots.map((s, i) => (
                <article key={s.id}>
                  <h4>
                    {i + 1}. {s.id} — {money(s.estimate.amount, quote.currency)}
                  </h4>
                  <p>
                    {t('edit')}: {s.edit_duration_ms / 1000}s ·{' '}
                    {t('generation')}: {s.generation_duration_ms / 1000}s
                  </p>
                  <details>
                    <summary>{t('prompt')}</summary>
                    <pre>{s.prompt}</pre>
                  </details>
                </article>
              ))}
            </div>
          </details>
          {quote.state === 'used' ? (
            <p>{t('used')}</p>
          ) : (
            !quoteUsable(quote, project.version, now) && (
              <p role="status">{t('expired')}</p>
            )
          )}
          {quote.id === dirtyQuoteID && (
            <p role="status">{t('settingsChanged')}</p>
          )}
          <p>{t('terms')}</p>
          {!pending && quote.state !== 'used' && (
            <>
              <label className="studio-production-consent">
                <input
                  type="checkbox"
                  checked={consent === quoteKey}
                  disabled={!canConfirm}
                  onChange={(e) =>
                    setConsent(e.target.checked ? quoteKey : null)
                  }
                />
                <span>{t('consent')}</span>
              </label>
              <button
                type="button"
                className="button primary"
                disabled={!canConfirm || consent !== quoteKey}
                onClick={() => void confirm()}
              >
                {t('confirm')}
              </button>
            </>
          )}
        </div>
      )}
      {pending?.kind === 'confirm' && (
        <div className="studio-notice">
          <p role="alert">{t('pendingConfirm')}</p>
          <label className="studio-production-consent">
            <input
              type="checkbox"
              checked={recoverConsent === pending.key}
              disabled={!canRecover || !quote}
              onChange={(e) =>
                setRecoverConsent(e.target.checked ? pending.key : null)
              }
            />
            <span>{t('recoverConsent')}</span>
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={!canRecover || !quote || recoverConsent !== pending.key}
            onClick={() => {
              const agreed = recoverConsent === pending.key;
              setRecoverConsent(null);
              void controller.retryConfirmation(agreed);
            }}
          >
            {t('recoverConfirm')}
          </button>
        </div>
      )}
      {state.mutation && <p role="status">{t('submitting')}</p>}
      <h3>{t('runs')}</h3>
      <p>{t('runHint')}</p>
      {!state.runs.length && !state.busy && <p>{t('noRuns')}</p>}
      <div className="studio-production-run-list">
        {state.runs.map((r) => (
          <button
            key={r.id}
            type="button"
            className="button secondary"
            disabled={locked}
            aria-pressed={selected?.id === r.id}
            onClick={() => controller.select(r.id)}
          >
            {t('version')} {r.project_version} ·{' '}
            {productionStatus(r.state, locale)}
            <small>{r.id}</small>
          </button>
        ))}
      </div>
      {selected && (
        <div className="studio-production-shots" key={selected.id}>
          <p role="status">
            {productionStatus(selected.state, locale)} · {t('max')}:{' '}
            {money(selected.max_amount, selected.currency)}
          </p>
          {selected.items.map((item) => (
            <article key={item.generation_id}>
              <h4>
                {item.shot_id} · {productionStatus(item.status, locale)}
              </h4>
              <p>
                {t('max')}: {money(item.max_amount, selected.currency)} ·{' '}
                {item.final_amount === undefined
                  ? t('unknown')
                  : `${t('final')}: ${money(item.final_amount, selected.currency)}`}
              </p>
              <small>
                {productionStatus(item.billing_status, locale)} ·{' '}
                {item.generation_id}
              </small>
              {item.status === 'completed' && (
                <ClipResult client={client} item={item} active={active} />
              )}
            </article>
          ))}
        </div>
      )}
      <p className="studio-note">{t('privacy')}</p>
    </section>
  );
}

function ClipResult({
  client,
  item,
  active,
}: {
  client: ProductionClient;
  item: RunItem;
  active: boolean;
}) {
  const { locale } = useI18n();
  const t = productionCopy(locale);
  const [clips, setClips] = useState<ShotArtifact[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = useRef({
    epoch: 0,
    busy: false,
    active,
    abort: new AbortController(),
  });
  useEffect(() => {
    guard.current.active = active;
    setBusy(false);
    guard.current.busy = false;
    return () => {
      guard.current.active = false;
      guard.current.epoch++;
      guard.current.abort.abort();
    };
  }, [active]);
  async function load() {
    const g = guard.current;
    if (!g.active || g.busy) return;
    g.busy = true;
    g.abort = new AbortController();
    const epoch = ++g.epoch;
    setBusy(true);
    setError(false);
    try {
      const result = await client.artifacts(item.generation_id, g.abort.signal);
      if (g.active && epoch === g.epoch) setClips(result);
    } catch {
      if (g.active && epoch === g.epoch) setError(true);
    } finally {
      if (g.active && epoch === g.epoch) {
        g.busy = false;
        setBusy(false);
      }
    }
  }
  const playable = clips?.flatMap((clip) => {
    const url = safeMediaURL(clip.url, gatewayURL);
    return url ? [{ ...clip, url }] : [];
  });
  return (
    <div className="studio-production-result">
      <button
        type="button"
        className="button secondary"
        disabled={!active || busy}
        onClick={() => void load()}
      >
        {t('footage')}
      </button>
      {error && <p role="alert">{t('mediaError')}</p>}
      {playable?.length === 0 && <p>{t('noMedia')}</p>}
      {playable?.map((clip) => (
        <div key={clip.id}>
          <video
            controls
            playsInline
            preload="none"
            src={active ? clip.url : undefined}
            aria-label={item.shot_id}
          />
          <a href={clip.url} target="_blank" rel="noopener noreferrer">
            {t('openMedia')}
          </a>
        </div>
      ))}
    </div>
  );
}
