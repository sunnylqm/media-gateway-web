import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { StudioClient } from '../../lib/studio/client';
import type { CommandJournal } from '../../lib/studio/commands';
import {
  type Failure,
  failureOf,
  parseRevision,
} from '../../lib/studio/controller';
import { useProject, useStudioCopy } from '../../lib/studio/hooks';
import type { PlanningClient } from '../../lib/studio/planningClient';
import type { PlanningJournal } from '../../lib/studio/planningJournal';
import type { ProductionClient } from '../../lib/studio/productionClient';
import type { StudioRecord, Transformation } from '../../lib/studio/types';
import { CreativeBrief } from './CreativeBrief';
import { StudioNotice } from './Notice';
import { PlanningPanel, SavedPlan } from './PlanningPanel';
import { ProductionPanel } from './ProductionPanel';

type Props = { client: StudioClient; journal: CommandJournal };

type PlanningProps = {
  planningClient: PlanningClient;
  planningJournal: PlanningJournal;
  productionClient: ProductionClient;
  userID: string;
  active: boolean;
};

export function GuidedProject(props: Props & PlanningProps) {
  const { projectId = '' } = useParams();
  const [query] = useSearchParams();
  const t = useStudioCopy();
  const revision = parseRevision(query.get('revision'));
  if (Number.isNaN(revision)) {
    return (
      <section className="studio-notice" role="alert">
        <p>{t('badRevision')}</p>
        <Link to={`/app/create/projects/${encodeURIComponent(projectId)}`}>
          {t('current')}
        </Link>
      </section>
    );
  }
  return (
    <ProjectView
      {...props}
      key={`${projectId}:${revision ?? 'current'}`}
      id={projectId}
      revision={revision}
    />
  );
}

function ProjectView({
  client,
  journal,
  id,
  revision,
  planningClient,
  planningJournal,
  productionClient,
  userID,
  active,
}: Props &
  PlanningProps & {
    id: string;
    revision?: number;
  }) {
  const t = useStudioCopy();
  const { state, controller } = useProject(client, id, revision);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const { record, busy, error, conflict, complete } = state;
  const pendingID = record?.project.pending?.id;
  useEffect(() => {
    if (pendingID || complete) heading.current?.focus();
  }, [pendingID, complete]);
  const readOnly = revision !== undefined;
  const lastChoice = record?.project.choices.at(-1);
  return (
    <>
      <div className="studio-section-heading">
        <Link to="/app/create">← {t('another')}</Link>
        {readOnly ? (
          <Link to={`/app/create/projects/${encodeURIComponent(id)}`}>
            {t('current')}
          </Link>
        ) : (
          <button
            type="button"
            className="studio-text-button"
            disabled={busy}
            onClick={() => void controller.load()}
          >
            {t('refresh')}
          </button>
        )}
      </div>
      {readOnly && <p className="studio-notice">{t('historical')}</p>}
      {error && (
        <StudioNotice error={error} retry={() => void controller.load()} />
      )}
      {!record && busy && <p role="status">{t('loading')}</p>}
      {record && (
        <>
          <div className="studio-project-meta" role="status">
            <span>{t('version', { version: record.project.version })}</span>
            <span>
              {t(busy ? 'working' : 'saved', {
                count: record.project.choices.length,
              })}
            </span>
          </div>
          <div className="studio-project-grid">
            <section className="studio-play" aria-busy={busy}>
              <span className="eyebrow">
                {t(record.project.transformation)}
              </span>
              {record.project.pending && !readOnly ? (
                <>
                  <h1 ref={heading} tabIndex={-1} lang="zh-CN">
                    {record.project.pending.question}
                  </h1>
                  <div className="studio-options">
                    {record.project.pending.options.map((option) => (
                      <button
                        type="button"
                        className="studio-option"
                        key={option.id}
                        lang="zh-CN"
                        disabled={
                          busy ||
                          conflict ||
                          error === 'auth' ||
                          error === 'forbidden'
                        }
                        onClick={() => void controller.choose(option.id)}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                </>
              ) : complete ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    {t('ready')}
                  </h1>
                  <p>{t('readyHint')}</p>
                  <div className="studio-actions">
                    <Link className="button secondary" to="/app/create">
                      {t('another')}
                    </Link>
                    <Link className="studio-text-button" to="/app/video">
                      {t('freeform')}
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h1 lang="zh-CN">{record.project.seed.title}</h1>
                  <p>{t(readOnly ? 'historyHint' : 'nextHint')}</p>
                  {!readOnly && (
                    <button
                      type="button"
                      className="button primary"
                      disabled={
                        busy ||
                        conflict ||
                        error === 'auth' ||
                        error === 'forbidden'
                      }
                      onClick={() => void controller.next()}
                    >
                      {t(record.project.choices.length ? 'next' : 'first')}
                    </button>
                  )}
                  {readOnly && record.project.pending && (
                    <p>{t('readOnlyPending')}</p>
                  )}
                </>
              )}
              {lastChoice && (
                <details className="studio-lesson" key={lastChoice.turn_id}>
                  <summary>{t('lesson')}</summary>
                  <p>{t(`lesson_${lastChoice.field}`)}</p>
                  <blockquote lang="zh-CN">{lastChoice.value}</blockquote>
                  <small>{t('lessonHint')}</small>
                </details>
              )}
              {record.project.parent && (
                <p className="studio-note">
                  <Link
                    to={`/app/create/projects/${encodeURIComponent(record.project.parent.project_id)}?revision=${record.project.parent.version}`}
                  >
                    {t('parent')} ·{' '}
                    {t('version', { version: record.project.parent.version })}
                  </Link>
                </p>
              )}
            </section>
            <CreativeBrief
              key={`${id}:${record.project.version}`}
              record={record}
            />
          </div>
          <SavedPlan value={record.project.plan} />
          {!readOnly && (
            <PlanningPanel
              client={planningClient}
              journal={planningJournal}
              project={record.project}
              guideComplete={complete === true}
              blocked={busy || conflict || error !== null}
              active={active}
              refreshProject={() => controller.load()}
            />
          )}
          {!readOnly && (
            <ProductionPanel
              client={productionClient}
              userID={userID}
              project={record.project}
              blocked={busy || conflict || error !== null}
              active={active}
            />
          )}
          <History record={record} readOnly={readOnly} />
          <Fork
            key={`${id}:${record.project.version}`}
            client={client}
            journal={journal}
            record={record}
          />
        </>
      )}
    </>
  );
}

function History({
  record,
  readOnly,
}: {
  record: StudioRecord;
  readOnly: boolean;
}) {
  const t = useStudioCopy();
  const navigate = useNavigate();
  const [version, setVersion] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <details className="studio-history">
      <summary>{t('history')}</summary>
      <p>{t('historyHint')}</p>
      <form
        className="studio-actions"
        onSubmit={(event) => {
          event.preventDefault();
          const target = parseRevision(version);
          if (
            target === undefined ||
            Number.isNaN(target) ||
            (!readOnly && target > record.project.version)
          ) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          navigate(
            `/app/create/projects/${encodeURIComponent(record.project.id)}?revision=${target}`,
          );
        }}
      >
        <label className="field">
          <span>{t('historyInput')}</span>
          <input
            inputMode="numeric"
            required
            pattern="[1-9][0-9]*"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          />
        </label>
        <button type="submit" className="button secondary">
          {t('view')}
        </button>
      </form>
      {invalid && <p role="alert">{t('badRevision')}</p>}
    </details>
  );
}

function Fork({ client, journal, record }: Props & { record: StudioRecord }) {
  const t = useStudioCopy();
  const navigate = useNavigate();
  const [operation, setOperation] = useState<Transformation>(
    record.project.transformation,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const lock = useRef(false);
  const active = useRef(true);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      abort.current?.abort();
    };
  }, []);
  async function fork() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const body = {
        source_version: record.project.version,
        transformation: operation,
      };
      const ticket = journal.prepare(`fork:${record.project.id}`, body);
      const result = await client.fork(
        record.project.id,
        body,
        ticket.key,
        abort.current.signal,
      );
      if (!active.current) return;
      journal.acknowledge(ticket);
      navigate(`/app/create/projects/${encodeURIComponent(result.project.id)}`);
    } catch (reason) {
      if (active.current) setError(failureOf(reason));
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <details className="studio-history">
      <summary>{t('fork')}</summary>
      <p>{t('forkHint')}</p>
      <label className="field">
        <span>{t('transform')}</span>
        <select
          value={operation}
          disabled={busy}
          onChange={(event) =>
            setOperation(event.target.value as Transformation)
          }
        >
          {record.project.seed.transformations.map((value) => (
            <option value={value} key={value}>
              {t(value)}
            </option>
          ))}
        </select>
      </label>
      {error && <StudioNotice error={error} retry={() => void fork()} />}
      <button
        type="button"
        className="button primary"
        disabled={busy}
        onClick={() => void fork()}
      >
        {t(busy ? 'forkBusy' : 'forkAction')}
      </button>
    </details>
  );
}
