import { useState } from 'react';
import { useI18n } from '../../i18n';
import { planningCopy } from '../../lib/studio/planningCopy';
import type { StoryPlan } from '../../lib/studio/planningTypes';
import { shotPrompt } from '../../lib/studio/planView';

/** Displays text as text; no model-produced HTML, links or execution commands. */
export function PlanPreview({ plan }: { plan: StoryPlan }) {
  const { locale } = useI18n();
  const t = planningCopy(locale);
  return (
    <div className="studio-plan-preview">
      <p className="studio-note">{t('previewBoundary')}</p>
      <h3>{plan.title}</h3>
      <dl className="studio-plan-story">
        {(['goal', 'obstacle', 'decision', 'outcome'] as const).map((key) => (
          <div key={key}>
            <dt>{t(key)}</dt>
            <dd>{plan[key]}</dd>
          </div>
        ))}
      </dl>
      <details className="studio-lesson">
        <summary>{t('beats')}</summary>
        <ol>
          {plan.beats.map((beat) => <li key={beat.id}>{beat.action}</li>)}
        </ol>
      </details>
      <h4>{t('shots')}</h4>
      <p className="studio-note">{t('durationsHint')}</p>
      <div className="studio-plan-shots">
        {plan.shots.map((shot, index) => (
          <ShotPreview key={shot.id} shot={shot} index={index} plan={plan} />
        ))}
      </div>
    </div>
  );
}

function ShotPreview({ shot, index, plan }: {
  shot: StoryPlan['shots'][number];
  index: number;
  plan: StoryPlan;
}) {
  const { locale } = useI18n();
  const t = planningCopy(locale);
  const [copied, setCopied] = useState<'copied' | 'copyFailed' | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(shotPrompt(shot));
      setCopied('copied');
    } catch {
      setCopied('copyFailed');
    }
  }
  return (
    <article className="studio-plan-shot">
      <h5>{t('shot', { index: index + 1 })}</h5>
      <small>{t('durations', {
        edit: shot.edit_duration_ms / 1000,
        generation: shot.generation_duration_ms / 1000,
      })}</small>
      <p>{shot.action}</p>
      <p><b>{t('camera')}</b> · {shot.camera}</p>
      <details className="studio-lesson">
        <summary>{t('prompts')}</summary>
        <p className="studio-note">{t('provenance')}</p>
        {shot.segments.map((segment) => (
          <section key={segment.id} className="studio-plan-segment">
            <blockquote>{segment.text}</blockquote>
            {(segment.choice_turn_ids ?? []).map((id) => (
              <p key={`choice:${id}`} className="studio-note">
                <b>{t('choice')}</b> · {plan.applied_choices.find((c) => c.turn_id === id)?.value ?? id}
              </p>
            ))}
            {(segment.fact_ids ?? []).map((id) => (
              <p key={`fact:${id}`} className="studio-note">
                <b>{t('fact')}</b> · {plan.locked_facts.find((f) => f.id === id)?.text ?? id}
              </p>
            ))}
            {!segment.choice_turn_ids?.length && !segment.fact_ids?.length && (
              <p className="studio-note">{t('addition')}</p>
            )}
          </section>
        ))}
        <button type="button" className="button secondary" onClick={() => void copy()}>
          {t('copy')}
        </button>
        {copied && <p role="status">{t(copied)}</p>}
      </details>
    </article>
  );
}
