/**
 * Today Hero — deterministic context layer.
 *
 * Builds the HeroContext object the voice layer and assembler consume.
 * Shape matches spec §4.3 — every field used by the assembler must have
 * already been classified here, so the voice layer never has to reason
 * about raw numbers.
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

// --- Classification helpers --------------------------------------------

/**
 * Map derivePhase's descriptive blockName to the spec's phase enum.
 * Returns 'base' | 'build' | 'peak' | 'taper' | 'recovery'.
 */
export function mapBlockPhase(blockName) {
  if (!blockName) return 'base';
  const lower = blockName.toLowerCase();
  // Check 'base' before 'build' — derivePhase() emits "Base Building", which
  // contains both words, and base is the canonical classification there.
  if (lower.includes('taper')) return 'taper';
  if (lower.includes('peak')) return 'peak';
  if (lower.includes('recovery')) return 'recovery';
  if (lower.includes('base')) return 'base';
  if (lower.includes('build')) return 'build';
  return 'base';
}

/**
 * Map the 28-day TFI delta into the spec's fitness.trend enum:
 *   'building' | 'maintaining' | 'recovering' | 'detraining'.
 * Thresholds match the Trend card language on the dashboard —
 *   building: > 8%
 *   maintaining: -2% .. 8%
 *   recovering: -8% .. -2%
 *   detraining: < -8%.
 */
export function classifyFitnessTrend(deltaPct) {
  if (typeof deltaPct !== 'number' || !Number.isFinite(deltaPct)) return 'maintaining';
  if (deltaPct > 8) return 'building';
  if (deltaPct >= -2) return 'maintaining';
  if (deltaPct >= -8) return 'recovering';
  return 'detraining';
}

/**
 * Classify opener state per spec §4.8. Order matters — first match wins.
 * States: cold_start | resuming | drifting | peaking | recovering | building.
 */
export function classifyOpenerState({
  hasActivePlan,
  hasRecentActivity,
  daysSinceLastRide,
  efi,
  blockPhase,
  fitnessTrend,
}) {
  if (!hasActivePlan || !hasRecentActivity) return 'cold_start';
  if (daysSinceLastRide >= 2) return 'resuming';
  if (typeof efi === 'number' && efi < 60) return 'drifting';
  if (blockPhase === 'taper' || blockPhase === 'peak') return 'peaking';
  if (blockPhase === 'recovery' || fitnessTrend === 'recovering' || fitnessTrend === 'detraining') return 'recovering';
  return 'building';
}

/**
 * Classify form state from FS against archetype thresholds.
 * Returns 'fresh' | 'neutral' | 'fatigued' | 'deeply_fatigued'.
 */
export function classifyFormState(formScore, fsThresholds) {
  if (formScore >= fsThresholds.fresh) return 'fresh';
  if (formScore <= fsThresholds.deeply_fatigued) return 'deeply_fatigued';
  if (formScore <= fsThresholds.fatigued) return 'fatigued';
  return 'neutral';
}

/**
 * Classify yesterday's ride intensity vs. its planned target (spec §4.8).
 * Returns 'harder' | 'as_expected' | 'easier'. When there is no planned
 * target to compare against we treat the ride as as_expected — the voice
 * layer will collapse the intensity modifier in that case.
 */
export function classifyIntensityVsExpected(lastRide, plannedMatch) {
  if (!lastRide || !plannedMatch?.target_tss) return 'as_expected';

  const actual = lastRide.rss ?? lastRide.tss ?? 0;
  const target = plannedMatch.target_tss;
  if (!target) return 'as_expected';

  const deltaPct = ((actual - target) / target) * 100;
  if (deltaPct > 20) return 'harder';
  if (deltaPct < -20) return 'easier';
  return 'as_expected';
}

/**
 * Map activity/planned workout metadata into the spec's WorkoutType enum.
 */
export function classifyWorkoutType(plannedMatch, lastRideRaw) {
  const raw = (plannedMatch?.workout_type || lastRideRaw?.type || '').toLowerCase();
  if (!raw) return 'endurance';
  if (raw.includes('recovery')) return 'recovery';
  if (raw.includes('vo2') || raw.includes('vo_2')) return 'vo2';
  if (raw.includes('anaerobic')) return 'anaerobic';
  if (raw.includes('threshold') || raw.includes('ftp')) return 'threshold';
  if (raw.includes('sweet')) return 'sweet_spot';
  if (raw.includes('tempo')) return 'tempo';
  if (raw.includes('race')) return 'race';
  if (raw.includes('long')) return 'long_ride';
  return 'endurance';
}

/**
 * Classify week posture (ahead / on_track / behind / nothing_planned).
 */
export function classifyWeekPosture({ plannedThisWeek, completedThisWeek, daysIntoWeek }) {
  if (plannedThisWeek === 0) return 'nothing_planned';
  const expectedRatio = Math.min(1, (daysIntoWeek + 1) / 7);
  const actualRatio = completedThisWeek / plannedThisWeek;
  if (actualRatio > expectedRatio + 0.15) return 'ahead';
  if (actualRatio < expectedRatio - 0.25) return 'behind';
  return 'on_track';
}

// --- Main ---------------------------------------------------------------

export async function assembleHeroContext(userId, supabase, timezone = 'America/New_York') {
  const now = new Date();
  const todayStr = formatDateInTz(now, timezone);

  const dowInTz = getDayOfWeekInTz(now, timezone);
  const daysIntoWeek = dowInTz === 0 ? 6 : dowInTz - 1;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - daysIntoWeek);
  const weekStartStr = formatDateInTz(weekStart, timezone);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = formatDateInTz(weekEnd, timezone);

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
    efiResult,
    recentActivitiesResult,
    weekActivitiesResult,
    weekPlannedResult,
    weekScheduleResult,
    nextWorkoutResult,
    raceGoalResult,
  ] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('first_name, display_name, timezone, experience_level')
      .eq('id', userId)
      .maybeSingle(),

    supabase
      .from('user_coach_settings')
      .select('coaching_persona, coaching_experience_level')
      .eq('user_id', userId)
      .maybeSingle(),

    supabase
      .from('training_load_daily')
      .select('date, tfi, afi, form_score, last_ride_rss')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('training_load_daily')
      .select('date, tfi')
      .eq('user_id', userId)
      .lte('date', todayStr)
      .order('date', { ascending: false })
      .range(27, 27)
      .maybeSingle(),

    // Execution Fidelity Index — 28-day rolling where available, most recent
    // else. Drives the 'drifting' opener classification (spec §4.8).
    supabase
      .from('activity_efi')
      .select('efi, efi_28d, computed_at')
      .eq('user_id', userId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('activities')
      .select('id, name, start_date, rss, tss, distance_meters, duration_seconds, moving_time, total_elevation_gain, elevation_gain_meters, average_watts, effective_power, type')
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .gte('start_date', new Date(now.getTime() - 14 * 86400000).toISOString())
      .order('start_date', { ascending: false })
      .limit(20),

    supabase
      .from('activities')
      .select('id')
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .gte('start_date', weekStart.toISOString()),

    planIds.length > 0
      ? supabase
          .from('planned_workouts')
          .select('id, scheduled_date, completed, activity_id, target_tss')
          .in('plan_id', planIds)
          .gte('scheduled_date', weekStartStr)
          .lt('scheduled_date', weekEndStr)
          .gt('target_tss', 0)
      : Promise.resolve({ data: [] }),

    primaryPlan
      ? supabase
          .from('planned_workouts')
          .select('id, day_of_week, scheduled_date, name, workout_type, target_tss, actual_tss, completed, activity_id')
          .eq('plan_id', primaryPlan.id)
          .eq('week_number', primaryPlan.current_week || 1)
      : Promise.resolve({ data: [] }),

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
  const efiRow = efiResult?.data || null;
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
  const efi = efiRow?.efi_28d ?? efiRow?.efi ?? null;

  let tfiDelta28d = null;
  if (snapshot28d?.tfi != null) {
    tfiDelta28d = tfi - snapshot28d.tfi;
  }
  let tfiDeltaPct28d = null;
  if (snapshot28d?.tfi && snapshot28d.tfi > 0) {
    tfiDeltaPct28d = ((tfi - snapshot28d.tfi) / snapshot28d.tfi) * 100;
  }

  const fitnessTrend = classifyFitnessTrend(tfiDeltaPct28d);

  // --- Last ride ---
  const lastRideRaw = recentActivities[0] || null;
  let daysSinceLastRide = 99;
  if (lastRideRaw) {
    const lastRideDate = formatDateInTz(new Date(lastRideRaw.start_date), timezone);
    daysSinceLastRide = daysBetween(
      new Date(`${todayStr}T12:00:00Z`),
      new Date(`${lastRideDate}T12:00:00Z`),
    );
  }

  let plannedMatch = null;
  if (lastRideRaw) {
    const lastRideDateStr = formatDateInTz(new Date(lastRideRaw.start_date), timezone);
    plannedMatch = (weekScheduleRaw || []).find(
      (w) => w.scheduled_date === lastRideDateStr && (w.activity_id === lastRideRaw.id || w.completed),
    ) || null;
  }

  const intensityVsExpected = classifyIntensityVsExpected(
    lastRideRaw ? { rss: lastRideRaw.rss, tss: lastRideRaw.tss } : null,
    plannedMatch,
  );
  const workoutType = lastRideRaw ? classifyWorkoutType(plannedMatch, lastRideRaw) : null;

  const lastRide = lastRideRaw ? {
    id: lastRideRaw.id,
    name: lastRideRaw.name || null,
    type: lastRideRaw.type || 'Ride',
    workoutType,
    daysAgo: daysSinceLastRide,
    durationSeconds: lastRideRaw.duration_seconds || lastRideRaw.moving_time || 0,
    distanceMeters: lastRideRaw.distance_meters || 0,
    elevationMeters: lastRideRaw.elevation_gain_meters || lastRideRaw.total_elevation_gain || 0,
    rss: lastRideRaw.rss ?? lastRideRaw.tss ?? null,
    startDateTzDate: formatDateInTz(new Date(lastRideRaw.start_date), timezone),
    wasPrescribed: !!plannedMatch,
    intensityVsExpected,
  } : null;

  // --- Plan phase ---
  const phase = primaryPlan
    ? derivePhase(primaryPlan.current_week, primaryPlan.duration_weeks, primaryPlan.methodology)
    : null;
  const blockPhase = phase ? mapBlockPhase(phase.blockName) : 'base';
  const weekInPhase = primaryPlan?.current_week || 1;

  const weekSchedule = formatWeekSchedule(weekScheduleRaw);

  const weekPosture = classifyWeekPosture({
    plannedThisWeek: weekPlanned.length,
    completedThisWeek: weekActivities.length,
    daysIntoWeek,
  });

  // --- Cold start ---
  const hasActivePlan = !!primaryPlan;
  const has28dActivity = recentActivities.length > 0;
  const isColdStart = !hasActivePlan || !has28dActivity;

  const formState = classifyFormState(formScore, overrides.fsThresholds);
  const openerState = classifyOpenerState({
    hasActivePlan,
    hasRecentActivity: has28dActivity,
    daysSinceLastRide,
    efi,
    blockPhase,
    fitnessTrend,
  });

  // --- Next anchor ---
  let nextAnchor = { type: 'none', label: '', daysOut: null };
  if (raceGoal?.race_date) {
    const raceDate = new Date(`${raceGoal.race_date}T12:00:00Z`);
    const todayDate = new Date(`${todayStr}T12:00:00Z`);
    const daysUntil = Math.round((raceDate.getTime() - todayDate.getTime()) / 86400000);
    if (daysUntil >= 0 && daysUntil <= overrides.raceAnchorCutoff) {
      nextAnchor = {
        type: 'race',
        label: raceGoal.name,
        daysOut: daysUntil,
        race_type: raceGoal.race_type,
        race_date: raceGoal.race_date,
        priority: raceGoal.priority,
      };
    }
  }

  return {
    userId,
    timezone,
    date: todayStr,
    archetype,
    experienceLevel: coachSettings.coaching_experience_level || profile.experience_level || 'intermediate',
    rider: {
      firstName: profile.first_name || profile.display_name || null,
      hasActivePlan,
    },
    fitness: {
      tfi,
      afi,
      fs: formScore,
      efi,
      tfiDelta28d,
      tfiDeltaPct28d,
      trend: fitnessTrend,
    },
    block: {
      phase: blockPhase,
      weekInPhase,
      blockName: phase?.blockName || null,
      blockPurpose: phase?.blockPurpose || null,
    },
    plan: primaryPlan ? {
      id: primaryPlan.id,
      name: primaryPlan.name,
      methodology: primaryPlan.methodology,
      currentWeek: primaryPlan.current_week,
      totalWeeks: primaryPlan.duration_weeks,
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
    nextAnchor,
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
 * Regenerates naturally on a new ride, a persona switch, or a day rollover.
 */
export function buildHeroCacheKey(context) {
  const lastRideId = context.lastRide?.id || 'no-ride';
  return `${context.date}:${lastRideId}:${context.archetype}`;
}
