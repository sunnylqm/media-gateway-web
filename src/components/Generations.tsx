import { Download, Eye, Image, Sparkles, Video, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { absoluteGatewayURL } from '../api';
import {
  formatBytes,
  formatDate,
  formatParameterName,
  formatParameterValue,
  formatStatus,
} from '../format';
import { useI18n } from '../i18n';
import type { Artifact, Generation } from '../types';

export function GenerationsTable({
  generations,
  compact = false,
  emptyHint,
  onSelect,
}: {
  generations: Generation[];
  compact?: boolean;
  emptyHint?: string;
  onSelect: (generation: Generation) => void;
}) {
  const { t } = useI18n();
  if (!generations.length)
    return (
      <div className="empty-state">
        <Sparkles size={22} />
        <b>{t('generations.emptyTitle')}</b>
        <span>{emptyHint ?? t('generations.emptyHint')}</span>
      </div>
    );
  return (
    <div className={compact ? 'table-wrap compact-table' : 'panel table-wrap'}>
      <table>
        <thead>
          <tr>
            <th>{t('generations.columnJob')}</th>
            <th>{t('generations.columnType')}</th>
            <th>{t('generations.columnModel')}</th>
            <th>{t('generations.columnStatus')}</th>
            <th>{t('generations.columnCreated')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {generations.map((item) => (
            <tr key={item.id}>
              <td>
                <code>{item.id.slice(0, 18)}…</code>
              </td>
              <td>
                <span className="type-cell">
                  {item.modality === 'image' ? (
                    <Image size={15} />
                  ) : (
                    <Video size={15} />
                  )}
                  {t(`modality.${item.modality}`)}
                </span>
              </td>
              <td>{item.model}</td>
              <td>
                <GenerationStatus value={item.status} />
              </td>
              <td>{formatDate(item.created_at)}</td>
              <td>
                <button
                  className="row-action"
                  onClick={() => onSelect(item)}
                  aria-label={t('generations.view', { id: item.id })}
                >
                  <Eye size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GenerationStatus({ value }: { value: string }) {
  return (
    <span className={`status status-${value}`}>{formatStatus(value)}</span>
  );
}

export function GenerationDetails({
  generation,
  artifacts,
  loading,
  onClose,
}: {
  generation: Generation | null;
  artifacts: Artifact[];
  loading: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const parameters = Object.entries(generation?.parameters ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return (
    <Dialog.Root
      open={Boolean(generation)}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content detail-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{t('details.title')}</Dialog.Title>
              <Dialog.Description>
                {generation
                  ? `${generation.id} · ${formatStatus(generation.status)}${generation.binding_alias ? ` · ${t('details.via', { alias: generation.binding_alias })}` : ''}`
                  : ''}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button">
              <X size={18} />
            </Dialog.Close>
          </div>
          {loading ? (
            <div className="detail-loading">
              <span className="loader" />
              {t('details.loading')}
            </div>
          ) : (
            <div className="detail-sections">
              <section>
                <h3>{t('details.input')}</h3>
                <div className="prompt-card">
                  <span>{t('details.prompt')}</span>
                  <p>{generation?.prompt || t('details.noPrompt')}</p>
                </div>
                {generation?.inputs?.length ? (
                  <div className="input-list">
                    {generation.inputs.map((input) => (
                      <InputPreview
                        key={`${input.asset_id}-${input.role}`}
                        input={input}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
              <section>
                <h3>{t('details.parameters')}</h3>
                {parameters.length ? (
                  <dl className="parameter-list">
                    {parameters.map(([name, value]) => (
                      <div key={name}>
                        <dt>{formatParameterName(name)}</dt>
                        <dd>{formatParameterValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="muted">{t('details.noParameters')}</p>
                )}
              </section>
              <section>
                <h3>{t('details.result')}</h3>
                {artifacts.length ? (
                  <div className="artifact-list">
                    {artifacts.map((artifact) => (
                      <ArtifactPreview key={artifact.id} artifact={artifact} />
                    ))}
                  </div>
                ) : (
                  <p className="muted">{t('details.noArtifact')}</p>
                )}
              </section>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InputPreview({
  input,
}: {
  input: NonNullable<Generation['inputs']>[number];
}) {
  const { t } = useI18n();
  const mediaType = input.mime_type.split('/', 1)[0];
  const url = absoluteGatewayURL(input.url);
  return (
    <article className="input-card">
      {mediaType === 'image' ? (
        <a className="input-media" href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            loading="lazy"
            alt={t('details.inputAlt', {
              role: formatParameterName(input.role),
            })}
          />
        </a>
      ) : null}
      {mediaType === 'video' ? (
        <video
          className="input-media"
          src={url}
          controls
          playsInline
          preload="metadata"
        />
      ) : null}
      {mediaType === 'audio' ? (
        <audio src={url} controls preload="metadata" />
      ) : null}
      <div>
        <span>{formatParameterName(input.role)}</span>
        <small>
          {input.mime_type} · {formatBytes(input.size_bytes)}
        </small>
      </div>
    </article>
  );
}

function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  const { t } = useI18n();
  const [previewFailed, setPreviewFailed] = useState(false);
  const isVideo = artifact.mime_type.toLowerCase().startsWith('video/');
  const url = absoluteGatewayURL(artifact.url);
  return (
    <article className="artifact-card">
      {isVideo && !previewFailed ? (
        <video
          className="artifact-video"
          controls
          playsInline
          preload="metadata"
          src={url}
          aria-label={t('details.videoPreview')}
          onError={() => setPreviewFailed(true)}
        />
      ) : null}
      {isVideo && previewFailed ? (
        <div className="artifact-preview-error">
          <Video size={20} />
          <span>{t('details.previewFailed')}</span>
        </div>
      ) : null}
      <div className="artifact-meta">
        <div>
          <span>{artifact.mime_type}</span>
          <small>{formatBytes(artifact.size_bytes)}</small>
        </div>
        <a href={url} download target="_blank" rel="noreferrer">
          <Download size={16} />
          {t('details.download')}
        </a>
      </div>
    </article>
  );
}
