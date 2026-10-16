/**
 * Fail-soft use of a column added by a hand-applied migration.
 *
 * Migrations are applied by hand, so a column a new release reads or writes
 * may not exist yet. Adding it naively to a shared SELECT or payload would
 * break every caller at once. `optionalColumn(table, column)` returns
 * wrappers that run a query with the column and, on PostgREST's
 * missing-column error, rerun it without the column and stop asking for the
 * rest of the process (or page) lifetime.
 *
 * Pure (no Supabase import): shared by api/ and src/ callers, each passing its
 * own query. Used for calendar_entries.sport (134, via calendarSportColumn.js)
 * and routes.sport (135).
 */

/**
 * @param {string} table
 * @param {string} column
 */
export function optionalColumn(table, column) {
  let missing = false;
  // "column routes.sport does not exist" (Postgres) or "Could not find the
  // 'sport' column of 'routes' in the schema cache" (PostgREST).
  const qualified = new RegExp(`${table}\\.${column}\\b|'${column}' column of '${table}'`);

  /** True for PostgREST's "<table> has no <column> column" errors. */
  function isMissingError(error) {
    const msg = String(error?.message || '');
    return qualified.test(msg) && /(does not exist|schema cache|Could not find)/i.test(msg);
  }

  /** A comma-separated column list without the column. */
  function stripColumn(columns) {
    return columns
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c && c !== column)
      .join(', ');
  }

  /** A row or array of rows without the field. */
  function stripField(payload) {
    const strip = (row) => {
      if (!row || typeof row !== 'object' || !(column in row)) return row;
      const { [column]: _dropped, ...rest } = row;
      return rest;
    };
    return Array.isArray(payload) ? payload.map(strip) : strip(payload);
  }

  function noteMissing(error, where) {
    if (missing) return;
    missing = true;
    console.warn(
      `[${table}] ${table}.${column} missing (${where}) — apply its migration. Falling back without it.`,
      error?.message,
    );
  }

  /**
   * Run a read with `columns`; if the column is missing, rerun it without.
   * @template R
   * @param {string} columns
   * @param {(columns: string) => PromiseLike<R>} run
   * @returns {Promise<R>}
   */
  async function select(columns, run) {
    if (missing) return run(stripColumn(columns));
    const result = await run(columns);
    const error = /** @type {any} */ (result)?.error;
    if (error && isMissingError(error)) {
      noteMissing(error, 'read');
      return run(stripColumn(columns));
    }
    return result;
  }

  /**
   * Run a write with `payload`; if the column is missing, rerun it without.
   * @template P, R
   * @param {P} payload
   * @param {(payload: P) => PromiseLike<R>} run
   * @returns {Promise<R>}
   */
  async function write(payload, run) {
    if (missing) return run(/** @type {P} */ (stripField(payload)));
    const result = await run(payload);
    const error = /** @type {any} */ (result)?.error;
    if (error && isMissingError(error)) {
      noteMissing(error, 'write');
      return run(/** @type {P} */ (stripField(payload)));
    }
    return result;
  }

  return {
    isMissingError,
    stripColumn,
    stripField,
    select,
    write,
    available: () => !missing,
    /** Test hook. */
    reset: () => {
      missing = false;
    },
  };
}
