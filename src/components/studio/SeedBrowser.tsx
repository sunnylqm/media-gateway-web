import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { StudioClient } from '../../lib/studio/client';
import type { CommandJournal } from '../../lib/studio/commands';
import { type Failure, failureOf } from '../../lib/studio/controller';
import { useStudioCopy, useStudioResource } from '../../lib/studio/hooks';
import type { Seed, Transformation } from '../../lib/studio/types';
import { type RouteKind, seedsForRoute } from '../../lib/studio/view';
import { StudioNotice } from './Notice';
import { RecentDrafts } from './RecentDrafts';

const genres = [
  'all',
  'wuxia',
  'fantasy',
  'time_travel',
  'military',
  'urban',
  'mystery',
] as const;
const routes: RouteKind[] = ['mixed', 'familiar', 'original'];

export function SeedBrowser({
  client,
  journal,
}: {
  client: StudioClient;
  journal: CommandJournal;
}) {
  const t = useStudioCopy();
  const navigate = useNavigate();
  const [genre, setGenre] = useState<string>('all');
  const [route, setRoute] = useState<RouteKind>('mixed');
  const [rotation, setRotation] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [operation, setOperation] = useState<Transformation | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const lock = useRef(false);
  const active = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const customiser = useRef<HTMLElement | null>(null);
  const load = useCallback(
    (signal: AbortSignal) =>
      client.discovery(
        {
          genres: genre === 'all' ? [] : [genre],
          exclude: excluded,
          rotation,
        },
        signal,
      ),
    [client, genre, excluded, rotation],
  );
  const discovery = useStudioResource(load);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (seed) customiser.current?.focus();
  }, [seed]);

  async function create() {
    if (!seed || !operation || lock.current) return;
    lock.current = true;
    setCreating(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const body = {
        seed_id: seed.id,
        seed_version: seed.version,
        transformation: operation,
      };
      const ticket = journal.prepare('create', body);
      const result = await client.create(body, ticket.key, abort.current.signal);
      if (!active.current) return;
      journal.acknowledge(ticket);
      navigate(`/app/create/projects/${encodeURIComponent(result.project.id)}`);
    } catch (reason) {
      if (active.current) setError(failureOf(reason));
    } finally {
      lock.current = false;
      if (active.current) setCreating(false);
    }
  }

  function clearSelection() {
    setSeed(null);
    setOperation(null);
    setError(null);
  }

  const cards = seedsForRoute(discovery.value?.discovery.seeds ?? [], route);
  return (
    <>
      <section className="studio-hero">
        <span className="eyebrow">{t('title')}</span>
        <h1>{t('welcome')}</h1>
        <p>{t('intro')}</p>
      </section>
      <fieldset className="studio-fieldset" disabled={creating}>
        <legend>{t('worlds')}</legend>
        <div className="studio-chips">
          {genres.map((value) => (
            <button
              type="button"
              className="studio-chip"
              aria-pressed={genre === value}
              key={value}
              onClick={() => {
                setGenre(value);
                clearSelection();
              }}
            >
              {t(value)}
            </button>
          ))}
        </div>
      </fieldset>
      <section aria-labelledby="studio-seeds-title">
        <div className="studio-section-heading">
          <h2 id="studio-seeds-title">{t('startingPoints')}</h2>
          <button
            type="button"
            className="button secondary"
            disabled={creating || discovery.busy}
            onClick={() => {
              setRotation(crypto.randomUUID());
              clearSelection();
            }}
          >
            {t('shuffle')}
          </button>
        </div>
        <div className="studio-chips" aria-label={t('startingPoints')}>
          {routes.map((value) => (
            <button
              type="button"
              className="studio-chip"
              aria-pressed={route === value}
              disabled={creating}
              key={value}
              onClick={() => {
                setRoute(value);
                clearSelection();
              }}
            >
              {t(value)}
            </button>
          ))}
        </div>
        <p className="studio-note">{t('recommendation')}</p>
        {discovery.value?.discovery.work_scene_count === 0 && (
          <p className="studio-note">{t('sources')}</p>
        )}
        {discovery.busy && <p role="status">{t('loading')}</p>}
        {discovery.error && (
          <StudioNotice error={discovery.error} discovery retry={discovery.retry} />
        )}
        <div className="studio-seeds" aria-busy={discovery.busy}>
          {cards.map((card) => (
            <article className="studio-seed" key={card.id}>
              <span className="studio-badge">{t(card.origin)}</span>
              <h3 lang={discovery.value?.language}>{card.title}</h3>
              <p lang={discovery.value?.language}>{card.hook}</p>
              <button
                type="button"
                className="button primary"
                aria-pressed={seed?.id === card.id}
                disabled={creating}
                onClick={() => {
                  setSeed(card);
                  setOperation(null);
                  setError(null);
                }}
              >
                {t('chooseSeed')} →
              </button>
              <button
                type="button"
                className="studio-text-button"
                aria-label={`${t('hide')}: ${card.title}`}
                disabled={creating || excluded.length >= 30}
                onClick={() => {
                  setExcluded((old) => [...new Set([...old, card.id])]);
                  clearSelection();
                }}
              >
                {t('hide')}
              </button>
            </article>
          ))}
        </div>
        {!discovery.busy && !discovery.error && !cards.length && (
          <p>{t('empty')}</p>
        )}
        {excluded.length > 0 && (
          <button
            type="button"
            className="studio-text-button"
            disabled={creating}
            onClick={() => {
              setExcluded([]);
              clearSelection();
            }}
          >
            {t('reset')}
          </button>
        )}
      </section>
      {seed && (
        <section
          className="studio-customiser"
          ref={customiser}
          tabIndex={-1}
          aria-labelledby="studio-customise-title"
        >
          <span className="eyebrow">{t('selected')}</span>
          <h2 id="studio-customise-title" lang="zh-CN">{seed.title}</h2>
          <p lang="zh-CN">{seed.hook}</p>
          <fieldset className="studio-fieldset" disabled={creating}>
            <legend>{t('transform')}</legend>
            <div className="studio-options">
              {seed.transformations.map((value) => (
                <button
                  type="button"
                  className="studio-option"
                  aria-pressed={operation === value}
                  key={value}
                  onClick={() => setOperation(value)}
                >
                  <strong>{t(value)}</strong>
                  <span>{t(`${value}Hint`)}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {error && <StudioNotice error={error} retry={() => void create()} />}
          {error === 'network' && <p>{t('requestPending')}</p>}
          <button
            type="button"
            className="button primary"
            disabled={!operation || creating}
            onClick={() => void create()}
          >
            {t(creating ? 'creating' : 'create')}
          </button>
        </section>
      )}
      <RecentDrafts client={client} />
    </>
  );
}
