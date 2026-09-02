/**
 * What the codebase believes the database contains.
 *
 * Two consumers, deliberately:
 *
 *   api/utils/schemaContract.test.js  — CI. Checks code against MIGRATIONS.
 *                                       No database, no credentials.
 *   scripts/audit-schema.mjs          — on demand. Checks migrations against
 *                                       PRODUCTION. Needs the service key.
 *
 * The split matters because the two failures are different. Code referencing a
 * table no migration creates is a typo, and CI can catch it. A migration that
 * exists but was never APPLIED is invisible to CI by definition — it needs the
 * real database. `fitness_evidence_weekly` (106) and `fitness_summaries` (054)
 * were both the second kind: committed, correct, never run. The first went a
 * month with a green weekly cron writing nothing; the second went months
 * paying for an uncached Claude call on every request.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Tables that exist in Postgres but no migration in this repo creates. */
export const EXTERNALLY_CREATED = new Set([
  // Created through the Supabase dashboard or an early ad-hoc script, long
  // before database/migrations/ existed.
  'activities',
  'routes',
  'user_profiles',
  'bike_computer_integrations',
  'bike_computer_sync_history',
  'beta_signups',
]);

/**
 * Tables a migration creates that nothing reads any more. Listed so the audit
 * can report them as dead rather than as drift, and so deleting one is a
 * deliberate act.
 */
export const RETIRED = new Set([
  'strava_activities',       // superseded by `activities`
  'ftp_history',             // never wired up
  'training_plan_templates', // templates live in src/data/, not the DB
  'user_custom_plans',
]);

const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_0-9]+)/gi;
const FROM_CALL = /\.from\(\s*'([a-z_0-9]+)'\s*\)/g;

/** Every table any migration creates → the migration file that creates it. */
export function tablesFromMigrations(dir) {
  const out = new Map();
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const m of sql.matchAll(CREATE_TABLE)) {
      const name = m[1].toLowerCase();
      if (name.startsWith('_cleanup')) continue;
      if (!out.has(name)) out.set(name, file);
    }
  }
  return out;
}

/** Every table the server code queries → the files that query it. */
export function tablesFromCode(dir, { skip = /\.test\.|\.spec\./ } = {}) {
  const out = new Map();
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
        continue;
      }
      if (!/\.(js|ts)$/.test(entry.name) || skip.test(entry.name)) continue;
      const src = readFileSync(full, 'utf8');
      for (const m of src.matchAll(FROM_CALL)) {
        const name = m[1].toLowerCase();
        if (!out.has(name)) out.set(name, []);
        out.get(name).push(full);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * Tables the code reads that no migration creates and that are not known to
 * have been created outside the repo. Each one is either a typo or a table
 * somebody made by hand and never wrote down.
 */
export function unbackedTables(codeTables, migrationTables) {
  const missing = [];
  for (const [name, files] of codeTables) {
    if (migrationTables.has(name)) continue;
    if (EXTERNALLY_CREATED.has(name)) continue;
    missing.push({ name, files });
  }
  return missing.sort((a, b) => a.name.localeCompare(b.name));
}
