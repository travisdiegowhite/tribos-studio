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
 * Pure (no Supabase import): shared by api/ and src/ callers, each passing its
 * own query.
 */

let sportColumnMissing = false;

/** True for PostgREST's "calendar_entries has no sport column" errors. */
export function isMissingSportColumnError(error) {
  const msg = String(error?.message || '');
  return (
    /calendar_entries\.sport\b|'sport' column/.test(msg) &&
    /(does not exist|schema cache|Could not find)/i.test(msg)
  );
}

export function sportColumnAvailable() {
  return !sportColumnMissing;
}

/** Test hook. */
export function resetSportColumnFallback() {
  sportColumnMissing = false;
}

/** A comma-separated column list without `sport`. */
export function stripSportColumn(columns) {
  return columns
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== 'sport')
    .join(', ');
}

/** A row or array of rows without `sport`. */
export function stripSportField(payload) {
  const strip = (row) => {
    if (!row || typeof row !== 'object' || !('sport' in row)) return row;
    const { sport: _sport, ...rest } = row;
    return rest;
  };
  return Array.isArray(payload) ? payload.map(strip) : strip(payload);
}

function noteMissing(error, where) {
  if (sportColumnMissing) return;
  sportColumnMissing = true;
  console.warn(
    `[calendar] calendar_entries.sport missing (${where}) — apply migration 134. Falling back without it.`,
    error?.message,
  );
}

/**
 * Run a read with `columns`; if the sport column is missing, rerun it without.
 * @template R
 * @param {string} columns
 * @param {(columns: string) => PromiseLike<R>} run
 * @returns {Promise<R>}
 */
export async function selectWithSportFallback(columns, run) {
  if (sportColumnMissing) return run(stripSportColumn(columns));
  const result = await run(columns);
  const error = /** @type {any} */ (result)?.error;
  if (error && isMissingSportColumnError(error)) {
    noteMissing(error, 'read');
    return run(stripSportColumn(columns));
  }
  return result;
}

/**
 * Run a write with `payload`; if the sport column is missing, rerun it without.
 * @template P, R
 * @param {P} payload
 * @param {(payload: P) => PromiseLike<R>} run
 * @returns {Promise<R>}
 */
export async function writeWithSportFallback(payload, run) {
  if (sportColumnMissing) return run(/** @type {P} */ (stripSportField(payload)));
  const result = await run(payload);
  const error = /** @type {any} */ (result)?.error;
  if (error && isMissingSportColumnError(error)) {
    noteMissing(error, 'write');
    return run(/** @type {P} */ (stripSportField(payload)));
  }
  return result;
}
