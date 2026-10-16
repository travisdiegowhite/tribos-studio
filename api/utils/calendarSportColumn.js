/**
 * Fail-soft use of calendar_entries.sport (migration 134).
 *
 * Migrations are applied by hand. `sport` sits in the SELECT list every
 * calendar read shares, so if 134 has not been applied, adding it naively
 * would break the athlete's whole calendar, the coach's context and activity
 * matching at once. Every read and write that touches the column goes through
 * these wrappers: on a missing-column error they retry without it and stop
 * asking for the rest of the process (or page) lifetime. Readers then still
 * emit a sport, inferred by entrySport.js.
 *
 * Built on the generic optionalColumn.js; these names are kept because the
 * calendar modules on both sides import them.
 */

import { optionalColumn } from './optionalColumn.js';

const sportColumn = optionalColumn('calendar_entries', 'sport');

/** True for PostgREST's "calendar_entries has no sport column" errors. */
export const isMissingSportColumnError = sportColumn.isMissingError;

export const sportColumnAvailable = sportColumn.available;

/** Test hook. */
export const resetSportColumnFallback = sportColumn.reset;

/** A comma-separated column list without `sport`. */
export const stripSportColumn = sportColumn.stripColumn;

/** A row or array of rows without `sport`. */
export const stripSportField = sportColumn.stripField;

/**
 * Run a read with `columns`; if the sport column is missing, rerun it without.
 * @template R
 * @param {string} columns
 * @param {(columns: string) => PromiseLike<R>} run
 * @returns {Promise<R>}
 */
export function selectWithSportFallback(columns, run) {
  return sportColumn.select(columns, run);
}

/**
 * Run a write with `payload`; if the sport column is missing, rerun it without.
 * @template P, R
 * @param {P} payload
 * @param {(payload: P) => PromiseLike<R>} run
 * @returns {Promise<R>}
 */
export function writeWithSportFallback(payload, run) {
  return sportColumn.write(payload, run);
}
