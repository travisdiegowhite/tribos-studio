/**
 * Check-In Context Assembly Pipeline
 *
 * Gathers all data needed for the AI coaching check-in system prompt.
 * Works with or without a specific activity — when no activity is provided,
 * fetches the most recent activity for context (if any exist).
 */

import { derivePhase, formatWeekSchedule, weekScheduleToText, formatHealth, fetchProprietaryMetrics } from './contextHelpers.js';

/**
 * Build a map of workout_id → annotation string from recent accepted decisions.
 * Used to mark workouts in the week schedule that were recently coach-adjusted.
 */
function buildCoachAnnotations(decisions) {
  const annotations = new Map();
  if (!decisions || decisions.length === 0) return annotations;

  for (const d of decisions) {
    if (d.decision !== 'accept' || !d.outcome_notes) continue;

    try {
      const o = typeof d.outcome_notes === 'string' ? JSON.parse(d.outcome_notes) : d.outcome_notes;
      if (!o.applied || !o.workout_id) continue;

      const date = d.decided_at?.split('T')[0] || 'recently';

      switch (o.action) {
        case 'modify':
          annotations.set(o.workout_id, `(coach-adjusted from ${o.original_tss} TSS on ${date})`);
          break;
        case 'insert_rest':
          annotations.set(o.workout_id, `(coach-converted to rest on ${date})`);
          break;
        case 'replace':
          annotations.set(o.workout_id, `(coach-replaced from '${o.original_name}' on ${date})`);
          break;
        case 'drop':
          // Workout no longer exists, but note it in case of re-query edge cases
          annotations.set(o.workout_id, `(coach-dropped on ${date})`);
          break;
        case 'swap':
          if (o.swapped) {
            for (const s of o.swapped) {
              annotations.set(s.id, `(coach-swapped to ${s.moved_to} on ${date})`);
            }
          }
          break;
      }
    } catch {
      // Skip unparseable outcome notes
    }
  }

  return annotations;
}

/**
 * Parse raw outcome_notes JSON into human-readable text.
 * Falls back to the raw string if parsing fails.
 */
function humanizeOutcome(outcomeNotes) {
  if (!outcomeNotes) return '';

  try {
    const o = typeof outcomeNotes === 'string' ? JSON.parse(outcomeNotes) : outcomeNotes;

    if (!o.applied) {
      return `Not applied: ${o.reason || 'unknown reason'}`;
    }

    switch (o.action) {
      case 'modify':
        return `Modified '${o.workout_name || 'workout'}' from ${o.original_tss} to ${o.new_tss} TSS (${Math.round((o.scale_factor || 0.7) * 100)}% scale) on ${o.date || 'unknown date'}`;
      case 'swap':
        if (o.swapped && o.swapped.length === 2) {
          return `Swapped '${o.swapped[0].name}' to ${o.swapped[0].moved_to} and '${o.swapped[1].name}' to ${o.swapped[1].moved_to}`;
        }
        return 'Swapped two workouts';
      case 'insert_rest':
        return `Converted '${o.original_name || 'workout'}' on ${o.date || 'unknown date'} to rest day`;
      case 'drop':
        return `Dropped '${o.workout_name || 'workout'}' on ${o.date || 'unknown date'}`;
      case 'replace':
        return `Replaced '${o.original_name || 'workout'}' with '${o.new_name || 'replacement'}' on ${o.date || 'unknown date'}`;
      default:
        return `Applied: ${o.action || 'unknown action'}`;
    }
  } catch {
    // If it's not valid JSON, return the raw string
    return String(outcomeNotes);
  }
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
    dailyLoadResult,
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
      .select('ctl:tfi, atl:afi, tsb:form_score, weekly_tss:weekly_rss, load_trend, overtraining_risk')
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

    // Most-recent daily training load — primarily for terrain_class,
    // which was added in migration 068. We already pull CTL/ATL/TSB
    // from the weekly fitness_snapshots above, so this is a tiny
    // point lookup, not a replacement.
    supabase
      .from('training_load_daily')
      .select('terrain_class, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
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
        id, day_of_week, scheduled_date, name, workout_type,
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

  // Format decision history with humanized outcome notes
  const decisionHistory = decisions.length > 0
    ? decisions.map((d) => {
        const outcome = d.outcome_notes ? ` -> ${humanizeOutcome(d.outcome_notes)}` : '';
        return `[${d.decided_at?.split('T')[0]}] ${d.decision.toUpperCase()}: ${d.recommendation_summary}${outcome}`;
      }).join('\n')
    : 'No previous decisions.';

  // Format memories
  const memoryText = memories.length > 0
    ? memories.map((m) => `[${m.category}] ${m.content}`).join('\n')
    : '';

  // Format health
  const healthText = formatHealth(health);

  // Build structured week schedule (for UI) and text version (for prompt)
  const weekSchedule = formatWeekSchedule(weekScheduleRaw);

  // Build coach-adjustment annotations from recent decisions
  const coachAnnotations = buildCoachAnnotations(decisions);
  const weekScheduleText = weekScheduleToText(weekSchedule, coachAnnotations);

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
    today_terrain_class: dailyLoadResult?.data?.terrain_class || null,

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
