#!/usr/bin/env node

/**
 * Repair planned_workouts left behind by plans that were retired without
 * cleanup.
 *
 * BACKGROUND
 * ----------
 * Activating a new plan used to flip the old plan's `status` to 'completed'
 * and then attempt an UNCHECKED delete of its future rows. On 2026-08-22 that
 * delete silently did nothing, leaving the
 * athlete with two plans' sessions stacked on every day from Aug 21 to Sep 25 —
 * which is why the training header read "11 sessions this week".
 *
 * This script applies the same detach-don't-delete rules retroactively:
 *   • untouched machine fill (`source IN ('arc','coach_static')`, no activity
 *     link, no manual adjustment, not completed) is DELETED;
 *   • anything else future and incomplete is DETACHED (`plan_id -> NULL`) and
 *     stays on the calendar;
 *   • completed and past rows are kept, so history keeps its provenance —
 *     with ONE narrow exception, below.
 *
 * THE COMPLETED-DUPLICATE EXCEPTION
 * ---------------------------------
 * While the plans overlapped, auto-linking marked BOTH plans' rows complete
 * from the SAME ride: on 2026-08-21 and 2026-08-22 a retired-plan row and a
 * live-plan row carry the identical `activity_id`. That is not history, it is
 * one ride counted twice, and it inflates every completed/compliance figure.
 * So a retired plan's completed row is also removed when a LIVE plan's row for
 * the same athlete and date points at the same activity. The live row always
 * survives. This is provable duplication, not a judgement call, and it is the
 * only circumstance in which a completed row is touched.
 *
 * SAFETY
 * ------
 * Dry-run by default: it prints exactly what it would do and writes nothing.
 * A JSON backup of every affected row is written before any mutation, and
 * --restore replays it. Before writing it asserts that each affected athlete
 * still has exactly one surviving active plan, so a bad run cannot strand
 * someone with an empty calendar.
 *
 * Usage:
 *   node scripts/repair-orphaned-planned-workouts.js                  # dry run, all users
 *   node scripts/repair-orphaned-planned-workouts.js --user <uuid>    # scope to one athlete
 *   node scripts/repair-orphaned-planned-workouts.js --apply          # actually write
 *   node scripts/repair-orphaned-planned-workouts.js --restore <file> # roll back
 *
 * Environment:
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const BACKUP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.backups');
const MACHINE_SOURCES = ['arc', 'coach_static'];
const TOUCH_MARKERS = ['activity_id', 'original_scheduled_date', 'original_workout_id', 'adjustment_reason'];
const LIVE_STATUSES = ['active'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}
const APPLY = process.argv.includes('--apply');
const ONLY_USER = arg('--user');
const RESTORE = arg('--restore');

/** A row nobody has touched is safe to delete; everything else is detached. */
function isUntouchedMachineFill(row) {
  if (!MACHINE_SOURCES.includes(row.source)) return false;
  if (row.completed === true) return false;
  return TOUCH_MARKERS.every((col) => row[col] == null);
}

/**
 * Key identifying "the same ride credited twice". A retired-plan row matching a
 * live-plan row on this key is a duplicate, not history.
 */
function activityKey(row) {
  return row.activity_id ? `${row.user_id}|${row.scheduled_date}|${row.activity_id}` : null;
}

async function restore(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Backups written before the activity_efi fix are a flat array of
  // planned_workouts rows; newer ones are keyed by table. Accept both.
  const backup = Array.isArray(parsed)
    ? { planned_workouts: parsed, activity_efi: [] }
    : { planned_workouts: parsed.planned_workouts || [], activity_efi: parsed.activity_efi || [] };

  // Workouts first: activity_efi.workout_id references them, so restoring the
  // dependents before their parents would fail the same FK that made the
  // original delete abort.
  for (const [table, rows] of [
    ['planned_workouts', backup.planned_workouts],
    ['activity_efi', backup.activity_efi],
  ]) {
    if (rows.length === 0) continue;
    console.log(`Restoring ${rows.length} ${table} row(s) from ${file}…`);
    for (const row of rows) {
      const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
      if (error) {
        console.error(`  ✗ ${table} ${row.id}: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
  console.log('Restore complete.');
}

async function main() {
  if (RESTORE) return restore(RESTORE);

  const today = new Date().toISOString().slice(0, 10);

  // Rows whose owning plan is no longer live. Fetched via the plan side so a
  // plan_id that is already NULL (correctly detached) is never reconsidered.
  let planQuery = supabase.from('training_plans').select('id, user_id, name, status, template_id, target_event_date');
  if (ONLY_USER) planQuery = planQuery.eq('user_id', ONLY_USER);
  const { data: plans, error: planErr } = await planQuery;
  if (planErr) throw new Error(`Could not read training_plans: ${planErr.message}`);

  const deadPlanIds = plans.filter((p) => !LIVE_STATUSES.includes(p.status)).map((p) => p.id);
  if (deadPlanIds.length === 0) {
    console.log('No retired plans found. Nothing to do.');
    return;
  }

  let rowQuery = supabase
    .from('planned_workouts')
    .select('*')
    .in('plan_id', deadPlanIds)
    .gte('scheduled_date', today)
    .or('completed.is.null,completed.eq.false');
  if (ONLY_USER) rowQuery = rowQuery.eq('user_id', ONLY_USER);
  const { data: rows, error: rowErr } = await rowQuery;
  if (rowErr) throw new Error(`Could not read planned_workouts: ${rowErr.message}`);

  // Completed rows on a retired plan that share an activity with a LIVE plan's
  // row for the same date — one ride credited to two sessions.
  const livePlanIds = plans.filter((p) => LIVE_STATUSES.includes(p.status)).map((p) => p.id);
  let dupes = [];
  if (livePlanIds.length > 0) {
    let liveQuery = supabase
      .from('planned_workouts')
      .select('user_id, scheduled_date, activity_id')
      .in('plan_id', livePlanIds)
      .not('activity_id', 'is', null);
    if (ONLY_USER) liveQuery = liveQuery.eq('user_id', ONLY_USER);
    const { data: liveLinked, error: liveErr } = await liveQuery;
    if (liveErr) throw new Error(`Could not read live plan rows: ${liveErr.message}`);
    const liveKeys = new Set((liveLinked || []).map(activityKey).filter(Boolean));

    let dupeQuery = supabase
      .from('planned_workouts')
      .select('*')
      .in('plan_id', deadPlanIds)
      .not('activity_id', 'is', null);
    if (ONLY_USER) dupeQuery = dupeQuery.eq('user_id', ONLY_USER);
    const { data: retiredLinked, error: dupeErr } = await dupeQuery;
    if (dupeErr) throw new Error(`Could not read retired plan rows: ${dupeErr.message}`);
    dupes = (retiredLinked || []).filter((r) => liveKeys.has(activityKey(r)));
  }

  if ((!rows || rows.length === 0) && dupes.length === 0) {
    console.log('No orphaned future workouts and no duplicated completions found. Nothing to do.');
    return;
  }

  const toDelete = rows.filter(isUntouchedMachineFill);
  const toDetach = rows.filter((r) => !isUntouchedMachineFill(r));
  const affectedUsers = [...new Set([...rows, ...dupes].map((r) => r.user_id))];
  const planName = new Map(plans.map((p) => [p.id, p.name]));

  console.log(`\nOrphaned future workouts: ${rows.length} across ${affectedUsers.length} athlete(s)\n`);
  for (const userId of affectedUsers) {
    const mine = rows.filter((r) => r.user_id === userId);
    const live = plans.filter((p) => p.user_id === userId && LIVE_STATUSES.includes(p.status));
    console.log(`  athlete ${userId}`);
    console.log(`    surviving active plan(s): ${live.length ? live.map((p) => `${p.name} [${p.template_id}]`).join(', ') : 'NONE'}`);
    const byPlan = new Map();
    for (const r of mine) byPlan.set(r.plan_id, (byPlan.get(r.plan_id) || 0) + 1);
    for (const [pid, n] of byPlan) {
      console.log(`    from retired plan "${planName.get(pid) ?? pid}": ${n} row(s)`);
    }
    console.log(`    delete ${mine.filter(isUntouchedMachineFill).length}, detach ${mine.filter((r) => !isUntouchedMachineFill(r)).length}`);
    if (mine.length > 0) {
      console.log(`    date range: ${mine.map((r) => r.scheduled_date).sort()[0]} … ${mine.map((r) => r.scheduled_date).sort().at(-1)}`);
    }
    const myDupes = dupes.filter((r) => r.user_id === userId);
    for (const d of myDupes) {
      console.log(`    duplicate completion on ${d.scheduled_date}: "${d.name}" shares activity ${d.activity_id} with the live plan — removing the retired copy`);
    }
  }

  // Guard: never strand an athlete with no plan AND no calendar. If they have
  // no surviving active plan, detaching is still fine but deleting is not —
  // those rows are all the schedule they have left.
  const stranded = affectedUsers.filter(
    (u) => !plans.some((p) => p.user_id === u && LIVE_STATUSES.includes(p.status)),
  );
  if (stranded.length > 0) {
    console.log(
      `\n⚠  ${stranded.length} athlete(s) have no surviving active plan. Their rows will be DETACHED only, never deleted.`,
    );
  }
  // Duplicated completions are deleted regardless of the stranded guard: the
  // live plan's row for that exact ride always survives, so nothing is lost.
  const deletable = [...toDelete.filter((r) => !stranded.includes(r.user_id)), ...dupes];
  const detachable = [...toDetach, ...toDelete.filter((r) => stranded.includes(r.user_id))];

  console.log(`\nTOTAL: delete ${deletable.length} (${dupes.length} duplicated completion(s)), detach ${detachable.length}`);

  // activity_efi is the ONLY foreign key into planned_workouts that is neither
  // CASCADE nor SET NULL — it is NO ACTION, so a single referencing row aborts
  // the whole DELETE and nothing at all is removed. (That is exactly what
  // happened on the first --apply run: one efi row for a duplicated completion
  // blocked all 35 deletions.) Clear the dependents in the same operation, and
  // back them up so --restore is still a complete reversal.
  let dependentEfi = [];
  if (deletable.length > 0) {
    const { data, error } = await supabase
      .from('activity_efi')
      .select('*')
      .in('workout_id', deletable.map((r) => r.id));
    if (error) throw new Error(`Could not read activity_efi dependents: ${error.message}`);
    dependentEfi = data || [];
  }
  if (dependentEfi.length > 0) {
    console.log(
      `\n${dependentEfi.length} activity_efi row(s) reference rows being deleted and will be removed too.`,
    );
    console.log(
      '  Safe: EFI is derived per activity + planned workout, and the surviving row for the same ride keeps its own.',
    );
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to commit.');
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `orphaned-planned-workouts-${stamp}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify({ planned_workouts: [...rows, ...dupes], activity_efi: dependentEfi }, null, 2),
  );
  console.log(`\nBackup written to ${backupFile}`);

  if (dependentEfi.length > 0) {
    const { error } = await supabase
      .from('activity_efi')
      .delete()
      .in('id', dependentEfi.map((r) => r.id));
    if (error) throw new Error(`activity_efi cleanup failed: ${error.message}`);
    console.log(`Removed ${dependentEfi.length} dependent activity_efi row(s).`);
  }

  if (deletable.length > 0) {
    const { error } = await supabase
      .from('planned_workouts')
      .delete()
      .in('id', deletable.map((r) => r.id));
    if (error) throw new Error(`Delete failed: ${error.message}`);
    console.log(`Deleted ${deletable.length} untouched generated row(s).`);
  }

  if (detachable.length > 0) {
    const { error } = await supabase
      .from('planned_workouts')
      .update({ plan_id: null, source: 'manual' })
      .in('id', detachable.map((r) => r.id));
    if (error) throw new Error(`Detach failed: ${error.message}`);
    console.log(`Detached ${detachable.length} athlete-touched row(s) onto the plan-free calendar.`);
  }

  // No relabel. Retired plans stay 'completed' — training_plans_status_check
  // restricts status to draft|active|paused|completed|archived, so the
  // 'superseded' label this used to write violated the constraint and aborted
  // the run *after* the deletes had already committed. Distinguishing
  // "replaced" from "finished" needs a migration to widen that CHECK first.

  console.log(`\nDone. Roll back with:\n  node scripts/repair-orphaned-planned-workouts.js --restore ${backupFile}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
