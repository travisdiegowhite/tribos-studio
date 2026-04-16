/**
 * Fitness Context Assembly
 *
 * Builds a structured context object from the athlete's data for the AI
 * fitness summary generator. Runs server-side only.
 *
 * Key feature: spike guard — detects when an ATL dip is from missed rides
 * (not recovery) and flags it so the AI doesn't misinterpret the data.
 */

import { derivePhase, formatWeekSchedule, weekScheduleToText, formatHealth, fetchProprietaryMetrics } from './contextHelpers.js';

/**
 * Format a Date as YYYY-MM-DD in the given IANA timezone.
 * Falls back to UTC ISO date if the timezone is invalid.
 */
function formatDateInTz(date, tz) {
  try {
    // en-CA locale yields YYYY-MM-DD format
    return date.toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Get the day-of-week number (0=Sun..6=Sat) in the given IANA timezone.
 * Falls back to the server's local day if the timezone is invalid.
 */
function getDayOfWeekInTz(date, tz) {
  try {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz });
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[dayName] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}

/**
 * @param {string} userId
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ctl: number, atl: number, tsb: number, lastRideTss?: number }} clientMetrics
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
    .select('id, name, current_week, duration_weeks, methodology, goal')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  const planIds = (activePlans || []).map(p => p.id);
  const primaryPlan = (activePlans && activePlans.length > 0) ? activePlans[0] : null;

  // Run all queries in parallel
  const [
    activitiesResult,
    weekActivitiesResult,
    weekPlannedResult,
    coachResult,
    upcomingWorkoutsResult,
    profileResult,
    weekScheduleResult,
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

    // 3. This week's planned workouts (full Mon-Sun, excl. rest days — matches Dashboard)
    planIds.length > 0
      ? supabase
          .from('planned_workouts')
          .select('id, scheduled_date, completed')
          .in('plan_id', planIds)
          .gte('scheduled_date', weekStartStr)
          .lt('scheduled_date', weekEndStr)
          .gt('target_tss', 0)
      : Promise.resolve({ data: [] }),

    // 4. Last 6 coach messages (3 exchanges)
    supabase
      .from('coach_conversations')
      .select('role, message, timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(6),

    // 5. Upcoming key workouts (next 7 days, high TSS or specific types)
    planIds.length > 0
      ? supabase
          .from('planned_workouts')
          .select('scheduled_date, workout_type, target_tss')
          .in('plan_id', planIds)
          .gte('scheduled_date', today)
          .lte('scheduled_date', sevenDaysOutStr)
          .eq('completed', false)
          .order('target_tss', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),

    // 6. Athlete profile
    supabase
      .from('user_profiles')
      .select('ftp, weight_kg, experience_level, timezone')
      .eq('id', userId)
      .single(),

    // 7. Full week schedule with workout names (for primary plan's current week)
    primaryPlan
      ? supabase
          .from('planned_workouts')
          .select('day_of_week, scheduled_date, name, workout_type, target_tss, actual_tss, completed, activity_id')
          .eq('plan_id', primaryPlan.id)
          .eq('week_number', primaryPlan.current_week || 1)
      : Promise.resolve({ data: [] }),

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
  const weekPlanned = weekPlannedResult.data || [];
  const coachMsgs = coachResult.data || [];
  const upcomingWorkouts = upcomingWorkoutsResult.data || [];
  const profile = profileResult.data || {};
  const weekScheduleRaw = weekScheduleResult.data || [];
  const raceGoal = raceGoalResult.data || null;
  const healthData = healthResult.data || null;

  // --- Training plan phase & week schedule ---
  const phase = primaryPlan
    ? derivePhase(primaryPlan.current_week, primaryPlan.duration_weeks, primaryPlan.methodology)
    : null;
  const weekSchedule = formatWeekSchedule(weekScheduleRaw);
  const weekScheduleText = weekScheduleToText(weekSchedule);

  // --- CTL trend calculation (28-day delta) ---
  const ctlTrend = calculateCTLTrend(activities, clientMetrics.ctl);

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
      ctl_delta_28d: ctlTrend.delta,
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
      current_week: primaryPlan.current_week,
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
 * Estimate CTL trend by comparing current CTL to an approximated value 28 days ago.
 * Uses a simple heuristic: if we have enough activities, compare early vs late TSS density.
 */
function calculateCTLTrend(activities, currentCTL) {
  if (activities.length < 3) {
    return { delta: 0, direction: 'holding' };
  }

  // Estimate the CTL 28 days ago by computing EWA up to that midpoint
  const midpoint = Math.floor(activities.length / 2);
  const earlyActivities = activities.slice(0, midpoint);
  const earlyAvgTSS = earlyActivities.reduce((sum, a) => sum + (a.rss || estimateTSS(a)), 0) / Math.max(earlyActivities.length, 1);
  const lateActivities = activities.slice(midpoint);
  const lateAvgTSS = lateActivities.reduce((sum, a) => sum + (a.rss || estimateTSS(a)), 0) / Math.max(lateActivities.length, 1);

  // Rough delta based on TSS density change
  const delta = Math.round(lateAvgTSS - earlyAvgTSS);
  const direction = delta > 3 ? 'building' : delta < -3 ? 'declining' : 'holding';

  return { delta, direction };
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
 */
export function buildCacheKey(context) {
  const parts = [
    context.snapshot.ctl,
    context.snapshot.atl,
    context.snapshot.tsb,
    context.snapshot.last_ride_tss || 0,
    context.trends.ctl_direction,
    context.data_quality.missed_rides_flag ? 1 : 0,
    context.data_quality.rides_completed_this_week,
    context.coach_context.upcoming_key_workout || 'none',
    context.week_schedule || 'none',
  ];
  return parts.join(':');
}
