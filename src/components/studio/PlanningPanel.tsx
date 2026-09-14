import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useI18n } from '../../i18n';
import type { PlanningClient } from '../../lib/studio/planningClient';
import { PlanningController } from '../../lib/studio/planningController';
import { planningCopy } from '../../lib/studio/planningCopy';
import type { PlanningJournal } from '../../lib/studio/planningJournal';
import {
  activePlanningTask,
  canAcceptPlan,
  supportedPlanning,
} from '../../lib/studio/planningTypes';
import { readStoryPlan } from '../../lib/studio/planView';
import type { Project } from '../../lib/studio/types';
import { PlanPreview } from './PlanPreview';
import '../../styles/studio-planning.css';

type Props = {
  client: PlanningClient;
  journal: PlanningJournal;
  project: Project;
  guideComplete: boolean;
  blocked: boolean;
  active: boolean;
  refreshProject: () => Promise<void>;
};

/** Historical rendering never reads live tasks or exposes a planning mutation. */
export function SavedPlan({ value }: { value: unknown }) {
  const { locale } = useI18n();
  const t = planningCopy(locale);
  const plan = readStoryPlan(value);
  if (!value) return null;
  return (
    <details className="studio-history">
      <summary>{t('savedPlan')}</summary>
      {plan ? <PlanPreview plan={plan} /> : <p>{t('unreadable')}</p>}
    </details>
  );
}

export function PlanningPanel({
  client, journal, project, guideComplete, blocked, active, refreshProject,
}: Props) {
  const { locale } = useI18n();
  const t = planningCopy(locale);
  const controller = useMemo(
    () => new PlanningController(client, journal, project.id),
    [client, journal, project.id],
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [consent, setConsent] = useState<string | null>(null);
  const [acceptConsent, setAcceptConsent] = useState<string | null>(null);
  const [cancelID, setCancelID] = useState<string | null>(null);
  useEffect(() => {
    if (active) void controller.load();
    return () => controller.dispose();
  }, [controller, active]);
  useEffect(() => {
    if (!active || !controller.shouldPoll()) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (document.hidden) {
        timer = setTimeout(tick, 3000);
      } else {
        void controller.poll();
      }
    };
    timer = setTimeout(tick, 3000);
    return () => clearTimeout(timer);
  }, [controller, state, active]);

  const selected = state.tasks.find((task) => task.id === state.selectedID);
  const plan = readStoryPlan(selected?.plan);
  const inFlight = state.tasks.some(activePlanningTask);
  const version = state.pending?.body.expected_version ?? project.version;
  const consentKey = `${version}:${state.info?.profile?.id}:${state.pending?.key ?? 'new'}`;
  const acceptKey = `${selected?.id}:${selected?.input_version}:${project.version}`;
  const unavailable =
    !active || blocked || state.busy || !!state.mutation ||
    !supportedPlanning(state.info) ||
    state.error !== null;
  const submissionUnavailable = unavailable && !(
    state.pending && ['network', 'rate'].includes(state.error ?? '') &&
    active && !blocked && !state.busy && !state.mutation && supportedPlanning(state.info)
  );
  const guideReady = !project.pending && (guideComplete || !!project.plan);
  const canStart = state.pending ? true : guideReady && !inFlight;

  async function refresh() {
    setConsent(null);
    setAcceptConsent(null);
    await Promise.all([controller.load(), refreshProject()]);
  }
  async function generate() {
    const confirmed = consent === consentKey;
    setConsent(null);
    if (state.pending) {
      await controller.retrySubmission(confirmed);
    } else if (guideReady) {
      await controller.enqueue(project.version, confirmed);
    }
  }
  async function adopt() {
    if (!selected) return;
    const confirmed = acceptConsent === acceptKey;
    setAcceptConsent(null);
    const receipt = await controller.accept(selected.id, project.version, confirmed);
    if (receipt) await refreshProject();
  }
  async function cancel() {
    if (!selected || cancelID !== selected.id) return;
    setCancelID(null);
    await controller.cancel(selected.id, true);
  }

  return (
    <section className="studio-planning" aria-labelledby="studio-planning-title">
      <div className="studio-section-heading">
        <div>
          <h2 id="studio-planning-title">{t('title')}</h2>
          <p>{t('intro')}</p>
        </div>
        <button type="button" className="button secondary"
          disabled={!active || state.busy || !!state.mutation}
          onClick={() => void refresh()}>{t('refresh')}</button>
      </div>
      {state.busy && <p role="status">{t('loading')}</p>}
      {state.error && <p className="studio-notice" role="alert">{t(state.error)}</p>}
      {state.info && !state.info.enabled && <p>{t('disabled')}</p>}
      {state.info?.enabled && !supportedPlanning(state.info) && <p>{t('unsupported')}</p>}
      {supportedPlanning(state.info) && (
        <div className="studio-plan-confirm">
          <p>{t('terms')}</p>
          <p className="studio-note">{t('model', {
            model: state.info?.profile?.model ?? '',
            limit: state.info?.max_tasks_per_24h ?? 0,
          })}</p>
          {state.pending && (
            <div className="studio-notice" role="status">
              <p>{t('uncertain')}</p>
              <p>{t('recoveredVersion', { version })}</p>
            </div>
          )}
          {!guideReady && !state.pending && <p>{t('finish')}</p>}
          {inFlight && <p role="status">{t('queueHint')}</p>}
          <label className="studio-plan-consent">
            <input type="checkbox" checked={consent === consentKey}
              disabled={submissionUnavailable || !canStart}
              onChange={(event) => setConsent(event.target.checked ? consentKey : null)} />
            <span>{t('confirm', { version })}</span>
          </label>
          <button type="button" className="button primary"
            disabled={submissionUnavailable || !canStart || consent !== consentKey}
            onClick={() => void generate()}>{t(state.pending ? 'recover' : 'generate')}</button>
        </div>
      )}
      {state.mutation && <p role="status">{t('working')}</p>}
      {state.info?.enabled && !state.tasks.length && !state.busy && !state.error && <p>{t('noTasks')}</p>}
      {state.tasks.length > 0 && (
        <>
          <h3>{t('proposals')}</h3>
          <div className="studio-plan-task-list">
            {state.tasks.map((task) => (
              <button type="button" key={task.id} className="studio-plan-task"
                aria-pressed={task.id === selected?.id} disabled={!!state.mutation}
                onClick={() => {
                  controller.select(task.id);
                  setAcceptConsent(null);
                  setCancelID(null);
                }}>
                <strong>{t(`state_${task.state}`)}</strong>
                <span>{t('version', { version: task.input_version })}</span>
                <small>{task.plan?.title ?? task.id}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {selected && (
        <div className="studio-plan-detail">
          <p role="status"><b>{t(`state_${selected.state}`)}</b> · {t('version', { version: selected.input_version })}</p>
          {activePlanningTask(selected) && <p>{t('queueHint')}</p>}
          {selected.state !== 'accepted' && selected.input_version !== project.version && <p className="studio-notice">{t('stale')}</p>}
          {selected.state === 'accepted' && (
            <div className="studio-notice" role="status">
              <p>{t('acceptedVersion', { version: selected.accepted_version ?? '' })}</p>
              <button type="button" className="button secondary" disabled={blocked || !active}
                onClick={() => void refreshProject()}>{t('readDraft')}</button>
            </div>
          )}
          {['failed', 'interrupted', 'stale', 'canceled'].includes(selected.state) && <p>{t('taskFailure')}</p>}
          {selected.error_code && <p className="studio-note">{t('code', { code: selected.error_code })}</p>}
          <p className="studio-note">{selected.usage.known ? t('usage', {
            input: selected.usage.prompt_tokens, output: selected.usage.completion_tokens,
          }) : t('unknownUsage')}</p>
          {plan && <PlanPreview key={selected.id} plan={plan} />}
          {plan && canAcceptPlan(selected, project.version) && (
            <div className="studio-plan-confirm">
              <label className="studio-plan-consent">
                <input type="checkbox" checked={acceptConsent === acceptKey} disabled={unavailable}
                  onChange={(event) => setAcceptConsent(event.target.checked ? acceptKey : null)} />
                <span>{t('acceptConfirm', { version: project.version })}</span>
              </label>
              <button type="button" className="button primary"
                disabled={unavailable || acceptConsent !== acceptKey}
                onClick={() => void adopt()}>{t('accept')}</button>
            </div>
          )}
          {(activePlanningTask(selected) || selected.state === 'ready') && (
            <div className="studio-plan-cancel">
              {cancelID === selected.id ? (
                <>
                  <p role="alert">{t('cancelConfirm')}</p>
                  <button type="button" className="button secondary" disabled={unavailable}
                    onClick={() => void cancel()}>{t('cancelAction')}</button>{' '}
                  <button type="button" className="studio-text-button"
                    onClick={() => setCancelID(null)}>{t('keep')}</button>
                </>
              ) : (
                <button type="button" className="studio-text-button" disabled={unavailable}
                  onClick={() => setCancelID(selected.id)}>{t('cancel')}</button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
