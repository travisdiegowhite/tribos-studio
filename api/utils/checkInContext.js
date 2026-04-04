/**
 * Check-In Context Assembly Pipeline
 *
 * Gathers all data needed for the AI coaching check-in system prompt.
 * Works with or without a specific activity — when no activity is provided,
 * fetches the most recent activity for context (if any exist).
 */

import { derivePhase, formatWeekSchedule, weekScheduleToText, formatHealth, fetchProprietaryMetrics } from './contextHelpers.js';

/**
 * Assemble the full context package for a coaching check-in.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Service role client
 * @param {string} userId
 * @param {string|null} activityId - The activity that triggered this check-in (null for general check-ins)
 * @returns {Promise<object>} Context object ready for system prompt injection
 */
export async function assembleCheckInContext(supabase, userId, activityId) {
  // Build the activity query — specific activity or most recent one
  const activityQuery = activityId
    ? supabase.from('activities').select('*').eq('id', activityId).maybeSingle()
    : supabase.from('activities').select('*').eq('user_id', userId)
        .is('duplicate_of', null)
        .order('start_date', { ascending: false }).limit(1).maybeSingle();

  // Run independent queries in parallel
  const [
    activityResult,
    planResult,
    fitnessResult,
    raceGoalResult,
    coachSettingsResult,
    decisionsResult,
    healthResult,
    memoryResult,
    recentConversationsResult,
    userProfileResult,
  ] = await Promise.all([
    activityQuery,

    supabase
      .from('training_plans')
      .select('id, name, current_week, duration_weeks, methodology, goal, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('fitness_snapshots')
      .select('ctl, atl, tsb, weekly_tss, load_trend, overtraining_risk')
      .eq('user_id', userId)
      .order('snapshot_week', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('race_goals')
      .select('name, race_date, race_type, priority')
      .eq('user_id', userId)
      .eq('status', 'upcoming')
      .order('priority', { ascending: true })
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('user_coach_settings')
      .select('user_preferred_name, coach_name, coaching_persona, coaching_experience_level')
      .eq('user_id', userId)
      .maybeSingle(),

    supabase
      .from('coach_check_in_decisions')
      .select('decision, recommendation_summary, outcome_notes, decided_at')
      .eq('user_id', userId)
      .order('decided_at', { ascending: false })
      .limit(5),

    supabase
      .from('health_metrics')
      .select('resting_hr, hrv_ms, sleep_hours, sleep_quality, energy_level, recorded_date')
      .eq('user_id', userId)
      .order('recorded_date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('coach_memory')
      .select('category, content')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10),

    // Recent command bar conversations (cross-context awareness)
    supabase
      .from('coach_conversations')
      .select('role, message, timestamp')
      .eq('user_id', userId)
      .in('role', ['user', 'coach'])
      .order('timestamp', { ascending: false })
      .limit(10),

    // User profile (timezone, FTP, weight, experience)
    supabase
      .from('user_profiles')
      .select('timezone, ftp, weight_kg, experience_level')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  const activity = activityResult.data;
  const plan = planResult.data;
  const fitness = fitnessResult.data;
  const raceGoal = raceGoalResult.data;
  const coachSettings = coachSettingsResult.data;
  const decisions = decisionsResult.data || [];
  const health = healthResult.data;
  const memories = memoryResult.data || [];
  const recentConversations = recentConversationsResult.data || [];
  const userProfile = userProfileResult?.data || {};
  const userTimezone = userProfile.timezone || 'America/New_York';

  // Get matched planned workout (if any)
  let plannedWorkout = null;
  if (activity?.matched_planned_workout_id) {
    const { data } = await supabase
      .from('planned_workouts')
      .select('name, workout_type, target_tss, target_duration')
      .eq('id', activity.matched_planned_workout_id)
      .maybeSingle();
    plannedWorkout = data;
  }

  // Get week schedule (planned workouts for current week)
  let weekScheduleRaw = [];
  if (plan) {
    const { data: weekWorkouts } = await supabase
      .from('planned_workouts')
      .select(`
        day_of_week, scheduled_date, name, workout_type,
        target_tss, actual_tss, completed, activity_id
      `)
      .eq('plan_id', plan.id)
      .eq('week_number', plan.current_week || 1);

    weekScheduleRaw = weekWorkouts || [];
  }

  // Derive phase
  const phase = plan
    ? derivePhase(plan.current_week, plan.duration_weeks, plan.methodology)
    : { blockName: 'General Training', blockPurpose: 'Build overall fitness and consistency.' };

  // Calculate deviation
  const plannedTss = plannedWorkout?.target_tss || null;
  const actualTss = activity?.tss || null;
  let deviationPercent = null;
  if (plannedTss && actualTss) {
    deviationPercent = Math.round(((actualTss - plannedTss) / plannedTss) * 100);
  }

  // Fetch structured deviation records (unresolved)
  let structuredDeviations = [];
  try {
    const { data: deviationRows } = await supabase
      .from('plan_deviations')
      .select('id, deviation_date, planned_tss, actual_tss, tss_delta, deviation_type, severity_score, options_json')
      .eq('user_id', userId)
      .is('resolved_at', null)
      .order('deviation_date', { ascending: false })
      .limit(5);
    structuredDeviations = deviationRows || [];
  } catch (devError) {
    // Non-critical — proceed without deviation data
    console.warn('Failed to fetch structured deviations:', devError.message);
  }

  // Build power summary
  const powerSummary = activity
    ? [
        activity.average_watts ? `avg=${activity.average_watts}W` : null,
        activity.normalized_power ? `NP=${activity.normalized_power}W` : null,
        activity.max_watts ? `max=${activity.max_watts}W` : null,
      ].filter(Boolean).join(', ') || 'No power data'
    : 'No activity data';

  // Format decision history
  const decisionHistory = decisions.length > 0
    ? decisions.map((d) =>
        `[${d.decided_at?.split('T')[0]}] ${d.decision.toUpperCase()}: ${d.recommendation_summary}${d.outcome_notes ? ` -> ${d.outcome_notes}` : ''}`
      ).join('\n')
    : 'No previous decisions.';

  // Format memories
  const memoryText = memories.length > 0
    ? memories.map((m) => `[${m.category}] ${m.content}`).join('\n')
    : '';

  // Format health
  const healthText = formatHealth(health);

  // Build structured week schedule (for UI) and text version (for prompt)
  const weekSchedule = formatWeekSchedule(weekScheduleRaw);
  const weekScheduleText = weekScheduleToText(weekSchedule);

  // Flag whether this is an activity-based or general check-in
  const hasActivity = !!activity;

  // Fetch proprietary metrics (EFI/TWL/TCAS) — non-blocking
  const proprietaryMetrics = await fetchProprietaryMetrics(supabase, userId);

  // Build athlete profile
  const ftp = userProfile.ftp || null;
  const weightKg = userProfile.weight_kg || null;
  const athleteProfile = {
    ftp,
    weight_kg: weightKg,
    wkg: ftp && weightKg ? parseFloat((ftp / weightKg).toFixed(1)) : null,
    experience_level: userProfile.experience_level || null,
  };

  // Compute user-local date using their timezone
  let userLocalDateStr = '';
  let userLocalDayOfWeek = '';
  try {
    const now = new Date();
    userLocalDateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: userTimezone,
    });
    userLocalDayOfWeek = now.toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: userTimezone,
    });
  } catch (tzError) {
    // Fallback to UTC if timezone is invalid
    const now = new Date();
    userLocalDateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    userLocalDayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  }

  return {
    rider_name: coachSettings?.user_preferred_name || 'Rider',
    persona_id: coachSettings?.coaching_persona || 'pragmatist',
    experience_level: coachSettings?.coaching_experience_level || null,
    has_activity: hasActivity,
    user_timezone: userTimezone,
    user_local_date: userLocalDateStr,
    user_local_day: userLocalDayOfWeek,
    athlete: athleteProfile,
    proprietary_metrics: proprietaryMetrics,

    goal_event: raceGoal
      ? `${raceGoal.name} (${raceGoal.race_type}, ${raceGoal.race_date}, Priority ${raceGoal.priority})`
      : null,

    block_name: phase.blockName,
    block_purpose: phase.blockPurpose,
    current_week: plan?.current_week || 0,
    total_weeks: plan?.duration_weeks || 0,

    ctl: fitness?.ctl || null,
    atl: fitness?.atl || null,
    form: fitness?.tsb || null,
    load_trend: fitness?.load_trend || null,
    overtraining_risk: fitness?.overtraining_risk || null,

    week_schedule: weekSchedule,
    week_schedule_text: weekScheduleText,

    last_activity: hasActivity
      ? {
          date: activity.start_date_local || activity.start_date || 'Unknown',
          type: activity.type || 'Ride',
          name: activity.name || 'Untitled Activity',
          planned_tss: plannedTss,
          actual_tss: actualTss,
          deviation_percent: deviationPercent,
          over_or_under: deviationPercent != null
            ? (deviationPercent >= 0 ? 'over' : 'under')
            : null,
          duration_minutes: activity.moving_time ? Math.round(activity.moving_time / 60) : 0,
          distance_km: activity.distance ? Math.round((activity.distance / 1000) * 10) / 10 : 0,
          power_summary: powerSummary,
          average_heartrate: activity.average_heartrate || null,
          execution_score: activity.execution_score || null,
          execution_rating: activity.execution_rating || null,
        }
      : null,

    decision_history: decisionHistory,
    health: healthText,
    memories: memoryText,
    recent_conversations: recentConversations.length > 0
      ? recentConversations
          .reverse()
          .map((m) => `${m.role === 'coach' ? 'Coach' : 'Athlete'}: ${m.message.length > 200 ? m.message.substring(0, 200) + '...' : m.message}`)
          .join('\n')
      : '',

    structured_deviations: structuredDeviations,
  };
}
