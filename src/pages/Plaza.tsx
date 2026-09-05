import { Image as ImageIcon, Play, Sparkles, Video, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useState } from 'react';
import { absoluteGatewayURL, api } from '../api';
import { ShareToggles } from '../components/ShareToggles';
import { formatDate, formatRelativeTime } from '../format';
import { useI18n } from '../i18n';
import type { Generation, PlazaArtifact, PlazaItem, PlazaList } from '../types';

type Filter = 'all' | 'image' | 'video';

const pageSize = 24;

function primaryArtifact(item: PlazaItem): PlazaArtifact | undefined {
  return (
    item.artifacts.find((one) => one.role === 'output') ?? item.artifacts[0]
  );
}

// The plaza shows results, so a card is a picture first: the artifact fills it
// and everything else sits underneath.
function PlazaCard({
  item,
  onOpen,
}: {
  item: PlazaItem;
  onOpen: (item: PlazaItem) => void;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const artifact = primaryArtifact(item);
  const mime = artifact?.mime_type.toLowerCase() ?? '';
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const url = artifact ? absoluteGatewayURL(artifact.url) : '';

  return (
    <button type="button" className="plaza-card" onClick={() => onOpen(item)}>
      <span className="plaza-media">
        {artifact && !failed && isImage ? (
          <img
            src={url}
            loading="lazy"
            decoding="async"
            alt={t('plaza.artworkAlt', { author: item.author_name })}
            onError={() => setFailed(true)}
          />
        ) : null}
        {artifact && !failed && isVideo ? (
          <>
            {/* No controls: the poster frame is the whole point on a card. */}
            <video
              src={url}
              preload="metadata"
              muted
              playsInline
              aria-label={t('plaza.artworkAlt', { author: item.author_name })}
              onError={() => setFailed(true)}
            />
            <span className="plaza-play" aria-hidden="true">
              <Play size={14} />
            </span>
          </>
        ) : null}
        {!artifact || failed || (!isImage && !isVideo) ? (
          <span className="plaza-media-empty" aria-hidden="true">
            {item.modality === 'image' ? (
              <ImageIcon size={20} />
            ) : (
              <Video size={20} />
            )}
          </span>
        ) : null}
      </span>
      <span className="plaza-card-body">
        <span className="plaza-card-head">
          <b>{item.author_name}</b>
          <small>{formatRelativeTime(item.created_at)}</small>
        </span>
        <span className="plaza-model">{item.model}</span>
        {item.prompt ? (
          <span className="plaza-prompt clamped">{item.prompt}</span>
        ) : null}
      </span>
    </button>
  );
}

function PlazaDialog({
  item,
  viewerId,
  onClose,
  onShareChange,
}: {
  item: PlazaItem | null;
  viewerId?: string;
  onClose: () => void;
  onShareChange: (id: string, generation: Generation) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const artifact = item ? primaryArtifact(item) : undefined;
  const mime = artifact?.mime_type.toLowerCase() ?? '';
  const url = artifact ? absoluteGatewayURL(artifact.url) : '';
  const own = Boolean(
    item?.author_id && viewerId && item.author_id === viewerId,
  );

  return (
    <Dialog.Root
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open) {
          setExpanded(false);
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content detail-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{item?.author_name ?? ''}</Dialog.Title>
              <Dialog.Description>
                {item ? `${item.model} · ${formatDate(item.created_at)}` : ''}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button">
              <X size={18} />
            </Dialog.Close>
          </div>
          {item ? (
            <div className="detail-sections">
              <section>
                {artifact && mime.startsWith('video/') ? (
                  <video
                    className="artifact-video"
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={t('plaza.artworkAlt', {
                      author: item.author_name,
                    })}
                  />
                ) : null}
                {artifact && mime.startsWith('image/') ? (
                  <img
                    className="artifact-image"
                    src={url}
                    alt={t('plaza.artworkAlt', { author: item.author_name })}
                  />
                ) : null}
              </section>
              <section>
                <h3>{t('details.prompt')}</h3>
                {item.prompt ? (
                  <div className="prompt-card">
                    <p className={expanded ? '' : 'clamped'}>{item.prompt}</p>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setExpanded((value) => !value)}
                    >
                      {expanded ? t('plaza.showLess') : t('plaza.showMore')}
                    </button>
                  </div>
                ) : (
                  <p className="muted">{t('plaza.promptWithheld')}</p>
                )}
              </section>
              {own ? (
                <section>
                  <h3>{t('share.title')}</h3>
                  <ShareToggles
                    key={item.id}
                    generationId={item.id}
                    shared
                    sharedPrompt={Boolean(item.prompt)}
                    onUpdated={(generation) =>
                      onShareChange(item.id, generation)
                    }
                  />
                </section>
              ) : null}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Plaza({ viewerId }: { viewerId?: string }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<PlazaItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PlazaItem | null>(null);

  const listPath = useCallback(
    (after?: string) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filter !== 'all') params.set('modality', filter);
      if (after) params.set('after', after);
      return `/v1/plaza?${params.toString()}`;
    },
    [filter],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<PlazaList>(listPath())
      .then((page) => {
        if (!active) return;
        setItems(page.data);
        setCursor(page.next_cursor);
        setTotal(page.total);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setItems([]);
        setCursor(undefined);
        setTotal(0);
        setError(
          reason instanceof Error ? reason.message : t('plaza.errorLoad'),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listPath, t]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api<PlazaList>(listPath(cursor));
      setItems((current) => [...current, ...page.data]);
      setCursor(page.next_cursor);
      setTotal(page.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('plaza.errorLoad'));
    } finally {
      setLoadingMore(false);
    }
  }

  // The plaza is the published view, so withdrawing the work removes the card
  // rather than leaving a listing the gateway would no longer return.
  function applyShareChange(id: string, generation: Generation) {
    if (generation.shared === false) {
      setItems((current) => current.filter((one) => one.id !== id));
      setTotal((current) => Math.max(0, current - 1));
      setSelected(null);
      return;
    }
    const prompt = generation.shared_prompt ? generation.prompt : undefined;
    setItems((current) =>
      current.map((one) => (one.id === id ? { ...one, prompt } : one)),
    );
    setSelected((current) =>
      current && current.id === id ? { ...current, prompt } : current,
    );
  }

  const filters: Filter[] = ['all', 'image', 'video'];

  return (
    <section className="plaza-page">
      <div className="plaza-heading">
        <div>
          <h2>{t('plaza.title')}</h2>
          <p>{t('plaza.description')}</p>
        </div>
        <span className="plaza-total">{t('plaza.total', { total })}</span>
      </div>
      <div className="plaza-toolbar">
        <div className="segmented">
          {filters.map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'segment active' : 'segment'}
              onClick={() => setFilter(value)}
            >
              {value === 'image' ? <ImageIcon size={14} /> : null}
              {value === 'video' ? <Video size={14} /> : null}
              {t(
                value === 'all'
                  ? 'plaza.filterAll'
                  : value === 'image'
                    ? 'modality.image'
                    : 'modality.video',
              )}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="detail-loading">
          <span className="loader" />
          {t('plaza.loading')}
        </div>
      ) : items.length ? (
        <>
          <div className="plaza-grid">
            {items.map((item) => (
              <PlazaCard key={item.id} item={item} onOpen={setSelected} />
            ))}
          </div>
          {cursor ? (
            <div className="plaza-more">
              <button
                type="button"
                className="button secondary"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? t('plaza.loading') : t('plaza.loadMore')}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state">
          <Sparkles size={22} />
          <b>{t('plaza.emptyTitle')}</b>
          <span>{t('plaza.emptyHint')}</span>
        </div>
      )}
      <PlazaDialog
        item={selected}
        viewerId={viewerId}
        onClose={() => setSelected(null)}
        onShareChange={applyShareChange}
      />
    </section>
  );
}
