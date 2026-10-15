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
 * @param {{type?: string, workout_id?: string|null, workout_type?: string|null}|null} entry
 * @returns {'cycling'|'running'|'multi'|null}
 */
export function inferEntrySport(entry) {
  if (!entry || NO_SPORT_TYPES.has(entry.type)) return null;
  if (entry.type === 'race') {
    if (RUN_RACE_TYPES.includes(entry.workout_type)) return 'running';
    if (MULTI_RACE_TYPES.includes(entry.workout_type)) return 'multi';
  }
  if (typeof entry.workout_id === 'string' && entry.workout_id.startsWith('run_')) return 'running';
  return 'cycling';
}

/** The stored sport when present and valid, else the inferred one. */
export function entrySport(entry) {
  const stored = entry?.sport;
  if (ENTRY_SPORTS.includes(stored)) return stored;
  return inferEntrySport(entry);
}
