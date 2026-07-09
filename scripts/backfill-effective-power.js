#!/usr/bin/env node

/**
 * Backfill activities.effective_power from normalized_power.
 *
 * Why: migration 072 added the canonical `effective_power` column with no
 * backfill, so every activity ingested before the B9 dual-write has
 * `normalized_power` populated and `effective_power` NULL. Server-side
 * estimators read canonical-first; until the Tier-3 legacy fallback landed
 * (July 2026 audit P0), those rows fell through to the kJ/heuristic tiers.
 * The code fallback (`effective_power ?? normalized_power`) makes this
 * backfill optional for correctness — it exists to close the data gap so
 * canonical-only consumers and future queries see populated values.
 *
 * Idempotent: only touches rows where effective_power IS NULL and
 * normalized_power IS NOT NULL, and copies the value verbatim.
 *
 * Usage:
 *   node scripts/backfill-effective-power.js [options]
 *
 * Options:
 *   --user-id <id>   Process only one user
 *   --limit <n>      Cap rows updated this run (default: unlimited)
 *   --dry-run        Report counts without writing anything
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   Provide them as exported variables, via `node --env-file=.env` (Node
 *   ≥20.6), or via a repo-root .env file if the optional `dotenv` package
 *   happens to be installed (it is NOT a package.json dependency).
 */

import { createClient } from '@supabase/supabase-js';

// Optional: honor a .env file when dotenv is available, but don't require it.
try {
  (await import('dotenv')).config();
} catch {
  // dotenv not installed — env vars must be provided directly.
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Missing required environment: set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.\n' +
      'Export them, use `node --env-file=.env scripts/backfill-effective-power.js`, ' +
      'or install dotenv and keep them in a repo-root .env file.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const PAGE_SIZE = 1000;
const UPDATE_CONCURRENCY = 25;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { userId: null, dryRun: false, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user-id') opts.userId = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--limit') opts.limit = Number(args[++i]) || Infinity;
  }
  return opts;
}

async function fetchPage(opts) {
  let query = supabase
    .from('activities')
    .select('id, normalized_power')
    .is('effective_power', null)
    .not('normalized_power', 'is', null)
    .gt('normalized_power', 0)
    .order('id', { ascending: true })
    .limit(Math.min(PAGE_SIZE, opts.limit));
  if (opts.userId) query = query.eq('user_id', opts.userId);
  const { data, error } = await query;
  if (error) throw new Error(`fetch failed: ${error.message}`);
  return data ?? [];
}

async function updateRows(rows) {
  let updated = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += UPDATE_CONCURRENCY) {
    const chunk = rows.slice(i, i + UPDATE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((row) =>
        supabase
          .from('activities')
          .update({ effective_power: row.normalized_power })
          .eq('id', row.id)
          .is('effective_power', null),
      ),
    );
    for (const { error } of results) {
      if (error) {
        failed++;
        console.error(`  update failed: ${error.message}`);
      } else {
        updated++;
      }
    }
  }
  return { updated, failed };
}

async function main() {
  const opts = parseArgs();
  console.log(
    `Backfilling activities.effective_power from normalized_power` +
      `${opts.userId ? ` for user ${opts.userId}` : ''}` +
      `${opts.dryRun ? ' (dry run)' : ''}`,
  );

  let totalUpdated = 0;
  let totalFailed = 0;

  for (;;) {
    const remaining = opts.limit - totalUpdated;
    if (remaining <= 0) break;
    const rows = await fetchPage({ ...opts, limit: remaining });
    if (rows.length === 0) break;

    if (opts.dryRun) {
      totalUpdated += rows.length;
      // Dry run can't advance past unmodified rows — one page is the report.
      if (rows.length === Math.min(PAGE_SIZE, remaining)) {
        console.log(`  (dry run reports the first page only; more rows may remain)`);
      }
      break;
    }

    const { updated, failed } = await updateRows(rows);
    totalUpdated += updated;
    totalFailed += failed;
    console.log(`  page done: ${updated} updated, ${failed} failed (running total ${totalUpdated})`);
    if (failed > 0 && updated === 0) {
      console.error('  aborting: page made no progress');
      break;
    }
  }

  console.log(
    opts.dryRun
      ? `Dry run: ${totalUpdated} rows would be updated${totalUpdated >= PAGE_SIZE ? ' (first page shown; rerun without --dry-run to process all)' : ''}.`
      : `Done: ${totalUpdated} rows updated, ${totalFailed} failures.`,
  );
  if (totalFailed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
