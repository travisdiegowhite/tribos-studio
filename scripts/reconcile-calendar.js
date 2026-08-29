#!/usr/bin/env node

/**
 * Reconcile planned_workouts and calendar_entries into one truth, so /train
 * can be repointed at calendar_entries without losing anything.
 *
 * WHY THIS EXISTS
 * ---------------
 * Migration 115 copied planned_workouts into calendar_entries preserving row
 * ids, then both tables stayed live for a week. /train wrote one, the coach
 * wrote the other, and they drifted. The drift is small but real, and it is
 * training content, so it cannot be merged by a rule nobody looked at.
 *
 * WHICH SIDE WINS, AND WHY
 * ------------------------
 * planned_workouts wins on scheduling and prescription for any row present in
 * BOTH tables. It is the table /train reads, so it holds every correction the
 * athlete made by hand — including, on 2026-08-28 at 20:15, three edits in 38
 * seconds putting a long ride back on Sunday. calendar_entries missed all of
 * those because nothing the athlete touched wrote to it.
 *
 * calendar_entries wins by default for rows that exist ONLY there. Those are
 * the nine cyclocross races the coach created; they exist in no other table
 * and would be destroyed by a naive "old table is truth" merge.
 *
 * Rows only in planned_workouts are INSERTED into calendar_entries, carrying
 * their id so activities.matched_planned_workout_id keeps resolving.
 *
 * NOTHING IS INVENTED. Every conflict is printed with both sides so it can be
 * read before it is written. A wrong merge here is a wrong workout.
 *
 * SAFETY
 * ------
 * Dry-run by default. A JSON backup of every calendar_entries row this would
 * touch is written before any mutation, and --restore replays it.
 *
 * Usage:
 *   node scripts/reconcile-calendar.js --user <uuid>            # dry run
 *   node scripts/reconcile-calendar.js --user <uuid> --apply
 *   node scripts/reconcile-calendar.js --restore <backup.json>
 *
 * Environment:
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing environment: set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function argOf(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}
const APPLY = process.argv.includes('--apply');
const USER = argOf('--user');
const RESTORE = argOf('--restore');
/** Only future rows are reconciled; history is left exactly as it is. */
const FROM = argOf('--from') || new Date().toISOString().slice(0, 10);

/** planned_workouts field -> calendar_entries field, for rows in both. */
const WINS = [
  ['scheduled_date', 'date'],
  ['name', 'title'],
  ['target_rss', 'target_load'],
  ['target_duration', 'target_duration_min'],
  ['workout_type', 'workout_type'],
];

function norm(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' ? n : String(v).trim();
}
const differs = (a, b) => {
  const x = norm(a), y = norm(b);
  if (typeof x === 'number' && typeof y === 'number') return x !== y;
  return String(x) !== String(y);
};

async function restore(path) {
  const rows = JSON.parse(readFileSync(path, 'utf8'));
  console.log(`Restoring ${rows.length} calendar_entries rows from ${path}…`);
  for (const row of rows) {
    const { error } = await supabase.from('calendar_entries').upsert(row);
    if (error) { console.error(`  FAILED ${row.id}: ${error.message}`); process.exit(1); }
  }
  console.log('Restored.');
}

async function main() {
  if (RESTORE) return restore(RESTORE);
  if (!USER) { console.error('Pass --user <uuid>.'); process.exit(1); }

  // Read a WIDER window than we reconcile, then pair by id.
  //
  // Filtering each table independently by date is wrong and the first dry run
  // proved it: a row that moved across the boundary (dabf609e, Aug 28 in one
  // table and Aug 30 in the other) appears in one result set and not the
  // other, so it reads as "missing" and would have been INSERTED as a second
  // copy — putting two sessions on one day. Pair on id first; decide by date
  // second.
  const WIDE = new Date(Date.parse(FROM + 'T00:00:00Z') - 30 * 86400000)
    .toISOString().slice(0, 10);

  const [{ data: pwAll, error: e1 }, { data: ceAll, error: e2 }] = await Promise.all([
    supabase.from('planned_workouts')
      .select('id, scheduled_date, name, workout_type, target_rss, target_duration, completed, activity_id')
      .eq('user_id', USER).gte('scheduled_date', WIDE),
    supabase.from('calendar_entries')
      .select('*').eq('user_id', USER).gte('date', WIDE),
  ]);
  if (e1 || e2) { console.error('Read failed:', (e1 || e2).message); process.exit(1); }

  // Reconcile a row if EITHER side places it at or after FROM.
  const inScope = new Set();
  for (const r of pwAll || []) if (r.scheduled_date >= FROM) inScope.add(r.id);
  for (const r of ceAll || []) if (r.date >= FROM) inScope.add(r.id);
  const pw = (pwAll || []).filter((r) => inScope.has(r.id));
  const ce = (ceAll || []).filter((r) => inScope.has(r.id));

  const ceById = new Map((ce || []).map((r) => [r.id, r]));
  const pwById = new Map((pw || []).map((r) => [r.id, r]));

  const updates = [];   // in both, planned_workouts differs
  const inserts = [];   // only in planned_workouts
  const keeps = [];     // only in calendar_entries (the races)

  for (const p of pw || []) {
    const c = ceById.get(p.id);
    if (!c) { inserts.push(p); continue; }
    const patch = {};
    const shown = [];
    for (const [pf, cf] of WINS) {
      if (differs(p[pf], c[cf])) {
        patch[cf] = p[pf];
        shown.push(`${cf}: ${JSON.stringify(c[cf])} -> ${JSON.stringify(p[pf])}`);
      }
    }
    // completed is expressed as status on the new table.
    const wantStatus = p.completed ? 'done' : (c.status === 'done' ? 'planned' : c.status);
    if (wantStatus !== c.status) {
      patch.status = wantStatus;
      shown.push(`status: ${c.status} -> ${wantStatus}`);
    }
    if (Object.keys(patch).length) updates.push({ id: p.id, before: c, patch, shown });
  }

  for (const c of ce || []) if (!pwById.has(c.id)) keeps.push(c);

  console.log(`\nReconcile ${USER} from ${FROM}`);
  console.log(`  planned_workouts rows : ${(pw || []).length}`);
  console.log(`  calendar_entries rows : ${(ce || []).length}\n`);

  console.log(`CONFLICTS — planned_workouts wins (${updates.length})`);
  if (!updates.length) console.log('  (none)');
  for (const u of updates) {
    console.log(`  ${u.before.date}  ${u.before.title}`);
    for (const s of u.shown) console.log(`      ${s}`);
  }

  console.log(`\nMISSING FROM calendar_entries — will be inserted (${inserts.length})`);
  if (!inserts.length) console.log('  (none)');
  for (const p of inserts) console.log(`  ${p.scheduled_date}  ${p.name}`);

  console.log(`\nONLY IN calendar_entries — kept untouched (${keeps.length})`);
  if (!keeps.length) console.log('  (none)');
  for (const c of keeps) console.log(`  ${c.date}  [${c.type}]  ${c.title}`);

  // /train renders races from race_goals (TrainingCalendar.jsx:301). Every race
  // in race_goals was ALSO copied into calendar_entries by migration 115, under
  // a different id — so a calendar reading both tables shows each of them
  // twice. Report the overlap here; the fix belongs in the reader, not in a
  // delete, because race_goals still owns priority, goal time and target TFI.
  const raceKeeps = keeps.filter((c) => c.type === 'race');
  if (raceKeeps.length) {
    const { data: goals } = await supabase.from('race_goals')
      .select('name, race_date').eq('user_id', USER).gte('race_date', FROM);
    const dupes = (goals || []).filter((g) =>
      raceKeeps.some((c) => c.date === g.race_date));
    if (dupes.length) {
      console.log(`\nWARNING — ${dupes.length} race(s) exist in BOTH race_goals and calendar_entries:`);
      for (const d of dupes) console.log(`  ${d.race_date}  ${d.name}`);
      console.log('  A calendar reading both tables will show these twice.');
      console.log('  Read races from calendar_entries only; leave race_goals for the Race tab.');
    }
  }

  if (!APPLY) {
    console.log('\nDry run. Nothing written. Re-run with --apply once the above reads correctly.');
    return;
  }

  const backupPath = `calendar-reconcile-backup-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(updates.map((u) => u.before), null, 2));
  console.log(`\nBackup of ${updates.length} rows -> ${backupPath}`);

  for (const u of updates) {
    const { error } = await supabase.from('calendar_entries')
      .update(u.patch).eq('id', u.id).eq('user_id', USER);
    if (error) { console.error(`  UPDATE ${u.id} failed: ${error.message}`); process.exit(1); }
  }
  console.log(`Updated ${updates.length}.`);

  if (inserts.length) {
    const rows = [];
    for (const p of inserts) {
      // Slot allocation: never collide with what is already on that day.
      const taken = new Set((ce || []).filter((c) => c.date === p.scheduled_date).map((c) => c.slot));
      let slot = 0; while (taken.has(slot)) slot += 1;
      rows.push({
        id: p.id, user_id: USER, date: p.scheduled_date, slot,
        type: p.workout_type === 'rest' ? 'rest' : 'workout',
        title: p.name || 'Workout', workout_type: p.workout_type || null,
        target_load: p.target_rss ?? null, target_duration_min: p.target_duration ?? null,
        status: p.completed ? 'done' : 'planned',
        activity_id: p.activity_id ?? null, source: 'plan', pinned: false,
      });
    }
    const { error } = await supabase.from('calendar_entries').insert(rows);
    if (error) { console.error(`  INSERT failed: ${error.message}`); process.exit(1); }
    console.log(`Inserted ${rows.length}.`);
  }

  console.log('\nDone. calendar_entries is now the single truth for this athlete.');
}

main().catch((err) => { console.error(err); process.exit(1); });
