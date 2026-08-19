import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { Download, Eye, Image, Sparkles, Video, X } from 'lucide-react';
import { formatBytes, formatDate, formatParameterName, formatParameterValue } from '../format';
import type { Artifact, Generation } from '../types';

export function GenerationsTable({
  generations,
  compact = false,
  emptyHint = 'Create the first job to see the gateway in motion.',
  onSelect,
}: {
  generations: Generation[];
  compact?: boolean;
  emptyHint?: string;
  onSelect: (generation: Generation) => void;
}) {
  if (!generations.length) return <div className="empty-state"><Sparkles size={22} /><b>No generations yet</b><span>{emptyHint}</span></div>;
  return <div className={compact ? 'table-wrap compact-table' : 'panel table-wrap'}><table><thead><tr><th>Job</th><th>Type</th><th>Model</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>{generations.map((item) => <tr key={item.id}><td><code>{item.id.slice(0, 18)}…</code></td><td><span className="type-cell">{item.modality === 'image' ? <Image size={15} /> : <Video size={15} />}{item.modality}</span></td><td>{item.model}</td><td><GenerationStatus value={item.status} /></td><td>{formatDate(item.created_at)}</td><td><button className="row-action" onClick={() => onSelect(item)} aria-label={`View ${item.id}`}><Eye size={15} /></button></td></tr>)}</tbody></table></div>;
}

export function GenerationStatus({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value.replaceAll('_', ' ')}</span>;
}

export function GenerationDetails({ generation, artifacts, loading, onClose }: { generation: Generation | null; artifacts: Artifact[]; loading: boolean; onClose: () => void }) {
  const parameters = Object.entries(generation?.parameters ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return <Dialog.Root open={Boolean(generation)} onOpenChange={(open) => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content detail-dialog"><div className="dialog-heading"><div><Dialog.Title>Generation details</Dialog.Title><Dialog.Description>{generation ? `${generation.id} · ${generation.status.replaceAll('_', ' ')}${generation.binding_alias ? ` · via ${generation.binding_alias}` : ''}` : ''}</Dialog.Description></div><Dialog.Close className="icon-button"><X size={18} /></Dialog.Close></div>{loading ? <div className="detail-loading"><span className="loader" />Loading generation details…</div> : <div className="detail-sections"><section><h3>Input</h3><div className="prompt-card"><span>Prompt</span><p>{generation?.prompt || 'No prompt was recorded.'}</p></div>{generation?.inputs?.length ? <div className="input-list">{generation.inputs.map((input) => <InputPreview key={`${input.asset_id}-${input.role}`} input={input} />)}</div> : null}</section><section><h3>Parameters</h3>{parameters.length ? <dl className="parameter-list">{parameters.map(([name, value]) => <div key={name}><dt>{formatParameterName(name)}</dt><dd>{formatParameterValue(value)}</dd></div>)}</dl> : <p className="muted">No additional parameters were recorded.</p>}</section><section><h3>Result</h3>{artifacts.length ? <div className="artifact-list">{artifacts.map((artifact) => <ArtifactPreview key={artifact.id} artifact={artifact} />)}</div> : <p className="muted">No artifact has been stored yet.</p>}</section></div>}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function InputPreview({ input }: { input: NonNullable<Generation['inputs']>[number] }) {
  const mediaType = input.mime_type.split('/', 1)[0];
  return <article className="input-card">
    {mediaType === 'image' ? <a className="input-media" href={input.url} target="_blank" rel="noreferrer"><img src={input.url} loading="lazy" alt={`${formatParameterName(input.role)} input`} /></a> : null}
    {mediaType === 'video' ? <video className="input-media" src={input.url} controls playsInline preload="metadata" /> : null}
    {mediaType === 'audio' ? <audio src={input.url} controls preload="metadata" /> : null}
    <div><span>{formatParameterName(input.role)}</span><small>{input.mime_type} · {formatBytes(input.size_bytes)}</small></div>
  </article>;
}

function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const isVideo = artifact.mime_type.toLowerCase().startsWith('video/');
  return <article className="artifact-card">
    {isVideo && !previewFailed ? <video className="artifact-video" controls playsInline preload="metadata" src={artifact.url} aria-label="Generated video preview" onError={() => setPreviewFailed(true)} /> : null}
    {isVideo && previewFailed ? <div className="artifact-preview-error"><Video size={20} /><span>The preview could not be loaded. You can still download the result.</span></div> : null}
    <div className="artifact-meta"><div><span>{artifact.mime_type}</span><small>{formatBytes(artifact.size_bytes)}</small></div><a href={artifact.url} download target="_blank" rel="noreferrer"><Download size={16} />Download</a></div>
  </article>;
}
