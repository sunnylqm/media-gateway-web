// Mirrors the P1a draft API. No endpoint in this client can spend or publish.
export type Origin = 'work_scene' | 'archetype' | 'original_seed';
export type Transformation =
  | 'restage'
  | 'change_pov'
  | 'change_decision'
  | 'fill_gap'
  | 'change_rule'
  | 'transpose';
export type ChoiceField =
  | 'viewpoint'
  | 'decision'
  | 'ending'
  | 'visual_style'
  | 'camera'
  | 'time_window'
  | 'world_rule'
  | 'setting';
export type Seed = {
  id: string;
  version: number;
  origin: Origin;
  title: string;
  hook: string;
  genres: string[];
  source?: {
    work_id: string;
    edition: string;
    locator: string;
    review_id: string;
  };
  characters: string[];
  location: string;
  locked_facts: Array<{ id: string; text: string }>;
  transformations: Transformation[];
};
export type Selection = {
  turn_id: string;
  option_id: string;
  field: ChoiceField;
  value: string;
};
export type Turn = {
  id: string;
  question: string;
  field: ChoiceField;
  options: Array<{ id: string; label: string; value: string }>;
};
export type Project = {
  id: string;
  version: number;
  seed: Seed;
  transformation: Transformation;
  parent?: { project_id: string; version: number };
  pending?: Turn;
  choices: Selection[];
  // Reserved by P0, but P1a cannot produce or edit a plan.
  plan?: unknown;
};
export type StudioRecord = {
  project: Project;
  created_at: string;
  updated_at: string;
};
export type StudioResult = StudioRecord & {
  changed: boolean;
  guide_complete: boolean;
};
export type Summary = {
  id: string;
  version: number;
  seed_id: string;
  title: string;
  origin: Origin;
  transformation: Transformation;
  created_at: string;
  updated_at: string;
};
export type ProjectPage = { data: Summary[]; next_cursor?: string };
export type Discovery = {
  object: 'studio.discovery';
  language: string;
  guide_kind: string;
  planning_enabled: boolean;
  generation_enabled: boolean;
  discovery: {
    seeds: Seed[];
    familiar_count: number;
    work_scene_count: number;
    original_count: number;
  };
};
export type DiscoveryInput = {
  genres?: string[];
  exclude?: string[];
  rotation?: string;
};
export type CreateInput = {
  seed_id: string;
  seed_version: number;
  transformation: Transformation;
};
export type ForkInput = {
  source_version: number;
  transformation: Transformation;
};
export type ChoiceInput = {
  expected_version: number;
  turn_id: string;
  option_id: string;
};
export type StudioTransport = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;
