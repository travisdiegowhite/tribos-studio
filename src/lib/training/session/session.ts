/**
 * session — the one model of a training session the training surfaces draw.
 *
 * WHY THIS EXISTS. Each training screen used to rebuild "a session" from a
 * raw calendar row with its own rules: the calendar cell had no shape and its
 * own load estimate, the workout modal was told every entry's sport was null
 * and drew runs as rides, Today drew a single block from a type→intensity
 * table, and nothing compared a done session with its plan. Fixing one surface
 * left the others wrong. `resolveSession` is now the only place a row becomes
 * something to show: its sport, its structure in sport-native steps, its
 * planned and actual numbers, and how the two compare.
 *
 * Pure: no I/O. Pass the row as the calendar readers hand it back (legacy
 * field names, `toPlannedWorkoutShape`) or as a raw calendar_entries row.
 */

import type { WorkoutDefinition } from '../../../types/training';
import { resolvePlannedWorkoutShape, entrySportOf, type ShapeSource } from '../plannedWorkoutShape';
import { complianceFor, type Compliance } from './compliance';
import { normalizeSport, type Sport } from './sportCopy';
import { fitSteps, stepsFromRunningStructure, stepsFromStructure, stepsLoad, stepsMinutes, type SessionStep } from './steps';

export type SessionKind = 'workout' | 'race' | 'rest' | 'note';

/** The fields of a calendar row this reads, in either the legacy or the raw shape. */
export interface SessionRow {
  id?: string | null;
  // date
  scheduled_date?: string | null;
  date?: string | null;
  slot?: number | null;
  // kind
  entry_type?: string | null;
  type?: string | null;
  // what
  name?: string | null;
  title?: string | null;
  workout_id?: string | null;
  workout_type?: string | null;
  sport?: string | null;
  notes?: string | null;
  details?: Record<string, unknown> | null;
  // planned
  target_duration?: number | null;
  target_duration_min?: number | null;
  target_distance_km?: number | null;
  target_rss?: number | null;
  target_tss?: number | null;
  target_load?: number | null;
  // actual
  actual_duration?: number | null;
  actual_duration_min?: number | null;
  actual_distance_km?: number | null;
  actual_rss?: number | null;
  actual_tss?: number | null;
  actual_load?: number | null;
  activity_id?: string | null;
  status?: string | null;
  completed?: boolean | null;
}

export interface SessionNumbers {
  durationMin: number | null;
  distanceKm: number | null;
  load: number | null;
}

export interface Session {
  id: string | null;
  date: string | null;
  slot: number;
  kind: SessionKind;
  sport: Sport | null;
  title: string;
  workoutType: string | null;
  /** Where the structure came from; null when the session has none (rest, gym, note). */
  source: ShapeSource | null;
  /** One sentence when the structure is not the athlete's own prescription. */
  sourceNote: string | null;
  steps: SessionStep[];
  /** The library workout's text — shown only when the structure IS that workout. */
  description: string | null;
  coachNotes: string | null;
  notes: string | null;
  /** details.timing — a two-a-day's order cue. */
  timing: string | null;
  planned: SessionNumbers;
  actual: (SessionNumbers & { activityId: string | null }) | null;
  status: string;
  compliance: Compliance;
  /** The resolved workout definition, for exporters and legacy components. */
  workout: WorkoutDefinition | null;
}

export interface ResolveSessionOptions {
  /** Today in the athlete's calendar, YYYY-MM-DD (for missed vs upcoming). */
  today: string;
  /** Threshold pace, sec/km — turns a run's distance reps into minutes. */
  thresholdPaceSec?: number | null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

function kindOf(row: SessionRow): SessionKind {
  const t = (row.entry_type ?? row.type ?? 'workout') as string;
  return t === 'race' || t === 'rest' || t === 'note' ? t : 'workout';
}

export function resolveSession(row: SessionRow, opts: ResolveSessionOptions): Session {
  const kind = kindOf(row);
  const date = row.scheduled_date ?? row.date ?? null;
  const sport = kind === 'rest' || kind === 'note' ? null : normalizeSport(entrySportOf(row as never));

  const plannedDuration = num(row.target_duration ?? row.target_duration_min);
  const planned: SessionNumbers = {
    durationMin: plannedDuration,
    distanceKm: num(row.target_distance_km),
    load: num(row.target_rss ?? row.target_tss ?? row.target_load),
  };

  const actualNumbers: SessionNumbers = {
    durationMin: num(row.actual_duration ?? row.actual_duration_min),
    distanceKm: num(row.actual_distance_km),
    load: num(row.actual_rss ?? row.actual_tss ?? row.actual_load),
  };
  const hasActual = !!row.activity_id || Object.values(actualNumbers).some((v) => v != null);
  const actual = hasActual ? { ...actualNumbers, activityId: row.activity_id ?? null } : null;

  const status = row.status ?? (row.completed ? 'done' : 'planned');
  const details = row.details && typeof row.details === 'object' ? row.details : null;
  const timing = typeof details?.timing === 'string' ? (details.timing as string) : null;

  let shape = null as ReturnType<typeof resolvePlannedWorkoutShape>;
  let steps: SessionStep[] = [];
  if (kind === 'workout') {
    shape = resolvePlannedWorkoutShape({
      id: row.id,
      workout_id: row.workout_id,
      workout_type: row.workout_type,
      name: row.name ?? row.title,
      target_duration: plannedDuration,
      target_load: planned.load,
      notes: row.notes,
      details,
      sport: row.sport,
    });
    const workout = shape?.workout;
    if (workout && shape?.source) {
      if (sport === 'running' && workout.runningStructure && shape.source === 'library') {
        steps = fitSteps(stepsFromRunningStructure(workout.runningStructure, opts.thresholdPaceSec), plannedDuration);
      } else {
        steps = stepsFromStructure(workout.structure, sport);
      }
    }
  }

  // Fill a missing planned length / load from the structure, so a session
  // with a shape always has numbers to compare against.
  if (steps.length > 0) {
    planned.durationMin ??= Math.round(stepsMinutes(steps));
    planned.load ??= stepsLoad(steps);
  }

  const libraryText = shape?.source === 'library';
  return {
    id: row.id ?? null,
    date,
    slot: row.slot ?? 0,
    kind,
    sport,
    title: (row.name ?? row.title ?? shape?.workout.name ?? '').trim() || (kind === 'rest' ? 'Rest' : 'Session'),
    workoutType: row.workout_type ?? null,
    source: shape?.source ?? null,
    sourceNote: shape?.note ?? null,
    steps,
    description: libraryText ? shape?.workout.description || null : null,
    coachNotes: libraryText ? shape?.workout.coachNotes || null : null,
    notes: row.notes ?? null,
    timing,
    planned,
    actual,
    status,
    compliance:
      kind === 'rest' || kind === 'note'
        ? { band: 'upcoming', ratio: null, basis: null }
        : complianceFor({ planned, actual: actualNumbers, status, date, today: opts.today }),
    workout: shape?.workout ?? null,
  };
}
