import type { StudioCopy } from './messages';
import type { Seed, StudioRecord, Summary } from './types';

export type RouteKind = 'mixed' | 'familiar' | 'original';
export function seedsForRoute(seeds: Seed[], route: RouteKind): Seed[] {
  return seeds.filter((seed) =>
    route === 'mixed'
      ? true
      : route === 'original'
        ? seed.origin === 'original_seed'
        : seed.origin !== 'original_seed',
  );
}

export function mergeSummaries(current: Summary[], next: Summary[]): Summary[] {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of next) rows.set(row.id, row);
  return [...rows.values()];
}

export function creativeBrief(record: StudioRecord, t: StudioCopy): string {
  const { project } = record;
  const lines = [
    t('brief'),
    project.seed.title,
    t('version', { version: project.version }),
    project.seed.hook,
    '',
    t('anchors'),
    ...project.seed.locked_facts.map((fact) => fact.text),
    '',
    t('intentions'),
    ...project.choices.map((choice) => `${t(choice.field)}: ${choice.value}`),
    '',
    t('briefFooter'),
  ];
  return lines.join('\n');
}
