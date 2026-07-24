#!/usr/bin/env node

/**
 * One-time full-history rebuild of training_load_daily for all users.
 *
 * Why: the nightly rollforward (api/training-load-daily.js) only ever
 * computed a trailing 180-day window cold-started at tfi/afi = 0, so
 * (a) the table reaches back only to (first engine run − 180d) and charts
 * cliff to ~0 at that date, and (b) before the seeding fix in
 * api/utils/trainingLoadRecompute.js, every date aging out of the window
 * had been last overwritten with a "day 1 of cold start" value.
 *
 * This script recomputes each user's rows from their FIRST activity through
 * yesterday using the same engine (computeTrainingLoadRows via
 * recomputeTrainingLoadForUser with a per-user `days`), giving every
 * historical date a converged, continuous value. Idempotent — safe to
 * re-run; the table is fully derived from activities.
 *
 * Run AFTER scripts/repair-sentinel-tss.js and after the sanitizer guards
 * are deployed, so corrupt 6553.5 stress scores aren't baked into history.
 *
 * Usage:
 *   node scripts/rebuild-training-load-history.js [options]
 *
 * Options:
 *   --user-id <id>      Rebuild only one user
 *   --limit-users <n>   Cap number of users processed this run
 *   --dry-run           Compute but write nothing (reports last-day values)
 *
 * Environment:
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import {
  recomputeTrainingLoadForUser,
  localDateKey,
} from '../api/utils/trainingLoadRecompute.js';

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
    'Missing required environment: set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const PAGE_SIZE = 1000;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { userId: null, dryRun: false, limitUsers: Infinity };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--user-id':
        opts.userId = args[++i];
        break;
      case '--limit-users':
        opts.limitUsers = Number(args[++i]);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
  return opts;
}

async function allUserIdsWithActivities() {
  const ids = new Set();
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('activities')
      .select('user_id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`user scan failed: ${error.message}`);
    for (const r of data ?? []) if (r.user_id) ids.add(r.user_id);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return [...ids];
}

async function daysSinceFirstActivity(userId) {
  const { data, error } = await supabase
    .from('activities')
    .select('start_date')
    .eq('user_id', userId)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`first-activity fetch failed: ${error.message}`);
  if (!data?.start_date) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();
  const tz = profile?.timezone || 'America/New_York';

  const firstKey = localDateKey(data.start_date, tz);
  const todayKey = localDateKey(new Date(), tz);
  const days = Math.round(
    (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${firstKey}T00:00:00Z`)) / 86400000,
  );
  // +7 buffer so the window start safely precedes the first activity.
  return days + 7;
}

async function main() {
  const opts = parseArgs();
  const userIds = opts.userId ? [opts.userId] : await allUserIdsWithActivities();
  const targets = userIds.slice(
    0,
    opts.limitUsers === Infinity ? undefined : opts.limitUsers,
  );
  console.log(`Rebuilding training_load_daily for ${targets.length} user(s)${opts.dryRun ? ' [dry run]' : ''}`);

  let ok = 0;
  const failures = [];
  for (const userId of targets) {
    try {
      const days = await daysSinceFirstActivity(userId);
      if (!days) {
        console.log(`  ${userId}: no activities, skipped`);
        continue;
      }
      const result = await recomputeTrainingLoadForUser(supabase, userId, {
        days,
        dryRun: opts.dryRun,
      });
      ok++;
      console.log(
        `  ${userId}: ${days} days, ${result.rowsWritten} rows written, ` +
          `last day ${result.lastDay?.date} tfi=${result.lastDay?.tfi} afi=${result.lastDay?.afi}`,
      );
    } catch (err) {
      failures.push(userId);
      console.error(`  ${userId}: FAILED — ${err.message}`);
    }
  }
  console.log(`\nDone. ${ok}/${targets.length} users rebuilt, ${failures.length} failures.`);
  if (failures.length) {
    console.log(`Failed users:\n${failures.join('\n')}`);
    process.exit(1);
  }
}

await main();
