#!/usr/bin/env node

/**
 * Row-for-row verification of the calendar_entries backfill (migration 115).
 *
 * READ-ONLY. Writes nothing, ever. Run it after applying 114+115 — ideally on a
 * Supabase branch first — and require a clean report before repointing any
 * reader at the new table.
 *
 * What it proves:
 *
 *   1. COUNT PARITY — every planned_workouts row with a date, and every
 *      race_goals row with a date, produced exactly one entry.
 *   2. ID PRESERVATION — ids were carried, not regenerated. This is the one
 *      that matters most: activities.matched_planned_workout_id points at
 *      planned_workouts.id and is rewritten every 5 minutes by the Garmin
 *      webhook path, so a regenerated key dangles it for every historical
 *      activity.
 *   3. FIELD PARITY — date, load and duration survived the tss/rss and
 *      duration_minutes/target_duration merges, comparing against
 *      canonical-first COALESCE on the source side.
 *   4. SLOT INTEGRITY — (user_id, date, slot) is unique and each athlete-day
 *      is numbered densely from 0, with a race first where one exists.
 *   5. STATUS PARITY — every completed workout became status='done', and no
 *      entry claims 'done' without its source having been completed.
 *
 * Usage:
 *   node scripts/verify-calendar-entries.js
 *   node scripts/verify-calendar-entries.js --user <uuid>
 *   node scripts/verify-calendar-entries.js --sample 40   # rows per mismatch table
 *
 * Environment:
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';

try {
  (await import('dotenv')).config();
} catch {
  // dotenv is not a dependency of this repo; env vars must be provided directly.
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment: set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const ONLY_USER = arg('--user');
const SAMPLE = Number(arg('--sample', '10'));
const PAGE = 1000;

/** Page through a table so a 1000-row PostgREST cap never truncates a check. */
async function fetchAll(table, columns, tweak = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (ONLY_USER) q = q.eq('user_id', ONLY_USER);
    const { data, error } = await tweak(q);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

const num = (v) => (v === null || v === undefined ? null : Number(v));
const eqNum = (a, b) => {
  const x = num(a);
  const y = num(b);
  if (x === null && y === null) return true;
  if (x === null || y === null) return false;
  return Math.abs(x - y) < 1e-6;
};

const failures = [];
function check(label, ok, detail) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) {
    failures.push(label);
    if (detail) console.log(detail.split('\n').map((l) => `      ${l}`).join('\n'));
  }
}

async function main() {
  console.log(`\nVerifying calendar_entries${ONLY_USER ? ` for ${ONLY_USER}` : ' (all athletes)'}…\n`);

  const [workouts, races, entries, links] = await Promise.all([
    fetchAll('planned_workouts',
      'id, user_id, scheduled_date, name, workout_type, target_rss, target_tss, target_duration, duration_minutes, actual_rss, actual_tss, actual_duration, completed, activity_id, original_scheduled_date, original_workout_id, adjustment_reason',
      (q) => q.not('scheduled_date', 'is', null)),
    fetchAll('race_goals', 'id, user_id, race_date, name, status',
      (q) => q.not('race_date', 'is', null)),
    fetchAll('calendar_entries',
      'id, user_id, date, slot, type, title, target_load, target_duration_min, actual_load, actual_duration_min, status, activity_id, pinned, plan_id'),
    fetchAll('activities', 'id, matched_planned_workout_id',
      (q) => q.not('matched_planned_workout_id', 'is', null)),
  ]);

  const byId = new Map(entries.map((e) => [e.id, e]));

  // 1 — count parity
  console.log('1. Count parity');
  check(`planned_workouts ${workouts.length} + race_goals ${races.length} = calendar_entries ${entries.length}`,
    workouts.length + races.length === entries.length,
    `difference: ${entries.length - (workouts.length + races.length)}`);
  check(`entries typed as race = ${entries.filter((e) => e.type === 'race').length}, races = ${races.length}`,
    entries.filter((e) => e.type === 'race').length === races.length);

  // 2 — id preservation
  console.log('\n2. ID preservation');
  const missingW = workouts.filter((w) => !byId.has(w.id));
  const missingR = races.filter((r) => !byId.has(r.id));
  check(`every planned_workouts id present (${workouts.length - missingW.length}/${workouts.length})`,
    missingW.length === 0,
    missingW.slice(0, SAMPLE).map((w) => `${w.id}  ${w.scheduled_date}  ${w.name}`).join('\n'));
  check(`every race_goals id present (${races.length - missingR.length}/${races.length})`,
    missingR.length === 0,
    missingR.slice(0, SAMPLE).map((r) => `${r.id}  ${r.race_date}  ${r.name}`).join('\n'));

  const dangling = links.filter((a) => !byId.has(a.matched_planned_workout_id));
  check(`every activities.matched_planned_workout_id resolves (${links.length - dangling.length}/${links.length})`,
    dangling.length === 0,
    dangling.slice(0, SAMPLE).map((a) => `activity ${a.id} -> ${a.matched_planned_workout_id}`).join('\n'));

  // 3 — field parity
  console.log('\n3. Field parity (workouts)');
  const mismatches = { date: [], load: [], duration: [], actual: [], pinned: [] };
  for (const w of workouts) {
    const e = byId.get(w.id);
    if (!e) continue;
    if (e.date !== w.scheduled_date) mismatches.date.push(`${w.id}  ${w.scheduled_date} -> ${e.date}`);
    if (!eqNum(e.target_load, w.target_rss ?? w.target_tss)) {
      mismatches.load.push(`${w.id}  rss=${w.target_rss} tss=${w.target_tss} -> ${e.target_load}`);
    }
    if (!eqNum(e.target_duration_min, w.target_duration ?? w.duration_minutes)) {
      mismatches.duration.push(`${w.id}  td=${w.target_duration} dm=${w.duration_minutes} -> ${e.target_duration_min}`);
    }
    if (!eqNum(e.actual_load, w.actual_rss ?? w.actual_tss)) {
      mismatches.actual.push(`${w.id}  arss=${w.actual_rss} atss=${w.actual_tss} -> ${e.actual_load}`);
    }
    const expectPinned = !!(w.activity_id || w.original_scheduled_date || w.original_workout_id || w.adjustment_reason);
    if (e.pinned !== expectPinned) mismatches.pinned.push(`${w.id}  expected pinned=${expectPinned} got ${e.pinned}`);
  }
  for (const [field, list] of Object.entries(mismatches)) {
    check(`${field} matches on all ${workouts.length} workouts`, list.length === 0,
      list.slice(0, SAMPLE).join('\n') + (list.length > SAMPLE ? `\n… and ${list.length - SAMPLE} more` : ''));
  }

  // 4 — slot integrity
  console.log('\n4. Slot integrity');
  const perDay = new Map();
  for (const e of entries) {
    const k = `${e.user_id}|${e.date}`;
    if (!perDay.has(k)) perDay.set(k, []);
    perDay.get(k).push(e);
  }
  const dupSlots = [];
  const sparse = [];
  const raceNotFirst = [];
  for (const [k, list] of perDay) {
    const slots = list.map((e) => e.slot).sort((a, b) => a - b);
    if (new Set(slots).size !== slots.length) dupSlots.push(`${k}  slots=[${slots}]`);
    if (slots.some((s, i) => s !== i)) sparse.push(`${k}  slots=[${slots}]`);
    const race = list.find((e) => e.type === 'race');
    if (race && race.slot !== 0) raceNotFirst.push(`${k}  race at slot ${race.slot}`);
  }
  check(`(user_id, date, slot) unique across ${perDay.size} athlete-days`, dupSlots.length === 0, dupSlots.slice(0, SAMPLE).join('\n'));
  check('slots are dense from 0 on every day', sparse.length === 0, sparse.slice(0, SAMPLE).join('\n'));
  check('a race always occupies slot 0 on its day', raceNotFirst.length === 0, raceNotFirst.slice(0, SAMPLE).join('\n'));

  // 5 — status parity
  console.log('\n5. Status parity');
  const completedW = workouts.filter((w) => w.completed === true);
  const notDone = completedW.filter((w) => byId.get(w.id)?.status !== 'done');
  check(`all ${completedW.length} completed workouts are status='done'`, notDone.length === 0,
    notDone.slice(0, SAMPLE).map((w) => `${w.id}  ${w.scheduled_date}  -> ${byId.get(w.id)?.status}`).join('\n'));

  const wById = new Map(workouts.map((w) => [w.id, w]));
  const falseDone = entries.filter(
    (e) => e.status === 'done' && e.type !== 'race' && wById.has(e.id) && wById.get(e.id).completed !== true,
  );
  check("no workout entry claims 'done' without a completed source", falseDone.length === 0,
    falseDone.slice(0, SAMPLE).map((e) => `${e.id}  ${e.date}`).join('\n'));

  console.log(
    failures.length === 0
      ? '\n✅ All checks passed — the backfill is faithful.\n'
      : `\n❌ ${failures.length} check(s) failed:\n${failures.map((f) => `   - ${f}`).join('\n')}\n`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
