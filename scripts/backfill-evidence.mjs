#!/usr/bin/env node
/**
 * Backfill fitness_evidence_weekly.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run backfill:evidence -- --weeks 12
 *   ...                                       npm run backfill:evidence -- --weeks 12 --dry-run
 *   ...                                       npm run backfill:evidence -- --user <uuid>
 *
 * NOT RUN, BY DECISION (2026-09-02). Evidence history begins with the first
 * cron run after the table was created; there is deliberately no data before
 * the week of 2026-08-31. If you are looking at the gap and wondering whether
 * something is broken — it isn't, and this is the note saying so.
 *
 * The reasoning: the only cost of skipping was that deriveSpeakingCue
 * (api/utils/evidenceCoachSection.js) reads a first verdict with no prior
 * history as a TRANSITION, which the coach may mention once. That lands as a
 * brief, true, one-time line — and only for athletes whose verdict is 'ahead',
 * since 'consistent' says nothing, 'insufficient_data' is silent, and 'behind'
 * needs three consecutive weeks before the coach reacts at all. It self-heals
 * after about four weeks of normal runs.
 *
 * The script stays because it stays USEFUL, not because it is pending. Every
 * verdict derives from `activities`, which is intact, so history remains
 * reconstructible indefinitely — running this in six months produces the same
 * rows it would have produced today. Reach for it if you ever want to analyse
 * past verdicts, or to re-seed after a schema change to the engine.
 *
 * Background: migration 106 was committed 2026-08-03 and never applied, so the
 * weekly cron failed on every athlete until 2026-09-02.
 *
 * Twelve weeks is the useful default: api/coach.js reads the last 9.
 *
 * Weeks are computed OLDEST FIRST on purpose — computeAndUpsertWeek reads the
 * previous week's stored verdict to apply hysteresis, so running backwards
 * would silently lose the ahead/behind damping.
 *
 * Reuses computeAndUpsertWeek from the endpoint rather than reimplementing it:
 * a backfill that computes verdicts differently from the cron is worse than no
 * backfill, because the difference only shows up as an inexplicable jump.
 */

const DAY = 86400000;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const WEEKS = Number(arg('weeks', '12'));
const ONLY_USER = arg('user');
const DRY_RUN = has('dry-run');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('backfill-evidence: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.');
  process.exit(2);
}
if (!Number.isInteger(WEEKS) || WEEKS < 1 || WEEKS > 104) {
  console.error('backfill-evidence: --weeks must be an integer between 1 and 104.');
  process.exit(2);
}

// Imported AFTER the credential check, not at the top: api/evidence-weekly.js
// builds the admin client at module load, so a static import throws
// "supabaseUrl is required" before the friendly message above can print.
const { computeAndUpsertWeek, mondayOf, latestCompleteWeek } = await import('../api/evidence-weekly.js');
const { getSupabaseAdmin } = await import('../api/utils/supabaseAdmin.js');
const { findActiveUserIds } = await import('../api/utils/trainingLoadRecompute.js');

const supabase = getSupabaseAdmin();

const lastWeek = latestCompleteWeek();
const weeks = [];
for (let i = WEEKS - 1; i >= 0; i--) {
  weeks.push(new Date(Date.parse(`${lastWeek}T00:00:00Z`) - i * 7 * DAY).toISOString().slice(0, 10));
}

const userIds = ONLY_USER ? [ONLY_USER] : await findActiveUserIds(supabase);

console.log(
  `${DRY_RUN ? '[dry run] ' : ''}${userIds.length} athlete(s) × ${weeks.length} week(s) ` +
  `(${mondayOf(weeks[0])} … ${weeks[weeks.length - 1]})\n`
);

const totals = { computed: 0, skipped: 0, errors: 0 };
const verdictCounts = {};

for (const [n, userId] of userIds.entries()) {
  const per = { computed: 0, skipped: 0, errors: 0 };
  for (const week of weeks) {
    if (DRY_RUN) { per.skipped++; continue; }
    try {
      const r = await computeAndUpsertWeek(supabase, userId, week);
      if (r.skipped) {
        per.skipped++;
      } else {
        per.computed++;
        verdictCounts[r.verdict.verdict] = (verdictCounts[r.verdict.verdict] || 0) + 1;
      }
    } catch (err) {
      per.errors++;
      console.error(`  ${userId} ${week}: ${err.message}`);
    }
  }
  totals.computed += per.computed;
  totals.skipped += per.skipped;
  totals.errors += per.errors;
  console.log(
    `[${String(n + 1).padStart(3)}/${userIds.length}] ${userId}  ` +
    `computed ${per.computed}  skipped ${per.skipped}  errors ${per.errors}`
  );
}

console.log('\n' + JSON.stringify({ ...totals, verdicts: verdictCounts }, null, 2));

// Same reasoning as the cron's failure threshold: a schema or credential fault
// fails everything at once and must not exit 0.
const attempted = totals.computed + totals.skipped + totals.errors;
if (attempted > 0 && totals.errors / attempted >= 0.5) {
  console.error('\nMost of the backfill failed — not treating this as success.');
  process.exit(1);
}
