/**
 * Adaptive arc refill (Increment B2, tight slice).
 *
 * Recomputes the next 7 days of the athlete's active living arc and eases the
 * upcoming quality sessions when they are carrying fatigue (readiness gating).
 * Stateless + reversible: easing auto-reverts when Form Score recovers. No LLM.
 *
 * POST /api/arc-refill
 * Body: { userLocalDate?: 'YYYY-MM-DD', force?: boolean, mode?: 'full' }
 *   mode: 'full' widens the window from 7 days to the arc's entire remaining
 *   horizon (today → last block end), inserts rows for dates that have none,
 *   and bypasses the 15-min guard. Readiness gating still only applies to the
 *   next 7 days. Used to rebuild a plan after generator fixes.
 * Auth: Bearer <JWT>
 * Returns: { changes: [...], count, skipped? }
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { computeArcRefill, computeDailyStatsFromActivities } from './utils/arcRefill.js';
import { coefficientsForMode } from './utils/sequencerBlockOps.js';
import { deriveCurrentWeek, derivePhaseFromBlocks } from './utils/contextHelpers.js';
import { buildRaceDemand } from './utils/raceDemand.js';

const supabase = getSupabaseAdmin();

const WINDOW_DAYS = 7;
const REFILL_GUARD_MS = 15 * 60 * 1000; // skip recompute if refreshed in the last 15 min

function addDaysIso(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Build the resolved availability shape the arc helpers expect, from the DB.
// Mirrors coach.js's server-side resolution.
async function fetchAvailability(userId) {
  const [dayRes, prefRes] = await Promise.all([
    supabase
      .from('user_day_availability')
      .select('day_of_week, is_blocked, is_preferred')
      .eq('user_id', userId),
    supabase
      .from('user_training_preferences')
      .select('prefer_weekend_long_rides, prefer_weekend_long_runs, max_workouts_per_week')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  const dayRows = dayRes?.data || [];
  const prefs = prefRes?.data || null;
  if (dayRows.length === 0 && !prefs) return null;
  const weeklyAvailability = [];
  for (let d = 0; d < 7; d++) {
    const row = dayRows.find((r) => r.day_of_week === d);
    weeklyAvailability.push({
      dayOfWeek: d,
      status: row ? (row.is_blocked ? 'blocked' : row.is_preferred ? 'preferred' : 'available') : 'available',
    });
  }
  return {
    weeklyAvailability,
    preferences: prefs
      ? {
          preferWeekendLongRides: prefs.prefer_weekend_long_rides,
          preferWeekendLongRuns: prefs.prefer_weekend_long_runs,
          maxWorkoutsPerWeek: prefs.max_workouts_per_week,
        }
      : {},
  };
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const userId = user.id;
  const fullMode = req.body?.mode === 'full';
  const force = req.body?.force === true || fullMode;
  const windowStart = (req.body?.userLocalDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

  try {
    // 0. Week/phase sync — keep training_plans.current_week / current_phase
    //    honest for every active plan. current_week is written as 1 at creation
    //    and was historically never advanced (the coach said "week 1" forever);
    //    this is the single server-side writer that corrects it. Runs before
    //    the arc-only early-returns so non-arc plans sync too, and before the
    //    15-min guard so a stale week never survives a guarded run.
    try {
      const { data: allActive } = await supabase
        .from('training_plans')
        .select('id, start_date, started_at, duration_weeks, current_week, current_phase, blocks')
        .eq('user_id', userId)
        .eq('status', 'active');
      const syncWrites = (allActive || [])
        .map((p) => {
          const week = deriveCurrentWeek(p, windowStart);
          const phase = derivePhaseFromBlocks(p.blocks, windowStart);
          const patch = {};
          if (week !== p.current_week) patch.current_week = week;
          if (phase && phase.blockType !== p.current_phase) patch.current_phase = phase.blockType;
          return Object.keys(patch).length > 0
            ? supabase.from('training_plans').update(patch).eq('id', p.id)
            : null;
        })
        .filter(Boolean);
      if (syncWrites.length > 0) await Promise.all(syncWrites);
    } catch (syncErr) {
      console.error('arc-refill week/phase sync failed (non-fatal):', syncErr);
    }

    // 1. Resolve the active living arc (primary, ai_arc, has blocks).
    const { data: plan } = await supabase
      .from('training_plans')
      .select('id, start_date, target_event_date, tier, blocks, last_refill_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('priority', 'primary')
      .eq('template_id', 'ai_arc')
      .not('blocks', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!plan?.blocks) {
      return res.status(200).json({ changes: [], count: 0, skipped: 'no_active_arc' });
    }

    // Cheap perf backstop (not a correctness guard — core is only-write-on-diff).
    if (!force && plan.last_refill_at && Date.now() - new Date(plan.last_refill_at).getTime() < REFILL_GUARD_MS) {
      return res.status(200).json({ changes: [], count: 0, skipped: 'recently_refilled' });
    }

    // Window: 7 days normally; the arc's whole remaining horizon in full mode.
    let windowDays = WINDOW_DAYS;
    if (fullMode) {
      const lastBlockEnd = (plan.blocks || []).reduce(
        (max, b) => (b?.end_date && b.end_date > max ? b.end_date : max),
        windowStart,
      );
      windowDays = Math.max(
        WINDOW_DAYS,
        Math.round((new Date(lastBlockEnd + 'T00:00:00Z') - new Date(windowStart + 'T00:00:00Z')) / 86400000) + 1,
      );
    }
    const windowEnd = addDaysIso(windowStart, windowDays - 1);

    // 2. Build the gating ctx. Fitness (FS/AFI) is computed from activities — the
    //    same activity-derived EWMA the client TodayGlance shows — because
    //    training_load_daily has no server writer and is empty (overlaid here only
    //    if/when it is ever populated). See computeDailyStatsFromActivities.
    const ninetyAgo = addDaysIso(windowStart, -90);
    const [{ data: activities }, { data: profile }, { data: serverHistory }, { data: raceGoals }] = await Promise.all([
      supabase
        .from('activities')
        .select('start_date, rss, tss, moving_time, distance, total_elevation_gain, average_watts, effective_power, normalized_power, kilojoules, type, sport_type, average_heartrate')
        .eq('user_id', userId)
        .is('duplicate_of', null)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .gte('start_date', ninetyAgo)
        .order('start_date', { ascending: true })
        .limit(500),
      supabase.from('user_profiles').select('recovery_mode, ftp').eq('id', userId).maybeSingle(),
      supabase
        .from('training_load_daily')
        .select('date, tfi, afi, form_score')
        .eq('user_id', userId)
        .gte('date', ninetyAgo)
        .lte('date', windowStart),
      supabase
        .from('race_goals')
        .select('name, race_date, priority, race_type, distance_km, elevation_gain_m, goal_time_minutes')
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .gte('race_date', windowStart)
        .order('race_date', { ascending: true }),
    ]);

    const gatingCtx = {
      daily_stats: computeDailyStatsFromActivities(activities || [], profile?.ftp, windowStart, serverHistory || []),
      subjective: [], // HRV/wellness rules deferred — kept inert
      coefficients: coefficientsForMode(profile?.recovery_mode || 'standard'),
    };

    // 3. Generation ctx — byte-parity with how the arc was activated (coach.js
    //    arc path): same event fields, same race_demand. Resolve the arc's
    //    target race by target_event_date, falling back to the soonest
    //    upcoming race (fetchUpcomingRaces order in coach.js).
    const targetRace =
      (raceGoals || []).find((r) => r.race_date === plan.target_event_date) ||
      (raceGoals || [])[0] ||
      null;
    const tier = plan.tier || 'A';
    const genCtx = {
      coefficients: undefined,
      upcoming_events: [{
        tier,
        date: plan.target_event_date,
        name: targetRace?.name || null,
        race_type: targetRace?.race_type || null,
      }],
      race_demand: targetRace ? buildRaceDemand({ ...targetRace, tier }) : null,
    };

    const availability = await fetchAvailability(userId);

    // 4. Existing arc rows in the window.
    const { data: existingRows } = await supabase
      .from('planned_workouts')
      .select('id, scheduled_date, source, completed, workout_type, name, target_rss, target_duration, duration_minutes, notes, adjustment_reason, phase')
      .eq('plan_id', plan.id)
      .gte('scheduled_date', windowStart)
      .lte('scheduled_date', windowEnd);

    // 5. Compute (pure). Readiness gating stays confined to the next 7 days
    //    even in full mode — today's Form Score must not ease September.
    const { upserts, changes } = computeArcRefill({
      blocks: plan.blocks,
      planStartDate: plan.start_date,
      windowStart,
      windowDays,
      gatingCtx,
      genCtx,
      availability,
      existingRows: existingRows || [],
      gatingWindowDays: WINDOW_DAYS,
      allowInserts: fullMode,
    });

    // 6. Apply as targeted updates (never an onConflict upsert over an existing
    //    row — that would wipe activity_id / actual_* / completed_at).
    await Promise.all(
      upserts
        .filter((u) => u.id)
        .map((u) =>
          supabase
            .from('planned_workouts')
            .update({
              workout_type: u.workout_type,
              name: u.name,
              target_rss: u.target_rss, // dual-write
              target_tss: u.target_tss,
              target_duration: u.target_duration,
              duration_minutes: u.duration_minutes,
              notes: u.notes,
              adjustment_reason: u.adjustment_reason,
            })
            .eq('id', u.id)
            .eq('user_id', userId),
        ),
    );

    // 6b. Full mode only: insert rows for dates that had none. The unique
    //     (plan_id, scheduled_date) constraint + ignoreDuplicates makes a race
    //     with a concurrent insert harmless (we never overwrite).
    const inserts = upserts
      .filter((u) => !u.id)
      .map((u) => ({ ...u, plan_id: plan.id, user_id: userId }));
    if (inserts.length > 0) {
      const { error: insertErr } = await supabase
        .from('planned_workouts')
        .upsert(inserts, { onConflict: 'plan_id,scheduled_date', ignoreDuplicates: true });
      if (insertErr) {
        console.error('arc-refill: insert of missing arc days failed:', insertErr.message);
      }
    }

    // 7. Stamp the refill time (perf backstop).
    await supabase.from('training_plans').update({ last_refill_at: new Date().toISOString() }).eq('id', plan.id);

    if (changes.length > 0) {
      console.log(`🔄 arc-refill: eased/restored ${changes.length} session(s) for plan ${plan.id}.`);
    }
    return res.status(200).json({ changes, count: changes.length });
  } catch (err) {
    console.error('arc-refill failed:', err);
    return res.status(500).json({ error: 'arc_refill_failed' });
  }
}
