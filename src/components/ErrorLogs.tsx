import { ChevronDown, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api } from '../api';
import { translate, useI18n } from '../i18n';
import {
  type ErrorLogFilter,
  errorLogPath,
  errorLogSummary,
  splitErrorLogAttributes,
} from '../lib/errorLogs';
import type { ErrorLog, ErrorLogCounts, ErrorLogList } from '../types';

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError';
}

function failure(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : translate('errorLogs.errorLoad');
}

// The warnings and errors the gateway recorded, behind
// `GET /v1/admin/error-logs`. Like the top-up orders, the panel fetches on its
// own rather than slowing the console's start-up load.
export function ErrorLogsPanel() {
  const { t, format } = useI18n();
  const [filter, setFilter] = useState<ErrorLogFilter>({
    level: '',
    search: '',
  });
  const [draft, setDraft] = useState('');
  const [entries, setEntries] = useState<ErrorLog[]>([]);
  const [counts, setCounts] = useState<ErrorLogCounts | null>(null);
  const [cursor, setCursor] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const requestSequence = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken asks for the same filter again.
  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    api<ErrorLogList>(errorLogPath(filter), { signal: controller.signal }, true)
      .then((response) => {
        if (sequence !== requestSequence.current) return;
        setEntries(response.data ?? []);
        setCounts(response.counts ?? null);
        setCursor(response.next_cursor ?? '');
        setExpanded(null);
      })
      .catch((reason: unknown) => {
        if (sequence !== requestSequence.current || isAbortError(reason)) {
          return;
        }
        setError(failure(reason));
        setEntries([]);
        setCursor('');
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, reloadToken]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const sequence = requestSequence.current;
    setLoadingMore(true);
    try {
      const response = await api<ErrorLogList>(
        errorLogPath(filter, cursor),
        {},
        true,
      );
      if (sequence !== requestSequence.current) return;
      setEntries((current) => [...current, ...(response.data ?? [])]);
      setCursor(response.next_cursor ?? '');
    } catch (reason) {
      if (sequence === requestSequence.current) setError(failure(reason));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, filter]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    setFilter((current) => ({ ...current, search: draft.trim() }));
  }

  function showRequest(requestID: string) {
    setDraft(requestID);
    setNotice('');
    setFilter({ level: '', search: requestID });
  }

  async function clearAll() {
    setClearing(true);
    try {
      const result = await api<{ removed: number }>(
        '/v1/admin/error-logs',
        { method: 'DELETE' },
        true,
      );
      setConfirmClear(false);
      setNotice(t('errorLogs.cleared', { count: result.removed }));
      setReloadToken((token) => token + 1);
    } catch (reason) {
      setConfirmClear(false);
      setError(failure(reason));
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="panel table-wrap">
      <div className="panel-heading table-heading">
        <div>
          <h2>{t('errorLogs.title')}</h2>
          <p>{t('errorLogs.note')}</p>
        </div>
        <div className="panel-heading-side">
          {counts && (
            <>
              <span className="muted error-log-window">
                {t('errorLogs.last24h')}
              </span>
              <span className="status error-log-level-error">
                {t('errorLogs.countError', { count: counts.error })}
              </span>
              <span className="status error-log-level-warn">
                {t('errorLogs.countWarn', { count: counts.warn })}
              </span>
            </>
          )}
        </div>
      </div>
      <form className="error-log-toolbar" onSubmit={submitSearch}>
        <label className="topup-orders-filter">
          <span className="field-label">{t('errorLogs.levelLabel')}</span>
          <select
            value={filter.level}
            onChange={(event) => {
              setNotice('');
              setFilter((current) => ({
                ...current,
                level: event.target.value as ErrorLogFilter['level'],
              }));
            }}
          >
            <option value="">{t('errorLogs.levelAll')}</option>
            <option value="error">{t('errorLogs.levelError')}</option>
            <option value="warn">{t('errorLogs.levelWarn')}</option>
          </select>
        </label>
        <label className="error-log-search">
          <span className="field-label">{t('errorLogs.searchLabel')}</span>
          <input
            type="search"
            value={draft}
            maxLength={200}
            placeholder={t('errorLogs.searchPlaceholder')}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <div className="error-log-actions">
          <button type="submit" className="button secondary">
            <Search size={14} />
            {t('errorLogs.search')}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={loading}
            onClick={() => {
              setNotice('');
              setReloadToken((token) => token + 1);
            }}
          >
            <RotateCcw size={14} />
            {t('errorLogs.refresh')}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={loading || entries.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 size={14} />
            {t('errorLogs.clear')}
          </button>
        </div>
      </form>
      {error && (
        <div className="banner-error error-log-banner" role="alert">
          {error}
        </div>
      )}
      {notice && <div className="error-log-notice">{notice}</div>}
      {loading ? (
        <div className="empty-state">
          <span className="loader" />
          <span>{t('errorLogs.loading')}</span>
        </div>
      ) : entries.length === 0 ? (
        error ? null : (
          <div className="empty-state">
            <b>{t('errorLogs.empty')}</b>
            <span>{t('errorLogs.emptyNote')}</span>
          </div>
        )
      ) : (
        <>
          <table className="error-log-table">
            <thead>
              <tr>
                <th>{t('errorLogs.columnTime')}</th>
                <th>{t('errorLogs.columnLevel')}</th>
                <th>{t('errorLogs.columnMessage')}</th>
                <th>{t('errorLogs.columnRequest')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <ErrorLogRow
                  key={entry.id}
                  entry={entry}
                  open={expanded === entry.id}
                  onToggle={() =>
                    setExpanded((current) =>
                      current === entry.id ? null : entry.id,
                    )
                  }
                  onShowRequest={showRequest}
                  time={format.dateTime(entry.occurred_at)}
                />
              ))}
            </tbody>
          </table>
          {cursor && (
            <div className="table-pagination">
              <button
                type="button"
                className="button secondary"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {t('errorLogs.loadMore')}
              </button>
            </div>
          )}
        </>
      )}

      <Dialog.Root
        open={confirmClear}
        onOpenChange={(open) => !open && !clearing && setConfirmClear(false)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content small">
            <div className="dialog-heading">
              <div>
                <Dialog.Title>{t('errorLogs.clearTitle')}</Dialog.Title>
                <Dialog.Description>
                  {t('errorLogs.clearDescription')}
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon-button">
                <X size={18} />
              </Dialog.Close>
            </div>
            <div className="dialog-actions">
              <Dialog.Close className="button secondary" disabled={clearing}>
                {t('common.cancel')}
              </Dialog.Close>
              <button
                type="button"
                className="button danger-button"
                disabled={clearing}
                onClick={() => void clearAll()}
              >
                {t('errorLogs.clearConfirm')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function ErrorLogRow({
  entry,
  open,
  onToggle,
  onShowRequest,
  time,
}: {
  entry: ErrorLog;
  open: boolean;
  onToggle: () => void;
  onShowRequest: (requestID: string) => void;
  time: string;
}) {
  const { t } = useI18n();
  const summary = errorLogSummary(entry);
  const { fields, stack } = splitErrorLogAttributes(entry);
  return (
    <>
      <tr className={`error-log-row${open ? ' open' : ''}`} onClick={onToggle}>
        <td className="error-log-time">{time}</td>
        <td>
          <span className={`status error-log-level-${entry.level}`}>
            {entry.level === 'error'
              ? t('errorLogs.levelError')
              : t('errorLogs.levelWarn')}
          </span>
        </td>
        <td className="error-log-message">
          <b>{entry.message}</b>
          {summary && <small>{summary}</small>}
        </td>
        <td className="endpoint-cell">{entry.request_id || '—'}</td>
        <td>
          <button
            type="button"
            className="icon-button error-log-toggle"
            aria-expanded={open}
            aria-label={entry.message}
          >
            <ChevronDown size={16} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="error-log-detail">
          <td colSpan={5}>
            <dl>
              {entry.source && (
                <>
                  <dt>{t('errorLogs.source')}</dt>
                  <dd>
                    <code>{entry.source}</code>
                  </dd>
                </>
              )}
              {entry.request_id && (
                <>
                  <dt>{t('errorLogs.columnRequest')}</dt>
                  <dd>
                    <code>{entry.request_id}</code>{' '}
                    <button
                      type="button"
                      className="row-action text-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        onShowRequest(entry.request_id ?? '');
                      }}
                    >
                      {t('errorLogs.filterRequest')}
                    </button>
                  </dd>
                </>
              )}
              <dt>{t('errorLogs.fields')}</dt>
              <dd>
                {fields ? (
                  <pre>{JSON.stringify(fields, null, 2)}</pre>
                ) : (
                  <span className="muted">{t('errorLogs.noFields')}</span>
                )}
              </dd>
              {stack && (
                <>
                  <dt>{t('errorLogs.stack')}</dt>
                  <dd>
                    <pre>{stack}</pre>
                  </dd>
                </>
              )}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}
