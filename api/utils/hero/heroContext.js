/**
 * Today Hero — deterministic context layer.
 *
 * Builds the HeroContext object the voice layer and assembler consume. No
 * LLM calls here; this is pure data + classification. Timezone-aware so the
 * "today" the coach references matches the Trend and Status cards.
 *
 * Returns enough information for the downstream layers to emit a 2-3
 * sentence paragraph without ever having to re-query Supabase.
 */

import { derivePhase, formatWeekSchedule } from '../contextHelpers.js';
import { DEFAULT_ARCHETYPE, getArchetypeOverrides } from './archetypeOverrides.js';

function formatDateInTz(date, tz) {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function getDayOfWeekInTz(date, tz) {
  try {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz });
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[dayName] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}

function daysBetween(dateA, dateB) {
  const ms = Math.abs(dateA.getTime() - dateB.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Classify opener state from days since last ride + form score.
 * Spec opener states: fresh, carrying_fatigue, deeply_fatigued, resuming,
 * returning_from_layoff, holding.
 */
export function classifyOpenerState({ daysSinceLastRide, formScore, fsThresholds }) {
  if (daysSinceLastRide >= 7) return 'returning_from_layoff';
  if (daysSinceLastRide >= 3) return 'resuming';
  if (formScore <= fsThresholds.deeply_fatigued) return 'deeply_fatigued';
  if (formScore <= fsThresholds.fatigued) return 'carrying_fatigue';
  if (formScore >= fsThresholds.fresh) return 'fresh';
  return 'holding';
}

/**
 * Classify form state using per-archetype thresholds.
 */
export function classifyFormState(formScore, fsThresholds) {
  if (formScore >= fsThresholds.fresh) return 'fresh';
  if (formScore <= fsThresholds.deeply_fatigued) return 'deeply_fatigued';
  if (formScore <= fsThresholds.fatigued) return 'fatigued';
  return 'neutral';
}

/**
 * Classify yesterday's ride intensity vs. its planned target.
 * Returns 'above' | 'near' | 'below' | 'unplanned' | 'none'.
 */
export function classifyIntensityVsExpected(lastRide, plannedMatch) {
  if (!lastRide) return 'none';
  if (!plannedMatch || !plannedMatch.target_tss) return 'unplanned';

  const actualRss = lastRide.rss ?? lastRide.tss ?? 0;
  const target = plannedMatch.target_tss;
  if (!target) return 'unplanned';

  const deltaPct = ((actualRss - target) / target) * 100;
  if (deltaPct > 15) return 'above';
  if (deltaPct < -15) return 'below';
  return 'near';
}

/**
 * Classify week posture from completed vs. planned ride counts.
 * Returns 'ahead' | 'on_track' | 'behind' | 'nothing_planned'.
 */
export function classifyWeekPosture({ plannedThisWeek, completedThisWeek, daysIntoWeek }) {
  if (plannedThisWeek === 0) return 'nothing_planned';
  // Expected completion ratio by this day (1-indexed Monday=1..Sunday=7).
  const expectedRatio = Math.min(1, (daysIntoWeek + 1) / 7);
  const actualRatio = completedThisWeek / plannedThisWeek;
  if (actualRatio > expectedRatio + 0.15) return 'ahead';
  if (actualRatio < expectedRatio - 0.25) return 'behind';
  return 'on_track';
}

/**
 * Pull everything the hero needs and run the deterministic classification.
 *
 * @param {string} userId
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - service-role client
 * @param {string} timezone - IANA timezone (e.g. 'America/Denver')
 * @returns {Promise<object>} HeroContext
 */
export async function assembleHeroContext(userId, supabase, timezone = 'America/New_York') {
  const now = new Date();
  const todayStr = formatDateInTz(now, timezone);

  // Monday-anchored week window (in user's TZ).
  const dowInTz = getDayOfWeekInTz(now, timezone); // 0=Sun..6=Sat
  const daysIntoWeek = dowInTz === 0 ? 6 : dowInTz - 1; // Mon=0..Sun=6
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - daysIntoWeek);
  const weekStartStr = formatDateInTz(weekStart, timezone);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = formatDateInTz(weekEnd, timezone);

  // Active plans.
  const { data: activePlans } = await supabase
    .from('training_plans')
    .select('id, name, current_week, duration_weeks, methodology, goal')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  const planIds = (activePlans || []).map((p) => p.id);
  const primaryPlan = (activePlans && activePlans.length > 0) ? activePlans[0] : null;

  const [
    profileResult,
    coachSettingsResult,
    latestLoadResult,
    snapshot28dResult,
    recentActivitiesResult,
    weekActivitiesResult,
    weekPlannedResult,
    weekScheduleResult,
    nextWorkoutResult,
    raceGoalResult,
  ] = await Promise.all([
    // 1. Rider profile (name + TZ fallback).
    supabase
      .from('user_profiles')
      .select('first_name, display_name, timezone, experience_level')
      .eq('id', userId)
      .maybeSingle(),

    // 2. Coach persona.
    supabase
      .from('user_coach_settings')
      .select('coaching_persona, coaching_experience_level')
      .eq('user_id', userId)
      .maybeSingle(),

    // 3. Latest training_load_daily row — canonical TFI/AFI/FS.
    supabase
      .from('training_load_daily')
      .select('date, tfi, afi, form_score, last_ride_rss')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // 4. Training_load_daily row from ~28 days ago for TFI delta %.
    supabase
      .from('training_load_daily')
      .select('date, tfi')
      .eq('user_id', userId)
      .lte('date', todayStr)
      .order('date', { ascending: false })
      .range(27, 27)
      .maybeSingle(),

    // 5. Recent activities (last 14 days) — used to find yesterday's ride and
    //    whether we're in cold-start territory.
    supabase
      .from('activities')
      .select('id, name, start_date, rss, tss, distance_meters, duration_seconds, moving_time, total_elevation_gain, elevation_gain_meters, average_watts, effective_power, type')
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .gte('start_date', new Date(now.getTime() - 14 * 86400000).toISOString())
      .order('start_date', { ascending: false })
      .limit(20),

    // 6. This-week's completed activities (count only).
    supabase
      .from('activities')
      .select('id')
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .gte('start_date', weekStart.toISOString()),

    // 7. This-week's planned workouts (non-rest rows). target_tss is the
    //    canonical filter column on planned_workouts — there is no
    //    target_rss column yet (DROP migrations deferred, see CLAUDE.md).
    planIds.length > 0
      ? supabase
          .from('planned_workouts')
          .select('id, scheduled_date, completed, activity_id, target_tss')
          .in('plan_id', planIds)
          .gte('scheduled_date', weekStartStr)
          .lt('scheduled_date', weekEndStr)
          .gt('target_tss', 0)
      : Promise.resolve({ data: [] }),

    // 8. Full week schedule with names/day-of-week (for hero "next workout").
    primaryPlan
      ? supabase
          .from('planned_workouts')
          .select('id, day_of_week, scheduled_date, name, workout_type, target_tss, actual_tss, completed, activity_id')
          .eq('plan_id', primaryPlan.id)
          .eq('week_number', primaryPlan.current_week || 1)
      : Promise.resolve({ data: [] }),

    // 9. Next unfinished planned workout (any active plan, today or later).
    planIds.length > 0
      ? supabase
          .from('planned_workouts')
          .select('id, scheduled_date, name, workout_type, target_tss')
          .in('plan_id', planIds)
          .gte('scheduled_date', todayStr)
          .eq('completed', false)
          .order('scheduled_date', { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // 10. Next priority race.
    supabase
      .from('race_goals')
      .select('name, race_date, race_type, priority')
      .eq('user_id', userId)
      .eq('status', 'upcoming')
      .order('priority', { ascending: true })
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileResult?.data || {};
  const coachSettings = coachSettingsResult?.data || {};
  const archetype = coachSettings.coaching_persona && coachSettings.coaching_persona !== 'pending'
    ? coachSettings.coaching_persona
    : DEFAULT_ARCHETYPE;
  const overrides = getArchetypeOverrides(archetype);

  const latestLoad = latestLoadResult?.data || null;
  const snapshot28d = snapshot28dResult?.data || null;
  const recentActivities = recentActivitiesResult?.data || [];
  const weekActivities = weekActivitiesResult?.data || [];
  const weekPlanned = weekPlannedResult?.data || [];
  const weekScheduleRaw = weekScheduleResult?.data || [];
  const nextWorkout = nextWorkoutResult?.data || null;
  const raceGoal = raceGoalResult?.data || null;

  // --- Metric extraction (canonical-first) ---
  const tfi = latestLoad?.tfi ?? 0;
  const afi = latestLoad?.afi ?? 0;
  const formScore = latestLoad?.form_score ?? 0;

  let ctlDeltaPct = null;
  if (snapshot28d?.tfi && snapshot28d.tfi > 0) {
    ctlDeltaPct = ((tfi - snapshot28d.tfi) / snapshot28d.tfi) * 100;
  }

  // --- Last ride (yesterday or today so far) ---
  const lastRideRaw = recentActivities[0] || null;
  let daysSinceLastRide = 99;
  if (lastRideRaw) {
    const lastRideDate = formatDateInTz(new Date(lastRideRaw.start_date), timezone);
    daysSinceLastRide = daysBetween(
      new Date(`${todayStr}T12:00:00Z`),
      new Date(`${lastRideDate}T12:00:00Z`),
    );
  }

  // Match last ride to its planned workout (same day in user TZ).
  let plannedMatch = null;
  if (lastRideRaw) {
    const lastRideDateStr = formatDateInTz(new Date(lastRideRaw.start_date), timezone);
    plannedMatch = (weekScheduleRaw || []).find(
      (w) => w.scheduled_date === lastRideDateStr && (w.activity_id === lastRideRaw.id || w.completed),
    ) || null;
  }

  const lastRide = lastRideRaw ? {
    id: lastRideRaw.id,
    type: lastRideRaw.type || 'Ride',
    durationSeconds: lastRideRaw.duration_seconds || lastRideRaw.moving_time || 0,
    distanceMeters: lastRideRaw.distance_meters || 0,
    elevationMeters: lastRideRaw.elevation_gain_meters || lastRideRaw.total_elevation_gain || 0,
    rss: lastRideRaw.rss ?? lastRideRaw.tss ?? null,
    startDateTzDate: formatDateInTz(new Date(lastRideRaw.start_date), timezone),
  } : null;

  // --- Plan phase ---
  const phase = primaryPlan
    ? derivePhase(primaryPlan.current_week, primaryPlan.duration_weeks, primaryPlan.methodology)
    : null;

  const weekSchedule = formatWeekSchedule(weekScheduleRaw);

  // --- Week posture ---
  const weekPosture = classifyWeekPosture({
    plannedThisWeek: weekPlanned.length,
    completedThisWeek: weekActivities.length,
    daysIntoWeek,
  });

  // --- Opener + form + intensity ---
  const openerState = classifyOpenerState({
    daysSinceLastRide,
    formScore,
    fsThresholds: overrides.fsThresholds,
  });
  const formState = classifyFormState(formScore, overrides.fsThresholds);
  const intensityVsExpected = classifyIntensityVsExpected(lastRide, plannedMatch);

  // --- Race anchor ---
  let raceAnchor = null;
  if (raceGoal && raceGoal.race_date) {
    const raceDate = new Date(`${raceGoal.race_date}T12:00:00Z`);
    const todayDate = new Date(`${todayStr}T12:00:00Z`);
    const daysUntil = Math.round((raceDate.getTime() - todayDate.getTime()) / 86400000);
    if (daysUntil >= 0 && daysUntil <= overrides.raceAnchorCutoff) {
      raceAnchor = {
        name: raceGoal.name,
        race_type: raceGoal.race_type,
        race_date: raceGoal.race_date,
        priority: raceGoal.priority,
        days_until: daysUntil,
      };
    }
  }

  // --- Cold start detection ---
  const hasActivePlan = !!primaryPlan;
  const has28dActivity = recentActivities.length > 0;
  const isColdStart = !hasActivePlan && !has28dActivity;

  return {
    userId,
    timezone,
    date: todayStr,
    archetype,
    experienceLevel: coachSettings.coaching_experience_level || profile.experience_level || 'intermediate',
    rider: {
      firstName: profile.first_name || profile.display_name || null,
    },
    metrics: {
      tfi,
      afi,
      formScore,
      ctlDeltaPct,
    },
    plan: primaryPlan ? {
      id: primaryPlan.id,
      name: primaryPlan.name,
      methodology: primaryPlan.methodology,
      currentWeek: primaryPlan.current_week,
      totalWeeks: primaryPlan.duration_weeks,
      blockName: phase?.blockName || null,
      blockPurpose: phase?.blockPurpose || null,
    } : null,
    week: {
      plannedCount: weekPlanned.length,
      completedCount: weekActivities.length,
      daysIntoWeek,
      posture: weekPosture,
    },
    lastRide,
    lastRidePlannedMatch: plannedMatch ? {
      id: plannedMatch.id,
      name: plannedMatch.name,
      target_tss: plannedMatch.target_tss || null,
      workout_type: plannedMatch.workout_type || null,
    } : null,
    nextWorkout: nextWorkout ? {
      id: nextWorkout.id,
      name: nextWorkout.name,
      scheduledDate: nextWorkout.scheduled_date,
      workoutType: nextWorkout.workout_type,
      targetRss: nextWorkout.target_tss || null,
    } : null,
    raceAnchor,
    weekSchedule,
    classification: {
      openerState,
      formState,
      intensityVsExpected,
      weekPosture,
      daysSinceLastRide,
    },
    coldStart: {
      active: isColdStart,
      hasActivePlan,
      hasRecentActivity: has28dActivity,
    },
  };
}

/**
 * Deterministic cache key: day + last-ride-id + archetype.
 * Regenerates naturally on a new ride, a persona switch, or a calendar-day
 * rollover.
 */
export function buildHeroCacheKey(context) {
  const lastRideId = context.lastRide?.id || 'no-ride';
  return `${context.date}:${lastRideId}:${context.archetype}`;
}
