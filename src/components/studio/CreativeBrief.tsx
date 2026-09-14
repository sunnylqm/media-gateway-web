import { useState } from 'react';
import { useStudioCopy } from '../../lib/studio/hooks';
import type { StudioRecord } from '../../lib/studio/types';
import { creativeBrief } from '../../lib/studio/view';

export function CreativeBrief({ record }: { record: StudioRecord }) {
  const t = useStudioCopy();
  const { project } = record;
  const [copyState, setCopyState] = useState<'copied' | 'copyFailed' | null>(
    null,
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(creativeBrief(record, t));
      setCopyState('copied');
    } catch {
      setCopyState('copyFailed');
    }
  }
  return (
    <aside className="studio-brief" aria-labelledby="studio-brief-title">
      <span className="eyebrow">{t('brief')}</span>
      <h2 id="studio-brief-title" lang="zh-CN">
        {project.seed.title}
      </h2>
      <p lang="zh-CN">{project.seed.hook}</p>
      <span className="studio-badge">{t(project.seed.origin)}</span>
      {project.seed.source && (
        <p className="studio-note" lang="zh-CN">
          {project.seed.source.edition} · {project.seed.source.locator}
        </p>
      )}
      <h3>{t('anchors')}</h3>
      <ul lang="zh-CN">
        {project.seed.locked_facts.map((fact) => (
          <li key={fact.id}>{fact.text}</li>
        ))}
      </ul>
      <h3>{t('choices')}</h3>
      {!project.choices.length && <p>{t('noChoices')}</p>}
      <div className="studio-choice-history">
        {project.choices.map((choice) => (
          <details key={choice.turn_id}>
            <summary>{t(choice.field)}</summary>
            <p lang="zh-CN">{choice.value}</p>
            <small>{t(`lesson_${choice.field}`)}</small>
          </details>
        ))}
      </div>
      <p className="studio-note">{t('briefFooter')}</p>
      <button
        type="button"
        className="button secondary"
        onClick={() => void copy()}
      >
        {t('copy')}
      </button>
      {copyState && <p role="status">{t(copyState)}</p>}
    </aside>
  );
}
