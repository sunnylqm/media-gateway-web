import { Eye } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { formatAmount, formatDate, formatStatus } from '../format';
import { useI18n } from '../i18n';
import { transactionKind, transactionPageSize } from '../lib/billing';
import type { TransactionRecord } from '../types';

type TransactionFeed = {
  transactions: TransactionRecord[];
  loading: boolean;
  loadingMore: boolean;
  error: string;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
};

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError';
}

export function useTransactions(path: string, admin = false): TransactionFeed {
  const { t } = useI18n();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const requestSequence = useRef(0);

  const loadPage = useCallback(
    async (offset: number, replace: boolean, signal?: AbortSignal) => {
      const sequence = replace
        ? ++requestSequence.current
        : requestSequence.current;
      if (replace) {
        setLoading(true);
        setLoadingMore(false);
      } else {
        setLoadingMore(true);
      }
      setError('');
      try {
        const separator = path.includes('?') ? '&' : '?';
        const response = await api<{ data: TransactionRecord[] }>(
          `${path}${separator}limit=${transactionPageSize}&offset=${offset}`,
          signal ? { signal } : {},
          admin,
        );
        if (signal?.aborted || sequence !== requestSequence.current) return;
        setTransactions((current) =>
          replace ? response.data : [...current, ...response.data],
        );
        setHasMore(response.data.length === transactionPageSize);
      } catch (reason) {
        if (
          signal?.aborted ||
          sequence !== requestSequence.current ||
          isAbortError(reason)
        ) {
          return;
        }
        setError(
          reason instanceof Error
            ? reason.message
            : t('billing.errorTransactions'),
        );
      } finally {
        if (!signal?.aborted && sequence === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [admin, path, t],
  );

  useEffect(() => {
    const controller = new AbortController();
    setTransactions([]);
    setHasMore(false);
    if (path) {
      void loadPage(0, true, controller.signal);
    } else {
      setLoading(false);
    }
    return () => {
      controller.abort();
      requestSequence.current += 1;
    };
  }, [loadPage, path]);

  const reload = useCallback(() => loadPage(0, true), [loadPage]);
  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    await loadPage(transactions.length, false);
  }, [hasMore, loadPage, loading, loadingMore, transactions.length]);

  return {
    transactions,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reload,
  };
}

export function TransactionsTable({
  transactions,
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  onReload,
  onSelectGeneration,
}: {
  transactions: TransactionRecord[];
  loading: boolean;
  loadingMore: boolean;
  error: string;
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
  onReload: () => Promise<void>;
  onSelectGeneration?: (generationId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <>
      {error && (
        <div className="banner-error transaction-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="button secondary"
            disabled={loading}
            onClick={() => void onReload()}
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <span className="loader" />
        </div>
      ) : transactions.length > 0 ? (
        <>
          <table>
            <thead>
              <tr>
                <th>{t('billing.columnTime')}</th>
                <th>{t('billing.columnType')}</th>
                <th>{t('billing.columnAmount')}</th>
                <th>{t('billing.columnDetails')}</th>
                {onSelectGeneration && <th />}
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const kind = transactionKind(transaction.type);
                const statusClass =
                  kind === 'credit'
                    ? 'status-active'
                    : kind === 'capture'
                      ? 'status-submitted'
                      : 'status-suspended';
                const typeLabel =
                  kind === 'credit'
                    ? t('billing.typeCredit')
                    : kind === 'capture'
                      ? t('billing.typeCapture')
                      : formatStatus(transaction.type);
                const prompt = transaction.prompt
                  ? transaction.prompt.length > 35
                    ? `${transaction.prompt.slice(0, 35)}…`
                    : transaction.prompt
                  : '';
                return (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.created_at)}</td>
                    <td>
                      <span className={`status ${statusClass}`}>
                        {typeLabel}
                      </span>
                    </td>
                    <td>
                      <b>
                        {kind === 'credit' && transaction.amount >= 0
                          ? '+'
                          : ''}
                        {formatAmount(transaction.amount, transaction.currency)}
                      </b>
                    </td>
                    <td>
                      <div>
                        {transaction.reason && (
                          <span>{transaction.reason}</span>
                        )}
                        {transaction.generation_id && onSelectGeneration ? (
                          <button
                            type="button"
                            className="transaction-task-link"
                            onClick={() =>
                              onSelectGeneration(transaction.generation_id!)
                            }
                            title={t('billing.viewTask')}
                          >
                            <small className="transaction-model">
                              {t('billing.modelLabel')}:{' '}
                              {transaction.model || transaction.generation_id}{' '}
                              {prompt ? `· ${prompt}` : ''}
                            </small>
                          </button>
                        ) : (
                          transaction.model && (
                            <small className="transaction-model">
                              {t('billing.modelLabel')}: {transaction.model}{' '}
                              {prompt ? `· ${prompt}` : ''}
                            </small>
                          )
                        )}
                      </div>
                    </td>
                    {onSelectGeneration && (
                      <td>
                        {transaction.generation_id ? (
                          <button
                            type="button"
                            className="row-action"
                            onClick={() =>
                              onSelectGeneration(transaction.generation_id!)
                            }
                            title={t('billing.viewTask')}
                            aria-label={t('billing.viewTask')}
                          >
                            <Eye size={15} />
                          </button>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore && (
            <div className="table-pagination">
              <button
                type="button"
                className="button secondary"
                disabled={loadingMore}
                onClick={() => void onLoadMore()}
              >
                {t(loadingMore ? 'billing.loadingMore' : 'billing.loadMore')}
              </button>
            </div>
          )}
        </>
      ) : error ? null : (
        <div className="empty-state">
          <b>{t('billing.emptyTransactions')}</b>
          <p>{t('billing.emptyTransactionsNote')}</p>
        </div>
      )}
    </>
  );
}
