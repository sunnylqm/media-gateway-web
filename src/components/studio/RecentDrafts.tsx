import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { StudioClient } from '../../lib/studio/client';
import { type Failure, failureOf } from '../../lib/studio/controller';
import { useStudioCopy } from '../../lib/studio/hooks';
import type { ProjectPage } from '../../lib/studio/types';
import { mergeSummaries } from '../../lib/studio/view';
import { StudioNotice } from './Notice';

export function RecentDrafts({ client }: { client: StudioClient }) {
  const t = useStudioCopy();
  const [page, setPage] = useState<ProjectPage>({ data: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const pending = useRef(false);
  const epoch = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const load = useCallback(
    async (after?: string) => {
      if (pending.current) return;
      pending.current = true;
      const current = ++epoch.current;
      abort.current = new AbortController();
      setBusy(true);
      setError(null);
      try {
        const next = await client.list(after, abort.current.signal);
        if (current !== epoch.current) return;
        setPage((old) => ({
          ...next,
          data: after ? mergeSummaries(old.data, next.data) : next.data,
        }));
      } catch (reason) {
        if (current === epoch.current) setError(failureOf(reason));
      } finally {
        if (current === epoch.current) {
          pending.current = false;
          setBusy(false);
        }
      }
    },
    [client],
  );
  useEffect(() => {
    void load();
    return () => {
      epoch.current += 1;
      pending.current = false;
      abort.current?.abort();
    };
  }, [load]);
  return (
    <section className="studio-recent" aria-labelledby="studio-recent-title">
      <h2 id="studio-recent-title">{t('recent')}</h2>
      {error && (
        <StudioNotice
          error={error}
          discovery
          retry={() => void load(page.next_cursor)}
        />
      )}
      {!busy && !error && !page.data.length && <p>{t('noDrafts')}</p>}
      <div className="studio-draft-list" aria-busy={busy}>
        {page.data.map((draft) => (
          <Link
            className="studio-draft"
            to={`/app/create/projects/${encodeURIComponent(draft.id)}`}
            key={draft.id}
          >
            <strong lang="zh-CN">{draft.title}</strong>
            <span>{t(draft.transformation)}</span>
            <small>{t('version', { version: draft.version })}</small>
            <span>{t('open')} →</span>
          </Link>
        ))}
      </div>
      {busy && <p role="status">{t('loading')}</p>}
      {page.next_cursor && (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void load(page.next_cursor)}
        >
          {t('more')}
        </button>
      )}
    </section>
  );
}
