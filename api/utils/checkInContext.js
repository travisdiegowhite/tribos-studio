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
    // Calculate current week dynamically from started_at (same as planner does).
    // The DB's current_week field is set to 1 at activation and never updated,
    // so it becomes stale as time progresses.
    const planStart = new Date(activePlan.started_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - planStart.getTime()) / (1000 * 60 * 60 * 24));
    const calculatedWeek = Math.max(1, Math.min(
      Math.floor(diffDays / 7) + 1,
      activePlan.duration_weeks || 1
    ));

    const { data: workouts } = await supabase
      .from('planned_workouts')
      .select('day_of_week, workout_type, target_tss, target_duration, actual_tss, actual_duration, completed, scheduled_date, activity_id')
      .eq('plan_id', activePlan.id)
      .eq('week_number', calculatedWeek)
      .order('day_of_week', { ascending: true });

    weekSchedule = workouts || [];

    // Cross-reference activities table for real TSS values.
    // STRICT: Only trust `completed` if the workout has an activity_id that
    // resolves to a real activity in the activities table. This prevents
    // stale/incorrect completion data from polluting the AI prompt.
    const activityIds = weekSchedule
      .filter(w => w.activity_id)
      .map(w => w.activity_id);

    let activityTssMap = {};
    if (activityIds.length > 0) {
      const { data: realActivities } = await supabase
        .from('activities')
        .select('id, tss')
        .in('id', activityIds);

      for (const a of (realActivities || [])) {
        activityTssMap[a.id] = a.tss;
      }
    }

    // Single pass: only trust completion if backed by a real activity
    weekSchedule = weekSchedule.map(w => {
      if (w.activity_id && activityTssMap[w.activity_id] !== undefined) {
        // Valid linked activity — use real TSS from activities table
        return { ...w, actual_tss: activityTssMap[w.activity_id], completed: true };
      }
      // No valid activity link — don't trust completion status at all
      if (w.completed || w.actual_tss) {
        return { ...w, actual_tss: null, completed: false, activity_id: null };
      }
      return w;
    });

    // Date guard: don't trust `completed` or `actual_tss` on workouts scheduled
    // in the future. The upstream matching system can incorrectly mark future
    // workouts as done. Strip those fields for any workout after today.
    const today = new Date().toISOString().split('T')[0];
    weekSchedule = weekSchedule.map(w => {
      if (w.scheduled_date && w.scheduled_date > today) {
        return { ...w, completed: false, actual_tss: null, actual_duration: null, activity_id: null };
      }
      return w;
    });

    // Find the planned workout that corresponds to the last activity.
    // Priority: explicit match via matched_planned_workout_id > activity_id on workout > date match.
    // IMPORTANT: Only match if the planned workout's date is NOT in the future.
    if (lastActivity?.matched_planned_workout_id) {
      const { data: matched } = await supabase
        .from('planned_workouts')
        .select('target_tss, target_duration, workout_type, day_of_week, scheduled_date')
        .eq('id', lastActivity.matched_planned_workout_id)
        .single();
      // Only accept the match if the workout date is not in the future
      if (matched && (!matched.scheduled_date || matched.scheduled_date <= today)) {
        plannedWorkoutForActivity = matched;
      }
    }
    if (!plannedWorkoutForActivity && lastActivity) {
      // Try to match by activity_id on planned_workouts (most reliable)
      const activityMatch = weekSchedule.find(w => w.activity_id === lastActivity.id);
      if (activityMatch) {
        plannedWorkoutForActivity = activityMatch;
      } else {
        // Fallback: match by date — activity date must equal workout's scheduled_date
        const activityDate = lastActivity.start_date_local?.split('T')[0];
        if (activityDate) {
          const dateMatch = weekSchedule.find(w => w.scheduled_date === activityDate);
          if (dateMatch) plannedWorkoutForActivity = dateMatch;
        }
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

  // Week number used for the query (calculated dynamically)
  const weekUsed = activePlan ? (() => {
    const s = new Date(activePlan.started_at);
    const d = Math.floor((new Date().getTime() - s.getTime()) / 86400000);
    return Math.max(1, Math.min(Math.floor(d / 7) + 1, activePlan.duration_weeks || 1));
  })() : null;

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
      current_week: weekUsed,
      total_weeks: activePlan.duration_weeks,
      block_name: blockInfo.name,
      block_purpose: blockInfo.purpose,
    } : null,
    // Debug metadata — helps diagnose data issues
    _debug: {
      db_current_week: activePlan?.current_week,
      calculated_week: weekUsed,
      plan_id: activePlan?.id,
      plan_started_at: activePlan?.started_at,
      raw_week_schedule: weekSchedule.map(w => ({
        day_of_week: w.day_of_week,
        scheduled_date: w.scheduled_date,
        workout_type: w.workout_type,
        target_tss: w.target_tss,
        actual_tss: w.actual_tss,
        completed: w.completed,
        activity_id: w.activity_id,
      })),
    },
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
      scheduled_date: plannedWorkoutForActivity.scheduled_date || null,
      day_of_week: plannedWorkoutForActivity.day_of_week,
    } : null,
    deviation: deviationPercent !== null ? {
      percent: deviationPercent,
      direction: deviationDirection,
    } : null,
    week_schedule: weekSchedule.map(w => ({
      // Derive actual calendar day from scheduled_date, not day_of_week
      // (day_of_week is the template index and may not match the calendar)
      day: w.scheduled_date
        ? new Date(w.scheduled_date + 'T12:00:00').getDay()
        : w.day_of_week,
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

  // Week schedule — show each day with planned vs actual, and flag today's date
  if (ctx.week_schedule.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    lines.push('');
    lines.push('## THIS WEEK');
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const w of ctx.week_schedule) {
      // Derive day name from actual date when available (day_of_week may not match calendar)
      const day = w.date
        ? dayNames[new Date(w.date + 'T12:00:00').getDay()]
        : dayNames[w.day] ?? `Day ${w.day}`;
      const dateLabel = w.date || '';
      const isToday = dateLabel === today;
      const isPast = dateLabel && dateLabel < today;
      let status;
      if (w.completed) {
        status = `DONE (${w.actual_tss || '?'} TSS)`;
      } else if (isPast) {
        status = 'MISSED';
      } else if (isToday) {
        status = 'TODAY — not yet completed';
      } else {
        status = 'upcoming';
      }
      lines.push(`${day} (${dateLabel}): ${w.type || 'rest'} — target ${w.target_tss || 0} TSS — ${status}`);
    }
  }

  // Last activity — always include the actual date so the AI knows WHEN it happened
  if (ctx.last_activity) {
    const activityDate = ctx.last_activity.date?.split('T')[0] || 'unknown';
    const activityDayName = ctx.last_activity.date
      ? new Date(ctx.last_activity.date).toLocaleDateString('en-US', { weekday: 'long' })
      : 'unknown';
    lines.push('');
    lines.push('## LAST ACTIVITY');
    lines.push(`Date: ${activityDayName}, ${activityDate}`);
    lines.push(`Type: ${ctx.last_activity.type} — ${ctx.last_activity.name}`);
    if (ctx.planned_workout) {
      lines.push(`Matched to planned workout: ${ctx.planned_workout.workout_type} (target ${ctx.planned_workout.target_tss} TSS)`);
      lines.push(`Actual TSS: ${ctx.last_activity.tss || 'N/A'}`);
    } else {
      lines.push(`TSS: ${ctx.last_activity.tss || 'N/A'} (no matching planned workout)`);
    }
    if (ctx.deviation) {
      lines.push(`Deviation from plan: ${ctx.deviation.percent}% ${ctx.deviation.direction}`);
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
