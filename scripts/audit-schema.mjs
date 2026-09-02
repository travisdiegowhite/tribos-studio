#!/usr/bin/env node
/**
 * Does production actually have what the migrations say it should?
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run audit:schema
 *
 * The companion test (api/utils/schemaContract.test.js) checks code against
 * migrations and runs in CI. This checks migrations against the REAL DATABASE,
 * which CI cannot do — and that is the gap the two outages fell through:
 *
 *   fitness_evidence_weekly (106)  committed 2026-08-03, never applied. The
 *                                  weekly cron ran green for a month writing
 *                                  nothing, because it caught per-user errors
 *                                  and still returned 200.
 *   fitness_summaries       (054)  never applied. api/fitness-summary.js
 *                                  discarded the read error, so a broken cache
 *                                  was indistinguishable from an empty one and
 *                                  every request paid for a Claude call.
 *
 * Both were invisible to tests, to types, and to the Vercel dashboard. The
 * only thing that would have caught either is asking the database.
 *
 * Exit code 1 when anything is missing, so this can be wired into a deploy
 * check or a cron later without further work.
 */

import { createClient } from '@supabase/supabase-js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tablesFromMigrations,
  tablesFromCode,
  EXTERNALLY_CREATED,
  RETIRED,
} from './lib/schemaExpectations.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('audit-schema: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.');
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/**
 * Which of these tables exist? Probed one HEAD request each rather than by
 * reading information_schema, because the service key reaches PostgREST but
 * not necessarily arbitrary catalog queries.
 */
async function findMissing(names) {
  const missing = [];
  for (const name of names) {
    const { error } = await supabase.from(name).select('*', { head: true, count: 'exact' }).limit(0);
    // PGRST205 = table not found in the schema cache. Anything else (RLS,
    // permissions) still proves the table exists.
    if (error && (error.code === 'PGRST205' || /does not exist/i.test(error.message || ''))) {
      missing.push(name);
    }
  }
  return missing;
}

const migrationTables = tablesFromMigrations(join(ROOT, 'database', 'migrations'));
const codeTables = tablesFromCode(join(ROOT, 'api'));

const expected = [...migrationTables.keys()].filter((t) => !RETIRED.has(t));
console.log(
  `Checking ${expected.length} migration-created tables ` +
  `(${RETIRED.size} retired, ${EXTERNALLY_CREATED.size} created outside the repo)…\n`
);

const missing = await findMissing(expected);

if (missing.length === 0) {
  console.log('OK — every migration-created table exists in production.');
  process.exit(0);
}

// A missing table that live code queries is an outage; one nothing reads is
// housekeeping. Report them apart, because they need different urgency.
const live = missing.filter((t) => codeTables.has(t));
const dormant = missing.filter((t) => !codeTables.has(t));

if (live.length > 0) {
  console.error(`MISSING AND IN USE (${live.length}) — code queries these and they do not exist:`);
  for (const t of live) {
    const readers = [...new Set(codeTables.get(t))].map((f) => f.replace(`${ROOT}/`, ''));
    console.error(`  ${t}`);
    console.error(`      created by : ${migrationTables.get(t)}`);
    console.error(`      read by    : ${readers.join(', ')}`);
  }
  console.error('');
}

if (dormant.length > 0) {
  console.warn(`MISSING, NOT YET READ (${dormant.length}) — the migration never ran:`);
  for (const t of dormant) console.warn(`  ${t}  (${migrationTables.get(t)})`);
  console.warn('');
}

console.error(`Apply the migrations above, or add the table to RETIRED in scripts/lib/schemaExpectations.js.`);
process.exit(1);
