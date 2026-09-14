// Mirrors media-gateway's P1c text-planning API, not media-generation jobs.
export type PlanningState =
  | 'queued'
  | 'running'
  | 'ready'
  | 'failed'
  | 'interrupted'
  | 'canceled'
  | 'stale'
  | 'accepted';

export type StoryPlan = {
  project_version: number;
  title: string;
  goal: string;
  obstacle: string;
  decision: string;
  outcome: string;
  locked_facts: Array<{ id: string; text: string }>;
  applied_choices: Array<{
    turn_id: string;
    option_id: string;
    field: string;
    value: string;
  }>;
  beats: Array<{
    id: string;
    kind: string;
    action: string;
    depends_on: string[];
  }>;
  shots: Array<{
    id: string;
    beat_ids: string[];
    characters: string[];
    location: string;
    action: string;
    camera: string;
    edit_duration_ms: number;
    generation_duration_ms: number;
    segments: Array<{
      id: string;
      text: string;
      choice_turn_ids: string[];
      fact_ids: string[];
    }>;
  }>;
};

export type PlanningProfile = {
  id: string;
  model: string;
  prompt_version: string;
  max_completion_tokens: number;
  limits: {
    min_shots: number;
    max_shots: number;
    max_clip_ms: number;
    max_total_ms: number;
  };
};
export type PlanningInfo = {
  enabled: boolean;
  generation_enabled: boolean;
  billing_mode: string;
  confirmation_required: boolean;
  max_tasks_per_24h: number;
  profile?: PlanningProfile;
};
export type PlanningTask = {
  id: string;
  project_id: string;
  input_version: number;
  state: PlanningState;
  profile: PlanningProfile;
  plan?: StoryPlan;
  usage: {
    known: boolean;
    prompt_tokens: number;
    completion_tokens: number;
  };
  error_code?: string;
  accepted_version?: number;
  created_at: string;
  updated_at: string;
};
export type PlanningRequest = {
  project_id: string;
  expected_version: number;
  confirm_text_generation: true;
};
export type PlanningReceipt = { task: PlanningTask; changed: boolean };

export function activePlanningTask(task: PlanningTask): boolean {
  return task.state === 'queued' || task.state === 'running';
}

// Unknown billing contracts fail closed: this UI only authorizes the P1c pilot.
export function supportedPlanning(info: PlanningInfo | null): boolean {
  return !!(
    info?.enabled &&
    info.billing_mode === 'operator_funded' &&
    info.confirmation_required === true &&
    info.profile?.id &&
    info.profile.model
  );
}

export function canAcceptPlan(task: PlanningTask, version: number): boolean {
  return (
    task.state === 'ready' &&
    task.input_version === version &&
    task.plan?.project_version === version
  );
}
