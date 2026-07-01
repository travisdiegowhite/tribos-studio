/**
 * Adaptive arc refill (Increment B2, tight slice).
 *
 * Recomputes the next 7 days of the athlete's active living arc and eases the
 * upcoming quality sessions when they are carrying fatigue (readiness gating).
 * Stateless + reversible: easing auto-reverts when Form Score recovers. No LLM.
 *
 * POST /api/arc-refill
 * Body: { userLocalDate?: 'YYYY-MM-DD', force?: boolean }
 * Auth: Bearer <JWT>
 * Returns: { changes: [...], count, skipped? }
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { computeArcRefill, computeDailyStatsFromActivities } from './utils/arcRefill.js';
import { coefficientsForMode } from './utils/sequencerBlockOps.js';

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
  const force = req.body?.force === true;
  const windowStart = (req.body?.userLocalDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const windowEnd = addDaysIso(windowStart, WINDOW_DAYS - 1);

  try {
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

    // 2. Build the gating ctx. Fitness (FS/AFI) is computed from activities — the
    //    same activity-derived EWMA the client TodayGlance shows — because
    //    training_load_daily has no server writer and is empty (overlaid here only
    //    if/when it is ever populated). See computeDailyStatsFromActivities.
    const ninetyAgo = addDaysIso(windowStart, -90);
    const [{ data: activities }, { data: profile }, { data: serverHistory }] = await Promise.all([
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
    ]);

    const gatingCtx = {
      daily_stats: computeDailyStatsFromActivities(activities || [], profile?.ftp, windowStart, serverHistory || []),
      subjective: [], // HRV/wellness rules deferred — kept inert
      coefficients: coefficientsForMode(profile?.recovery_mode || 'standard'),
    };

    // 3. Generation ctx — byte-parity with how the arc was activated (coach.js arc path).
    const genCtx = {
      coefficients: undefined,
      upcoming_events: [{ tier: plan.tier || 'A', date: plan.target_event_date }],
    };

    const availability = await fetchAvailability(userId);

    // 4. Existing arc rows in the window.
    const { data: existingRows } = await supabase
      .from('planned_workouts')
      .select('id, scheduled_date, source, completed, workout_type, name, target_rss, target_duration, duration_minutes, notes, adjustment_reason, phase')
      .eq('plan_id', plan.id)
      .gte('scheduled_date', windowStart)
      .lte('scheduled_date', windowEnd);

    // 5. Compute (pure).
    const { upserts, changes } = computeArcRefill({
      blocks: plan.blocks,
      planStartDate: plan.start_date,
      windowStart,
      windowDays: WINDOW_DAYS,
      gatingCtx,
      genCtx,
      availability,
      existingRows: existingRows || [],
    });

    // 6. Apply as targeted updates (never an onConflict upsert — that would wipe
    //    activity_id / actual_* / completed_at on the row).
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
