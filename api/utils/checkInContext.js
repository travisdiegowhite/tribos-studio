/**
 * Check-In Context Assembly Pipeline
 *
 * Gathers all data needed for the AI coaching check-in system prompt.
 * Works with or without a specific activity — when no activity is provided,
 * fetches the most recent activity for context (if any exist).
 */

/**
 * Derive training phase/block from current week position and methodology.
 */
function derivePhase(currentWeek, totalWeeks, methodology) {
  if (!currentWeek || !totalWeeks) {
    return { blockName: 'General Training', blockPurpose: 'Build overall fitness and consistency.' };
  }

  const ratio = currentWeek / totalWeeks;
  const methodPrefix = methodology || 'general';

  if (ratio <= 0.33) {
    const purposes = {
      polarized: 'Develop aerobic foundation through high-volume low-intensity work with occasional high-intensity touches.',
      sweet_spot: 'Build aerobic base with sustainable sub-threshold efforts to maximize training efficiency.',
      pyramidal: 'Establish a wide aerobic base with gradually increasing intensity distribution.',
      threshold: 'Develop aerobic capacity to support upcoming threshold-focused work.',
      endurance: 'Build deep aerobic foundation and movement efficiency through steady volume.',
    };
    return {
      blockName: 'Base Building',
      blockPurpose: purposes[methodPrefix] || 'Develop aerobic foundation and movement efficiency.',
    };
  }

  if (ratio <= 0.66) {
    const purposes = {
      polarized: 'Increase high-intensity stimulus while maintaining aerobic volume.',
      sweet_spot: 'Progress sweet spot duration and frequency to push FTP ceiling higher.',
      pyramidal: 'Shift intensity distribution toward more tempo and threshold work.',
      threshold: 'Extend time at threshold to drive FTP adaptation.',
      endurance: 'Add targeted intensity to the aerobic base for race-specific fitness.',
    };
    return {
      blockName: 'Build',
      blockPurpose: purposes[methodPrefix] || 'Increase intensity and sport-specific fitness.',
    };
  }

  if (ratio <= 0.85) {
    return {
      blockName: 'Peak',
      blockPurpose: 'Sharpen race-specific efforts at target intensity. Maintain volume, maximize quality.',
    };
  }

  return {
    blockName: 'Taper',
    blockPurpose: 'Reduce volume while maintaining intensity. Arrive at race day fresh and sharp.',
  };
}

/**
 * Format the week schedule as structured data for both the AI prompt and UI.
 */
function formatWeekSchedule(weekWorkouts) {
  if (!weekWorkouts || weekWorkouts.length === 0) {
    return [];
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return weekWorkouts
    .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))
    .map((w) => ({
      day: dayNames[w.day_of_week] || `Day${w.day_of_week}`,
      day_of_week: w.day_of_week,
      scheduled_date: w.scheduled_date || null,
      name: w.name || w.workout_type || 'Workout',
      workout_type: w.workout_type || 'ride',
      target_tss: w.target_tss || 0,
      actual_tss: w.actual_tss || 0,
      completed: !!w.completed,
      has_activity: !!w.activity_id,
    }));
}

/**
 * Serialize week schedule to text for the AI system prompt.
 */
function weekScheduleToText(weekSchedule) {
  if (!weekSchedule || weekSchedule.length === 0) {
    return 'No planned workouts this week.';
  }

  return weekSchedule
    .map((w) => {
      const status = w.completed ? 'DONE' : w.has_activity ? 'PARTIAL' : 'PLANNED';
      const tssInfo = w.target_tss
        ? `planned=${w.target_tss}${w.actual_tss ? ` actual=${w.actual_tss}` : ''}`
        : '';
      return `${w.day}: ${w.name} [${status}] ${tssInfo}`.trim();
    })
    .join('\n');
}

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
      .select('user_preferred_name, coach_name, coaching_persona')
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
  ]);

  const activity = activityResult.data;
  const plan = planResult.data;
  const fitness = fitnessResult.data;
  const raceGoal = raceGoalResult.data;
  const coachSettings = coachSettingsResult.data;
  const decisions = decisionsResult.data || [];
  const health = healthResult.data;
  const memories = memoryResult.data || [];

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
  const healthText = health
    ? [
        health.resting_hr ? `RHR: ${health.resting_hr}bpm` : null,
        health.hrv_ms ? `HRV: ${health.hrv_ms}ms` : null,
        health.sleep_hours ? `Sleep: ${health.sleep_hours}h` : null,
        health.energy_level ? `Energy: ${health.energy_level}/5` : null,
      ].filter(Boolean).join(' | ')
    : 'No health data available.';

  // Build structured week schedule (for UI) and text version (for prompt)
  const weekSchedule = formatWeekSchedule(weekScheduleRaw);
  const weekScheduleText = weekScheduleToText(weekSchedule);

  // Flag whether this is an activity-based or general check-in
  const hasActivity = !!activity;

  return {
    rider_name: coachSettings?.user_preferred_name || 'Rider',
    persona_id: coachSettings?.coaching_persona || 'pragmatist',
    has_activity: hasActivity,

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
  };
}
