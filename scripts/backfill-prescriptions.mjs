#!/usr/bin/env node
/**
 * Backfill session prescriptions onto future calendar entries.
 *
 *   node scripts/backfill-prescriptions.mjs                 # dry run, every athlete
 *   node scripts/backfill-prescriptions.mjs --user <uuid>   # dry run, one athlete
 *   node scripts/backfill-prescriptions.mjs --apply         # write
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
 *
 * WHAT IT TOUCHES: planned workout entries dated today or later, NOT pinned,
 * with no `details.prescription`, whose type the designer builds intervals
 * for (tempo, sweet spot, threshold, VO2, anaerobic, sprint, racing,
 * openers). Endurance, recovery, rest and off-bike entries are left alone;
 * a pinned entry is an athlete's decision and is never redesigned.
 *
 * WHAT IT WRITES: only `details` (merged, the prescription slot). Titles,
 * loads and durations are untouched — the readiness gates are not applied
 * here, because a backfill runs on no particular morning; the coach and the
 * arc refill gate the day when it comes.
 *
 * Dry run by default. Re-runnable: an entry that already carries a
 * prescription is skipped.
 */

import { createClient } from '@supabase/supabase-js';
import { fetchAthleteDesignInputs, toAthleteDesign } from '../api/utils/athleteDesignInputs.js';
import { makeCalendarDesigner } from '../api/utils/designForCalendar.js';
import { withPrescription } from '../api/utils/prescription.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
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

const today = new Date().toISOString().slice(0, 10);

async function candidateUsers() {
  if (ONLY_USER) return [ONLY_USER];
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('user_id')
    .eq('type', 'workout')
    .eq('status', 'planned')
    .eq('pinned', false)
    .gte('date', today);
  if (error) throw new Error(`listing athletes: ${error.message}`);
  return [...new Set((data || []).map((r) => r.user_id))];
}

async function entriesFor(userId) {
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('id, date, type, title, workout_type, target_load, target_duration_min, notes, status, pinned, details, source')
    .eq('user_id', userId)
    .eq('type', 'workout')
    .eq('status', 'planned')
    .eq('pinned', false)
    .gte('date', today)
    .order('date', { ascending: true });
  if (error) throw new Error(`reading entries for ${userId}: ${error.message}`);
  return (data || []).filter((e) => !e.details?.prescription);
}

async function run() {
  const users = await candidateUsers();
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${users.length} athlete(s) with future unpinned planned workouts, as of ${today}`);
  let designed = 0;
  let written = 0;
  let failed = 0;

  for (const userId of users) {
    const entries = await entriesFor(userId);
    if (entries.length === 0) continue;
    const data = await fetchAthleteDesignInputs(supabase, userId);
    // No gates: a backfill is not a morning.
    const athlete = toAthleteDesign(data, { todayStr: today, readinessCall: null });
    athlete.formScore = null;
    athlete.afiGrowth4d = null;
    const design = makeCalendarDesigner({ athlete, todayStr: today, entries });
    if (!design) continue;

    for (const entry of entries) {
      let result;
      try {
        result = design(entry, {});
      } catch (err) {
        failed += 1;
        console.error(`  ${userId} ${entry.date} ${entry.title}: design failed — ${err.message}`);
        continue;
      }
      if (!result?.prescription) continue;
      designed += 1;
      console.log(`  ${userId.slice(0, 8)} ${entry.date} ${entry.title} [${entry.workout_type}] → ${result.summary}`);
      if (!APPLY) continue;
      const { error } = await supabase
        .from('calendar_entries')
        .update({ details: withPrescription(entry.details, result.prescription) })
        .eq('id', entry.id)
        .eq('user_id', userId)
        .eq('pinned', false);
      if (error) {
        failed += 1;
        console.error(`  ${userId} ${entry.id}: write failed — ${error.message}`);
      } else {
        written += 1;
      }
    }
  }

  console.log(`\n${designed} session(s) designed, ${written} written, ${failed} failed.${APPLY ? '' : ' Re-run with --apply to write.'}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
