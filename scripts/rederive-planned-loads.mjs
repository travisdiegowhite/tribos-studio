#!/usr/bin/env node
/**
 * Re-derive every calendar session's planned load from what the session is.
 *
 *   node scripts/rederive-planned-loads.mjs                  # dry run, every athlete
 *   node scripts/rederive-planned-loads.mjs --user <uuid>    # dry run, one athlete
 *   node scripts/rederive-planned-loads.mjs --skip-pinned    # leave pinned entries alone
 *   node scripts/rederive-planned-loads.mjs --apply          # write
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
 *
 * WHY. Until 2026-11 a session's `target_load` was whatever its writer typed
 * (a library constant, or the coach model's guess), so a 60-minute sweet-spot
 * hour sat at 90 RSS when its intervals predict 55, and every compliance
 * read against it was wrong. New writes derive the load with
 * `plannedLoadFor` (api/utils/plannedLoad.js); this brings existing rows,
 * past and future, onto the same rule. Compliance is computed live from the
 * row, so it corrects itself once the row does.
 *
 * WHAT IT WRITES: only `target_load`, and only where the derived value
 * differs. `calendar_entries` has no legacy load twin (the `target_rss` /
 * `target_tss` names are read aliases in calendarRead.js), so there is
 * nothing to dual-write. Notes are skipped; races keep their given load.
 *
 * Pinned entries ARE re-derived by default: `pinned` records that the athlete
 * chose the session, and the planned load is a measurement of that session,
 * not a choice. `--skip-pinned` leaves them as they are.
 *
 * AFTER WRITING it refreshes EFI (`activity_efi`) for each activity linked to
 * a changed entry, since EFI snapshots the planned load when it is computed.
 * `plan_deviations` rows are a record of what was planned when the deviation
 * was detected and are left alone.
 *
 * Re-runnable: a second run finds nothing to change.
 */

import { createClient } from '@supabase/supabase-js';
import { plannedLoadFor } from '../api/utils/plannedLoad.js';
import { computeAndStoreMetrics } from '../api/utils/metricsComputation.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SKIP_PINNED = args.includes('--skip-pinned');
const userArg = args.indexOf('--user');
const ONLY_USER = userArg >= 0 ? args[userArg + 1] : null;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required.');
  process.exit(1);
}
// A one-off script, not an API route: the connection-hygiene rule in
// CLAUDE.md is about the serverless pool. One client, closed on exit.
const supabase = createClient(url, key, { auth: { persistSession: false } });

const COLUMNS = 'id, user_id, date, type, title, workout_type, workout_id, target_load, target_duration_min, sport, pinned, details, activity_id';
const PAGE = 1000;

async function entries() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('calendar_entries')
      .select(COLUMNS)
      .neq('type', 'note')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (ONLY_USER) q = q.eq('user_id', ONLY_USER);
    if (SKIP_PINNED) q = q.eq('pinned', false);
    const { data, error } = await q;
    if (error) throw new Error(`reading entries: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function sameLoad(a, b) {
  if (a == null || b == null) return a == null && b == null;
  return Number(a) === Number(b);
}

async function run() {
  const rows = await entries();
  const changes = [];
  for (const row of rows) {
    const next = plannedLoadFor(row);
    if (sameLoad(row.target_load, next)) continue;
    changes.push({ row, next });
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${changes.length} of ${rows.length} entries change${SKIP_PINNED ? ' (pinned skipped)' : ''}`);
  const sample = changes.slice(0, 40);
  for (const { row, next } of sample) {
    console.log(`  ${row.user_id.slice(0, 8)} ${row.date} ${row.title ?? row.workout_type} [${row.workout_id ?? row.workout_type}${row.pinned ? ', pinned' : ''}] ${row.target_load ?? '—'} → ${next ?? '—'}`);
  }
  if (changes.length > sample.length) console.log(`  … and ${changes.length - sample.length} more`);
  if (!APPLY) {
    console.log('\nRe-run with --apply to write.');
    return;
  }

  let written = 0;
  let failed = 0;
  const refresh = new Map(); // activity id → user id
  for (const { row, next } of changes) {
    const { error } = await supabase
      .from('calendar_entries')
      .update({ target_load: next })
      .eq('id', row.id)
      .eq('user_id', row.user_id);
    if (error) {
      failed += 1;
      console.error(`  ${row.id}: write failed — ${error.message}`);
      continue;
    }
    written += 1;
    if (row.activity_id) refresh.set(row.activity_id, row.user_id);
  }

  let refreshed = 0;
  for (const [activityId, userId] of refresh) {
    try {
      await computeAndStoreMetrics(supabase, userId, activityId);
      refreshed += 1;
    } catch (err) {
      console.error(`  EFI refresh ${activityId}: ${err.message}`);
    }
  }

  console.log(`\n${written} written, ${failed} failed; EFI refreshed for ${refreshed} of ${refresh.size} linked activities.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
