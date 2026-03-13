/**
 * Context Assembly Pipeline for Coach Check-In
 *
 * Assembles the full rider context package for the AI coaching prompt.
 * Queries: last activity, planned vs actual, week schedule, fitness metrics,
 * block/phase info, decision history, and goal event.
 */

// Import template data for phase lookups
// Note: trainingPlanTemplates is a large TS file; we extract phase info at runtime
// For the serverless function, we inline a lightweight phase lookup.

/**
 * Assemble the complete context package for a coach check-in generation.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Service-key client
 * @param {string} userId - User ID
 * @returns {Promise<object>} Context package for the AI prompt
 */
export async function assembleCheckInContext(supabase, userId) {
  // Run independent queries in parallel
  const [
    profileResult,
    activePlanResult,
    lastActivityResult,
    fitnessResult,
    decisionsResult,
  ] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('display_name, ftp, weight_kg, coaching_persona, primary_sport')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('training_plans')
      .select('id, name, template_id, current_week, duration_weeks, goal, methodology, started_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('activities')
      .select('id, name, type, start_date, start_date_local, moving_time, distance, total_elevation_gain, average_speed, tss, normalized_power, average_power_watts, intensity_factor, average_heart_rate, max_heart_rate, average_cadence, matched_planned_workout_id, execution_score, execution_rating, ride_analytics')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('fitness_snapshots')
      .select('ctl, atl, tsb, weekly_tss, ftp, load_trend, fitness_trend, snapshot_week')
      .eq('user_id', userId)
      .order('snapshot_week', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('coach_check_in_decisions')
      .select('decision, recommendation_summary, decided_at, outcome_notes')
      .eq('user_id', userId)
      .order('decided_at', { ascending: false })
      .limit(5),
  ]);

  const profile = profileResult.data;
  const activePlan = activePlanResult.data;
  const lastActivity = lastActivityResult.data;
  const fitness = fitnessResult.data;
  const decisions = decisionsResult.data || [];

  // Get week schedule if there's an active plan
  let weekSchedule = [];
  let plannedWorkoutForActivity = null;

  if (activePlan) {
    const { data: workouts } = await supabase
      .from('planned_workouts')
      .select('day_of_week, workout_type, target_tss, target_duration, actual_tss, actual_duration, completed, scheduled_date, activity_id')
      .eq('plan_id', activePlan.id)
      .eq('week_number', activePlan.current_week)
      .order('day_of_week', { ascending: true });

    weekSchedule = workouts || [];

    // Find the planned workout for the last activity
    if (lastActivity?.matched_planned_workout_id) {
      const { data: matched } = await supabase
        .from('planned_workouts')
        .select('target_tss, target_duration, workout_type, day_of_week')
        .eq('id', lastActivity.matched_planned_workout_id)
        .single();
      plannedWorkoutForActivity = matched;
    } else if (lastActivity) {
      // Try to match by date
      const activityDate = lastActivity.start_date_local?.split('T')[0];
      if (activityDate) {
        const match = weekSchedule.find(w => w.scheduled_date === activityDate);
        if (match) plannedWorkoutForActivity = match;
      }
    }
  }

  // Calculate deviation
  let deviationPercent = null;
  let deviationDirection = null;
  if (plannedWorkoutForActivity?.target_tss && lastActivity?.tss) {
    deviationPercent = Math.round(
      ((lastActivity.tss - plannedWorkoutForActivity.target_tss) / plannedWorkoutForActivity.target_tss) * 100
    );
    deviationDirection = deviationPercent >= 0 ? 'over' : 'under';
    deviationPercent = Math.abs(deviationPercent);
  }

  // Derive block/phase from template phases
  const blockInfo = deriveBlockInfo(activePlan);

  // Build the context object
  return {
    rider: {
      name: profile?.display_name || 'Athlete',
      ftp: profile?.ftp || null,
      primary_sport: profile?.primary_sport || 'cycling',
    },
    persona_id: profile?.coaching_persona || 'pragmatist',
    plan: activePlan ? {
      name: activePlan.name,
      goal: activePlan.goal,
      methodology: activePlan.methodology,
      current_week: activePlan.current_week,
      total_weeks: activePlan.duration_weeks,
      block_name: blockInfo.name,
      block_purpose: blockInfo.purpose,
    } : null,
    fitness: fitness ? {
      ctl: fitness.ctl,
      atl: fitness.atl,
      form: fitness.tsb,
      weekly_tss: fitness.weekly_tss,
      load_trend: fitness.load_trend,
      fitness_trend: fitness.fitness_trend,
    } : null,
    last_activity: lastActivity ? {
      date: lastActivity.start_date_local,
      type: lastActivity.type,
      name: lastActivity.name,
      tss: lastActivity.tss,
      duration_minutes: lastActivity.moving_time ? Math.round(lastActivity.moving_time / 60) : null,
      distance_km: lastActivity.distance ? Math.round(lastActivity.distance / 100) / 10 : null,
      normalized_power: lastActivity.normalized_power,
      average_power: lastActivity.average_power_watts,
      intensity_factor: lastActivity.intensity_factor,
      average_hr: lastActivity.average_heart_rate,
      elevation_m: lastActivity.total_elevation_gain,
      execution_score: lastActivity.execution_score,
      execution_rating: lastActivity.execution_rating,
    } : null,
    planned_workout: plannedWorkoutForActivity ? {
      target_tss: plannedWorkoutForActivity.target_tss,
      workout_type: plannedWorkoutForActivity.workout_type,
    } : null,
    deviation: deviationPercent !== null ? {
      percent: deviationPercent,
      direction: deviationDirection,
    } : null,
    week_schedule: weekSchedule.map(w => ({
      day: w.day_of_week,
      type: w.workout_type,
      target_tss: w.target_tss,
      actual_tss: w.actual_tss,
      completed: w.completed,
      date: w.scheduled_date,
    })),
    decision_history: decisions.map(d => ({
      decision: d.decision,
      summary: d.recommendation_summary,
      date: d.decided_at,
      outcome: d.outcome_notes,
    })),
  };
}

/**
 * Derive block/phase info from the active plan's template.
 * Templates define phases as: { weeks: [1,2,3], phase: 'base', focus: 'Build aerobic base' }
 */
function deriveBlockInfo(activePlan) {
  if (!activePlan?.template_id || !activePlan?.current_week) {
    return { name: 'Training', purpose: 'Building fitness through structured training' };
  }

  // Known phase structures by template prefix patterns
  // This is a lightweight lookup to avoid importing the full 93KB template file
  // The templates follow consistent patterns: base → recovery → build → recovery → peak → taper
  const week = activePlan.current_week;
  const total = activePlan.duration_weeks;

  // Generic phase estimation based on position in plan
  const progress = week / total;

  if (progress <= 0.35) {
    return { name: 'Base Phase', purpose: 'Building aerobic foundation and workout consistency' };
  } else if (progress <= 0.45 && week % 4 === 0) {
    return { name: 'Recovery Week', purpose: 'Absorbing training load and preparing for the next block' };
  } else if (progress <= 0.75) {
    return { name: 'Build Phase', purpose: 'Increasing intensity and sport-specific fitness' };
  } else if (progress <= 0.85) {
    return { name: 'Peak Phase', purpose: 'Sharpening race-specific fitness at target intensities' };
  } else {
    return { name: 'Taper Phase', purpose: 'Reducing volume while maintaining intensity for peak form' };
  }
}

/**
 * Format the context package into the system prompt's rider context section.
 */
export function formatContextForPrompt(ctx) {
  const lines = [];

  // Rider
  lines.push(`## RIDER CONTEXT`);
  lines.push(`Name: ${ctx.rider.name}`);
  if (ctx.plan) {
    lines.push(`Goal event: ${ctx.plan.goal}`);
    lines.push(`Training block: ${ctx.plan.block_name} (week ${ctx.plan.current_week} of ${ctx.plan.total_weeks})`);
    lines.push(`Block purpose: ${ctx.plan.block_purpose}`);
    lines.push(`Methodology: ${ctx.plan.methodology}`);
  }
  if (ctx.fitness) {
    lines.push(`Current CTL: ${ctx.fitness.ctl ?? 'N/A'} | ATL: ${ctx.fitness.atl ?? 'N/A'} | Form: ${ctx.fitness.form ?? 'N/A'}`);
    lines.push(`Load trend: ${ctx.fitness.load_trend || 'N/A'} | Fitness trend: ${ctx.fitness.fitness_trend || 'N/A'}`);
  }

  // Week schedule
  if (ctx.week_schedule.length > 0) {
    lines.push('');
    lines.push('## THIS WEEK');
    const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const w of ctx.week_schedule) {
      const day = dayNames[w.day] || `Day ${w.day}`;
      const status = w.completed ? `done (${w.actual_tss || '?'} TSS)` : 'pending';
      lines.push(`${day}: ${w.type || 'rest'} — target ${w.target_tss || 0} TSS — ${status}`);
    }
  }

  // Last activity
  if (ctx.last_activity) {
    lines.push('');
    lines.push('## LAST ACTIVITY');
    lines.push(`Date: ${ctx.last_activity.date}`);
    lines.push(`Type: ${ctx.last_activity.type} — ${ctx.last_activity.name}`);
    if (ctx.planned_workout) {
      lines.push(`Planned TSS: ${ctx.planned_workout.target_tss} | Actual TSS: ${ctx.last_activity.tss || 'N/A'}`);
    } else {
      lines.push(`TSS: ${ctx.last_activity.tss || 'N/A'}`);
    }
    if (ctx.deviation) {
      lines.push(`Deviation: ${ctx.deviation.percent}% ${ctx.deviation.direction}`);
    }
    const powerParts = [];
    if (ctx.last_activity.normalized_power) powerParts.push(`NP: ${ctx.last_activity.normalized_power}W`);
    if (ctx.last_activity.average_power) powerParts.push(`Avg: ${ctx.last_activity.average_power}W`);
    if (ctx.last_activity.intensity_factor) powerParts.push(`IF: ${ctx.last_activity.intensity_factor}`);
    if (ctx.last_activity.average_hr) powerParts.push(`HR: ${ctx.last_activity.average_hr}bpm`);
    if (powerParts.length > 0) {
      lines.push(`Power data: ${powerParts.join(' | ')}`);
    }
    if (ctx.last_activity.duration_minutes) {
      lines.push(`Duration: ${ctx.last_activity.duration_minutes}min | Distance: ${ctx.last_activity.distance_km || 'N/A'}km | Elevation: ${ctx.last_activity.elevation_m || 0}m`);
    }
  }

  // Decision history
  if (ctx.decision_history.length > 0) {
    lines.push('');
    lines.push('## DECISION HISTORY (last 5)');
    for (const d of ctx.decision_history) {
      const date = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      lines.push(`${date}: ${d.decision.toUpperCase()} — "${d.summary}"${d.outcome ? ` → ${d.outcome}` : ''}`);
    }
  }

  return lines.join('\n');
}
