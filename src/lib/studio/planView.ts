import type { StoryPlan } from './planningTypes';

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const textFields = (v: Record<string, unknown>, fields: string[]) =>
  fields.every((key) => typeof v[key] === 'string');
const strings = (v: unknown) =>
  v == null ||
  (Array.isArray(v) && v.every((item) => typeof item === 'string'));

/** Rendering guard only. The server owns structural and authorization checks. */
export function readStoryPlan(value: unknown): StoryPlan | null {
  if (
    !object(value) ||
    !Number.isSafeInteger(value.project_version) ||
    !textFields(value, ['title', 'goal', 'obstacle', 'decision', 'outcome']) ||
    !Array.isArray(value.locked_facts) ||
    !Array.isArray(value.applied_choices) ||
    !Array.isArray(value.beats) ||
    !Array.isArray(value.shots) ||
    value.shots.length > 12
  ) {
    return null;
  }
  if (
    !value.locked_facts.every(
      (f) => object(f) && textFields(f, ['id', 'text']),
    ) ||
    !value.applied_choices.every(
      (c) =>
        object(c) && textFields(c, ['turn_id', 'option_id', 'field', 'value']),
    ) ||
    !value.beats.every(
      (b) => object(b) && textFields(b, ['id', 'kind', 'action']),
    ) ||
    !value.shots.every(
      (s) =>
        object(s) &&
        textFields(s, ['id', 'location', 'action', 'camera']) &&
        Number.isSafeInteger(s.edit_duration_ms) &&
        Number.isSafeInteger(s.generation_duration_ms) &&
        Array.isArray(s.segments) &&
        s.segments.length <= 12 &&
        s.segments.every(
          (p) =>
            object(p) &&
            textFields(p, ['id', 'text']) &&
            strings(p.choice_turn_ids) &&
            strings(p.fact_ids),
        ),
    )
  ) {
    return null;
  }
  return value as unknown as StoryPlan;
}

export function shotPrompt(shot: StoryPlan['shots'][number]): string {
  return shot.segments.map((segment) => segment.text).join('\n\n');
}
