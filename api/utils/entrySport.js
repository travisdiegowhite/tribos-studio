/**
 * The sport of a calendar entry (multisport phase 3).
 *
 * calendar_entries.sport (migration 134) is the source of truth. This module
 * infers it for rows written before the column existed, or by a writer that
 * does not set it, using the same rules as the migration's backfill — minus
 * the plan join, which a row alone cannot see. Pure: importable from src/.
 *
 * Race types mirror src/utils/raceTypes.js (sport: 'run' / 'multi').
 */

export const ENTRY_SPORTS = ['cycling', 'running', 'multi', 'other'];

export const RUN_RACE_TYPES = ['run_5k', 'run_10k', 'half_marathon', 'marathon', 'trail_run', 'ultra_run'];
export const MULTI_RACE_TYPES = ['triathlon', 'duathlon'];

/** Rest days and notes have no sport. */
const NO_SPORT_TYPES = new Set(['rest', 'note']);

/**
 * Strength, core and mobility work is sport 'other'. It is not a ride or a
 * run, so it must neither block a ride day (calendarOccupancy) nor be matched
 * to a completed ride (useActivityAutoLink). Until 2026-10 it inferred as
 * 'cycling', which skipped the coach's gym sessions on every ride day.
 * Categories and id prefixes are the workout library's (getSupplementType).
 */
export const STRENGTH_WORKOUT_TYPES = ['strength', 'core', 'flexibility', 'mobility', 'yoga'];
const STRENGTH_ID_PREFIXES = ['strength_', 'core_', 'flexibility_'];

/** Whether a session is gym / mobility work rather than a ride or a run. */
export function isStrengthSession(entry) {
  if (!entry) return false;
  if (STRENGTH_WORKOUT_TYPES.includes(entry.workout_type)) return true;
  const id = entry.workout_id;
  return typeof id === 'string' && STRENGTH_ID_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * The sport a plan-generated workout gets: 'other' for its strength and
 * mobility days, otherwise the plan's own sport.
 */
export function planSessionSport(draft, planSport) {
  return isStrengthSession(draft) ? 'other' : planSport;
}

/**
 * @param {{type?: string, workout_id?: string|null, workout_type?: string|null}|null} entry
 * @returns {'cycling'|'running'|'multi'|'other'|null}
 */
export function inferEntrySport(entry) {
  if (!entry || NO_SPORT_TYPES.has(entry.type)) return null;
  if (entry.type === 'race') {
    if (RUN_RACE_TYPES.includes(entry.workout_type)) return 'running';
    if (MULTI_RACE_TYPES.includes(entry.workout_type)) return 'multi';
  }
  if (isStrengthSession(entry)) return 'other';
  if (typeof entry.workout_id === 'string' && entry.workout_id.startsWith('run_')) return 'running';
  return 'cycling';
}

/** The stored sport when present and valid, else the inferred one. */
export function entrySport(entry) {
  const stored = entry?.sport;
  if (ENTRY_SPORTS.includes(stored)) return stored;
  return inferEntrySport(entry);
}
