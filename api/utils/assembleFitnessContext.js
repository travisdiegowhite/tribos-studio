/**
 * Fitness Context Assembly
 *
 * Builds a structured context object from the athlete's data for the AI
 * fitness summary generator. Runs server-side only.
 *
 * Key feature: spike guard — detects when an ATL dip is from missed rides
 * (not recovery) and flags it so the AI doesn't misinterpret the data.
 */

import {
  derivePhase,
  derivePhaseFromBlocks,
  deriveCurrentWeek,
  formatWeekSchedule,
  weekScheduleToText,
  formatHealth,
  fetchProprietaryMetrics,
  formatDateInTz,
  getDayOfWeekInTz,
} from './contextHelpers.js';
import { fetchPlannedSessions } from './calendarRead.js';

// Re-export for fitness-summary.js's cache-key date dimension (the helper now
// lives in contextHelpers.js so checkInContext.js can share it).
export { formatDateInTz };

/**
 * @param {string} userId
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ctl: number, atl: number, tsb: number, lastRideTss?: number, ctlDeltaPct?: number|null }} clientMetrics
 *   - ctlDeltaPct: 28-day CTL change as a percentage (same value the Trend
 *     card on the dashboard displays). When provided, this drives the
 *     trend direction authoritatively — keeping the coach's narrative
 *     in sync with what the user sees.
 * @param {{ rideId?: string }} [options]
 * @param {string} [timezone] - IANA timezone (e.g. 'America/Denver'). Defaults to 'America/New_York'.
 * @returns {Promise<object>} FitnessContext
 */
export async function assembleFitnessContext(userId, supabase, clientMetrics, options = {}, timezone = 'America/New_York') {
  const now = new Date();
  const today = formatDateInTz(now, timezone);

  // 28 days ago (in user's timezone)
  const twentyEightDaysAgo = new Date(now);
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
  const twentyEightDaysAgoStr = formatDateInTz(twentyEightDaysAgo, timezone);

  // Start of current week (Monday) — in user's timezone
  const dayOfWeek = getDayOfWeekInTz(now, timezone); // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  const weekStartStr = formatDateInTz(weekStart, timezone);

  // End of current week (next Monday, exclusive upper bound)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = formatDateInTz(weekEnd, timezone);

  // 7 days from now (in user's timezone)
  const sevenDaysOut = new Date(now);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const sevenDaysOutStr = formatDateInTz(sevenDaysOut, timezone);

  // Pre-fetch active training plan IDs (planned_workouts has no user_id column;
  // must join through training_plans to scope workouts to this user)
  const { data: activePlans } = await supabase
    .from('training_plans')
    .select('id, name, current_week, duration_weeks, methodology, goal, start_date, started_at, blocks')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  const planIds = (activePlans || []).map(p => p.id);
  const primaryPlan = (activePlans && activePlans.length > 0) ? activePlans[0] : null;

  // Derive the REAL current week from the plan's start date — the stored
  // current_week column was historically never advanced past 1.
  const computedWeek = primaryPlan ? deriveCurrentWeek(primaryPlan, today) : null;

  // Run all queries in parallel
  // Three of these used to be plan-scoped (`plan_id IN (...)`), which meant a
  // coach- or calendar-created session was invisible to the coach's own fitness
  // context, and an athlete with no active plan had an empty week and no
  // upcoming sessions at all. They are athlete-scoped now, and unconditional.
  const [
    activitiesResult,
    weekActivitiesResult,
    weekPlanned,
    coachResult,
    upcomingWorkouts,
    profileResult,
    weekScheduleRawRows,
    raceGoalResult,
    healthResult,
  ] = await Promise.all([
    // 1. Last 28 days of activities for trend calculation
    supabase
      .from('activities')
      .select('start_date, rss, moving_time, average_watts, effective_power')
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .gte('start_date', twentyEightDaysAgo.toISOString())
      .order('start_date', { ascending: true }),

    // 2. This week's completed activities (for spike guard)
    supabase
      .from('activities')
      .select('id, start_date')
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .gte('start_date', weekStart.toISOString()),

    // 3. This week's planned sessions (full Mon-Sun, load-bearing ones only —
    //    matches the Dashboard's count). weekEndStr stays EXCLUSIVE.
    fetchPlannedSessions(userId, { from: weekStartStr, to: weekEndStr }).then((rows) =>
      rows.filter((w) => w.scheduled_date < weekEndStr && (w.target_rss ?? 0) > 0),
    ),

    // 4. Last 6 coach messages (3 exchanges)
    supabase
      .from('coach_conversations')
      .select('role, message, timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(6),

    // 5. Upcoming key sessions (next 7 days). Ordered by load in JS rather than
    //    SQL because the reader's own ordering is by date, and "key" means the
    //    three biggest days regardless of when they fall.
    fetchPlannedSessions(userId, {
      from: today,
      to: sevenDaysOutStr,
      includeCompleted: false,
    }).then((rows) =>
      [...rows].sort((a, b) => (b.target_rss ?? 0) - (a.target_rss ?? 0)).slice(0, 3),
    ),

    // 6. Athlete profile
    supabase
      .from('user_profiles')
      .select('ftp, weight_kg, experience_level, timezone')
      .eq('id', userId)
      .single(),

    // 7. The full current week with session names. Filtered by date, never by
    //    week_number — those stamps were unreliable (coach-inserted rows were
    //    stamped 1 regardless of date), which is why the calendar derives the
    //    week from the date instead of storing it.
    fetchPlannedSessions(userId, {
      from: weekStartStr,
      to: weekEndStr,
      planStart: primaryPlan?.start_date ?? primaryPlan?.started_at ?? null,
    }).then((rows) => rows.filter((w) => w.scheduled_date < weekEndStr)),

    // 8. Upcoming race goal (highest priority)
    supabase
      .from('race_goals')
      .select('name, race_date, race_type, priority')
      .eq('user_id', userId)
      .eq('status', 'upcoming')
      .order('priority', { ascending: true })
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle(),

    // 9. Latest health metrics
    supabase
      .from('health_metrics')
      .select('resting_hr, hrv_ms, sleep_hours, energy_level, recorded_date')
      .eq('user_id', userId)
      .order('recorded_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const activities = activitiesResult.data || [];
  const weekActivities = weekActivitiesResult.data || [];
  // Already filtered to load-bearing sessions in this week above.
  const coachMsgs = coachResult.data || [];
  // Already narrowed to the three biggest days above.
  const profile = profileResult.data || {};
  const weekScheduleRaw = weekScheduleRawRows || [];
  const raceGoal = raceGoalResult.data || null;
  const healthData = healthResult.data || null;

  // --- Training plan phase & week schedule ---
  // Blocks-first: an arc plan's blocks say exactly which phase today falls in;
  // the week-ratio heuristic is only a fallback for non-arc plans.
  const phase = primaryPlan
    ? (derivePhaseFromBlocks(primaryPlan.blocks, today)
        || derivePhase(computedWeek, primaryPlan.duration_weeks, primaryPlan.methodology))
    : null;
  const weekSchedule = formatWeekSchedule(weekScheduleRaw);
  const weekScheduleText = weekScheduleToText(weekSchedule);

  // --- CTL trend calculation (28-day delta) ---
  // Prefer the frontend-computed ctlDeltaPct (same source the Trend card uses).
  // Fall back to the activity-TSS heuristic only when unavailable.
  const ctlTrend = calculateCTLTrend(activities, clientMetrics.ctl, clientMetrics.ctlDeltaPct);

  // --- ATL/CTL ratio ---
  const atlCtlRatio = clientMetrics.ctl > 0
    ? parseFloat((clientMetrics.atl / clientMetrics.ctl).toFixed(2))
    : 1.0;

  // --- TSB range over 28 days ---
  const tsbRange = calculateTSBRange(activities);

  // --- Spike guard: missed rides detection ---
  const completedThisWeek = weekActivities.length;
  const plannedThisWeek = weekPlanned.length;
  const daysIntoWeek = mondayOffset; // 0=Mon, 6=Sun
  const weekComplete = daysIntoWeek >= 5; // Friday or later
  const missedRidesFlag = !weekComplete && plannedThisWeek > 0 && completedThisWeek < plannedThisWeek - 1;

  // --- Days since last ride ---
  // Compare calendar dates in the user's timezone (not UTC instants) so that
  // "yesterday" doesn't read as "today" for users far from UTC.
  const lastActivity = activities.length > 0 ? activities[activities.length - 1] : null;
  const daysSinceLastRide = lastActivity
    ? Math.floor(
        (new Date(today + 'T12:00:00Z').getTime() -
         new Date(formatDateInTz(new Date(lastActivity.start_date), timezone) + 'T12:00:00Z').getTime())
        / (1000 * 60 * 60 * 24))
    : 99;

  // --- Coach summary ---
  const coachSummary = summarizeCoachThread(coachMsgs);

  // --- Upcoming key workout ---
  const keyWorkout = upcomingWorkouts.find(w =>
    w.target_tss >= 100 ||
    ['threshold', 'vo2max', 'race'].includes(w.workout_type)
  ) || upcomingWorkouts[0] || null;

  // --- Athlete profile ---
  const ftp = profile.ftp || 200;
  const weightKg = profile.weight_kg || 75;

  // --- Proprietary metrics (EFI, TWL, TCAS) ---
  const proprietaryMetrics = await fetchProprietaryMetrics(supabase, userId);

  return {
    snapshot: {
      ctl: clientMetrics.ctl,
      atl: clientMetrics.atl,
      tsb: clientMetrics.tsb,
      last_ride_tss: clientMetrics.lastRideTss || null,
    },
    trends: {
      // Authoritative 28-day CTL change as a %, matching the Trend card.
      // When the coach references the trend, it should use this number.
      ctl_delta_pct: ctlTrend.delta_pct,
      ctl_direction: ctlTrend.direction,
      atl_ctl_ratio: atlCtlRatio,
      tsb_range_28d: tsbRange,
    },
    data_quality: {
      rides_completed_this_week: completedThisWeek,
      rides_planned_this_week: plannedThisWeek,
      week_complete: weekComplete,
      missed_rides_flag: missedRidesFlag,
      days_since_last_ride: daysSinceLastRide,
    },
    coach_context: {
      summary: coachSummary,
      upcoming_key_workout: keyWorkout ? keyWorkout.workout_type : null,
      upcoming_key_workout_date: keyWorkout ? keyWorkout.scheduled_date : null,
    },
    athlete: {
      ftp,
      weight_kg: weightKg,
      wkg: parseFloat((ftp / weightKg).toFixed(1)),
      experience_level: profile.experience_level || 'intermediate',
    },
    proprietary_metrics: proprietaryMetrics,
    plan: primaryPlan ? {
      name: primaryPlan.name,
      methodology: primaryPlan.methodology,
      goal: primaryPlan.goal,
      current_week: computedWeek,
      total_weeks: primaryPlan.duration_weeks,
      block: phase.blockName,
      block_purpose: phase.blockPurpose,
    } : null,
    week_schedule: weekScheduleText,
    race_goal: raceGoal
      ? `${raceGoal.name} (${raceGoal.race_type}, ${raceGoal.race_date}, Priority ${raceGoal.priority})`
      : null,
    health: healthData ? formatHealth(healthData) : null,
  };
}

/**
 * Estimate the 28-day CTL trend.
 *
 * Preferred path: use `clientDeltaPct` — the same ctlDeltaPct the frontend
 * computes for the Trend card (current CTL vs CTL-28-days-ago). Thresholds
 * mirror `translateTrend()` in src/lib/fitness/translate.ts so the coach's
 * narrative stays in lockstep with what the user sees on the card.
 *
 * Fallback path (legacy, when clientDeltaPct is not provided): a rough
 * early-half-vs-late-half TSS density heuristic. This can disagree with
 * the card and should not be relied on — it's kept only for callers that
 * don't pass the authoritative number yet.
 */
function calculateCTLTrend(activities, currentCTL, clientDeltaPct) {
  // --- Preferred: use the same number the Trend card renders ---
  if (typeof clientDeltaPct === 'number' && Number.isFinite(clientDeltaPct)) {
    // Thresholds mirror src/lib/fitness/translate.ts translateTrend():
    //   > 8%  → Building
    //   > 2%  → Maintaining (up)
    //   >= -2% → Maintaining (holding steady)
    //   < -2% → Recovering
    let direction;
    if (clientDeltaPct > 8) direction = 'building';
    else if (clientDeltaPct > 2) direction = 'maintaining';
    else if (clientDeltaPct >= -2) direction = 'holding';
    else direction = 'recovering';

    return {
      delta_pct: clientDeltaPct, // raw % for downstream use
      direction,
    };
  }

  // --- Fallback: legacy heuristic (only when client didn't supply delta) ---
  if (activities.length < 3) {
    return { delta_pct: null, direction: 'holding' };
  }

  const midpoint = Math.floor(activities.length / 2);
  const earlyActivities = activities.slice(0, midpoint);
  const earlyAvgTSS = earlyActivities.reduce((sum, a) => sum + (a.rss || estimateTSS(a)), 0) / Math.max(earlyActivities.length, 1);
  const lateActivities = activities.slice(midpoint);
  const lateAvgTSS = lateActivities.reduce((sum, a) => sum + (a.rss || estimateTSS(a)), 0) / Math.max(lateActivities.length, 1);

  const delta = Math.round(lateAvgTSS - earlyAvgTSS);
  const direction = delta > 3 ? 'building' : delta < -3 ? 'declining' : 'holding';

  return { delta_pct: null, direction };
}

/**
 * Calculate TSB range over the activity window.
 * Approximates daily TSB from cumulative TSS.
 */
function calculateTSBRange(activities) {
  if (activities.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }

  // Simple EWA-based TSB approximation
  let ctl = 0;
  let atl = 0;
  const tsbValues = [];

  for (const activity of activities) {
    const tss = activity.rss || estimateTSS(activity);
    ctl = ctl + (tss - ctl) / 42;
    atl = atl + (tss - atl) / 7;
    tsbValues.push(Math.round(ctl - atl));
  }

  return {
    min: Math.min(...tsbValues),
    max: Math.max(...tsbValues),
    avg: Math.round(tsbValues.reduce((a, b) => a + b, 0) / tsbValues.length),
  };
}

/**
 * Estimate TSS from activity data when TSS is not provided.
 */
function estimateTSS(activity) {
  const hours = (activity.moving_time || 0) / 3600;
  if (activity.effective_power && activity.average_watts) {
    const ftp = 200; // fallback FTP
    const intensityFactor = activity.effective_power / ftp;
    return Math.round(hours * intensityFactor * intensityFactor * 100);
  }
  return Math.round(hours * 50);
}

/**
 * Condenses the last 3 coach exchanges into a single summary string.
 * Keeps token count low. Do not pass raw message array to Claude.
 */
function summarizeCoachThread(msgs) {
  if (!msgs || msgs.length === 0) return 'No recent coach conversation.';

  const recent = msgs.slice(0, 6).reverse();
  return recent
    .map(m => `${m.role === 'assistant' || m.role === 'coach' ? 'Coach' : 'Athlete'}: ${(m.message || '').slice(0, 120)}`)
    .join(' | ');
}

/**
 * Build a cache key from the meaningful fields of the context.
 * Excludes coach_summary and generated_at to avoid unnecessary regeneration.
 *
 * `localDate` (the athlete-local YYYY-MM-DD) bounds staleness at local
 * midnight — a new day always regenerates the summary even when the raw
 * numbers happen to match. The rounded trend percent is keyed so a swing
 * like −3% → −24% (both "recovering") can't serve frozen text; rounding
 * mirrors the client's fetch key in FitnessSummary.jsx.
 */
export function buildCacheKey(context, localDate = null) {
  const deltaPct = context.trends.ctl_delta_pct;
  const parts = [
    localDate || 'nodate',
    context.snapshot.ctl,
    context.snapshot.atl,
    context.snapshot.tsb,
    context.snapshot.last_ride_tss || 0,
    context.trends.ctl_direction,
    typeof deltaPct === 'number' && Number.isFinite(deltaPct) ? Math.round(deltaPct) : 'na',
    context.data_quality.missed_rides_flag ? 1 : 0,
    context.data_quality.rides_completed_this_week,
    context.coach_context.upcoming_key_workout || 'none',
    context.week_schedule || 'none',
  ];
  return parts.join(':');
}
