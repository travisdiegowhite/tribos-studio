/**
 * customWorkoutRow — resolving a workout that isn't in our library.
 *
 * A rider whose coach prescribes their training has workouts we've never heard
 * of. Every resolution path in the app was library-only (`getAnyWorkoutById` is
 * two static maps), so those workouts either vanished — `useUpcomingPlannedWorkouts`
 * skipped any row it couldn't resolve — or reached route generation stripped of
 * the terrain and interval requirements that make a route fit the session.
 *
 * A coach's workout lives in `workout_templates`, a table that already existed
 * with the right shape and RLS ("Users manage own templates", auth.uid() =
 * user_id) and an unused `planned_workouts.template_id` FK pointing at it. The
 * structure sits in its `intervals` JSONB, with the routing hints alongside.
 * Scheduling the same session twice points two dated rows at one template
 * rather than duplicating a blob.
 *
 * Read paths embed the template through that FK
 * (`select('*, workout_templates(*)')`), so a custom workout resolves from data
 * already in memory — no global registry, and no need to make the two dozen
 * synchronous library lookups async.
 */

import type {
  TrainingZone,
  WorkoutDefinition,
  WorkoutStructure,
} from '../types/training';

/** Marks a workout id as rider-authored rather than a library key. */
export const CUSTOM_WORKOUT_PREFIX = 'custom:';

export function isCustomWorkoutId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(CUSTOM_WORKOUT_PREFIX);
}

/** A stable id for a newly authored workout. */
export function newCustomWorkoutId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return `${CUSTOM_WORKOUT_PREFIX}${rand}`;
}

/**
 * What the parser stores in `workout_templates.intervals`. Kept deliberately
 * small: the interval structure plus the few fields that steer routing.
 */
export interface StoredWorkoutStructure {
  structure: WorkoutStructure;
  terrainType?: 'flat' | 'rolling' | 'hilly' | null;
  focusArea?: string | null;
  intensityFactor?: number | null;
}

/** A `workout_templates` row, in the shape these helpers read. */
export interface WorkoutTemplateRowLike {
  id?: string;
  name?: string | null;
  description?: string | null;
  workout_type?: string | null;
  duration_minutes?: number | null;
  difficulty_level?: number | null;
  expected_tss?: number | null;
  expected_if?: number | null;
  /** The parsed structure plus routing hints. */
  intervals?: unknown;
}

/**
 * A `planned_workouts` row with its template embedded. PostgREST returns the
 * embed as an object for a to-one FK, but some clients surface it as a
 * single-element array — both shapes are accepted.
 */
export interface PlannedWorkoutRowLike {
  id?: string;
  workout_id?: string | null;
  workout_type?: string | null;
  name?: string | null;
  description?: string | null;
  notes?: string | null;
  duration_minutes?: number | null;
  target_duration?: number | null;
  target_rss?: number | null;
  target_tss?: number | null;
  template_id?: string | null;
  workout_templates?: WorkoutTemplateRowLike | WorkoutTemplateRowLike[] | null;
}

/** The embedded template on a planned row, normalized across embed shapes. */
export function templateOf(
  row: PlannedWorkoutRowLike | null | undefined,
): WorkoutTemplateRowLike | null {
  const embed = row?.workout_templates;
  if (!embed) return null;
  const template = Array.isArray(embed) ? embed[0] : embed;
  return template ?? null;
}

const ZONES: TrainingZone[] = [1, 2, 3, 3.5, 4, 5, 6, 7];

function asZone(value: unknown): TrainingZone | null {
  return ZONES.includes(value as TrainingZone) ? (value as TrainingZone) : null;
}

function asMinutes(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Validate and normalize a stored structure. Returns null rather than a
 * half-built object — a partial structure would produce confidently wrong
 * routing implications, which is worse than none.
 */
export function parseStoredStructure(raw: unknown): StoredWorkoutStructure | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const structure = obj.structure as WorkoutStructure | undefined;
  if (!structure || typeof structure !== 'object') return null;
  if (!Array.isArray((structure as { main?: unknown }).main)) return null;

  const terrain = obj.terrainType;
  return {
    structure: {
      warmup: (structure.warmup ?? null) as WorkoutStructure['warmup'],
      main: structure.main,
      cooldown: (structure.cooldown ?? null) as WorkoutStructure['cooldown'],
    },
    terrainType:
      terrain === 'flat' || terrain === 'rolling' || terrain === 'hilly' ? terrain : null,
    focusArea: typeof obj.focusArea === 'string' ? obj.focusArea : null,
    intensityFactor: Number.isFinite(Number(obj.intensityFactor))
      ? Number(obj.intensityFactor)
      : null,
  };
}

/** Total minutes implied by a structure, for when the row has no duration. */
export function durationFromStructure(structure: WorkoutStructure): number {
  let total = asMinutes(structure.warmup?.duration) + asMinutes(structure.cooldown?.duration);
  for (const node of structure.main ?? []) {
    if (node && (node as { type?: string }).type === 'repeat') {
      const block = node as {
        sets?: number;
        work?: { duration?: number } | Array<{ duration?: number }>;
        rest?: { duration?: number };
      };
      const sets = Number(block.sets) > 0 ? Number(block.sets) : 1;
      const work = Array.isArray(block.work)
        ? block.work.reduce((sum, w) => sum + asMinutes(w?.duration), 0)
        : asMinutes(block.work?.duration);
      total += sets * (work + asMinutes(block.rest?.duration));
    } else {
      total += asMinutes((node as { duration?: number })?.duration);
    }
  }
  return Math.round(total);
}

/**
 * Build a `WorkoutDefinition` from a planned row's embedded template.
 * Returns null when there is no usable structure — callers fall back to the
 * library lookup, and the row keeps its previous handling.
 */
export function workoutDefinitionFromRow(
  row: PlannedWorkoutRowLike | null | undefined,
): WorkoutDefinition | null {
  const template = templateOf(row);
  const stored = parseStoredStructure(template?.intervals);
  if (!stored) return null;

  const duration =
    row?.duration_minutes ||
    (row?.target_duration != null ? Math.round(Number(row.target_duration) / 60) : 0) ||
    template?.duration_minutes ||
    durationFromStructure(stored.structure);

  return {
    // Identify by the template, so the same coach session scheduled twice
    // resolves to one workout rather than two.
    id: `${CUSTOM_WORKOUT_PREFIX}${template?.id ?? row?.workout_id ?? 'unknown'}`,
    name: row?.name || template?.name || 'Coach workout',
    category: (row?.workout_type ||
      template?.workout_type ||
      'endurance') as WorkoutDefinition['category'],
    difficulty: 'moderate' as WorkoutDefinition['difficulty'],
    duration,
    targetTSS: row?.target_rss ?? row?.target_tss ?? template?.expected_tss ?? 0,
    intensityFactor: stored.intensityFactor ?? template?.expected_if ?? 0,
    description: row?.description || template?.description || '',
    focusArea: (stored.focusArea || '') as WorkoutDefinition['focusArea'],
    tags: ['custom'],
    terrainType: (stored.terrainType || 'rolling') as WorkoutDefinition['terrainType'],
    structure: stored.structure,
    coachNotes: row?.notes || '',
  } as WorkoutDefinition;
}

export { asZone };
