/**
 * Deviation Processor Utility
 *
 * Enqueues deviation analysis after an activity is synced.
 * Called from webhook handlers alongside enqueueCheckIn().
 *
 * This is a fire-and-forget call — the actual analysis happens
 * in the /api/process-deviation endpoint.
 */

/**
 * Trigger deviation analysis for a synced activity.
 *
 * @param {object} supabase - Supabase admin client
 * @param {string} userId - The user who completed the activity
 * @param {string} activityId - The activity ID to analyze
 * @returns {Promise<{ enqueued: boolean, reason?: string }>}
 */
export async function enqueueDeviationAnalysis(supabase, userId, activityId) {
  try {
    // Guard: check if user has an active training plan
    const { data: plan } = await supabase
      .from('training_plans')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (!plan) {
      return { enqueued: false, reason: 'no_active_plan' };
    }

    // Guard: check if there's a planned workout for today (using user's timezone)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    const tz = profile?.timezone || 'America/New_York';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const { data: todayWorkout } = await supabase
      .from('planned_workouts')
      .select('id')
      .eq('plan_id', plan.id)
      .eq('scheduled_date', today)
      .limit(1)
      .single();

    if (!todayWorkout) {
      return { enqueued: false, reason: 'no_planned_workout_today' };
    }

    // Guard: check if deviation already exists for this activity
    const { data: existing } = await supabase
      .from('plan_deviations')
      .select('id')
      .eq('user_id', userId)
      .eq('activity_id', String(activityId))
      .limit(1)
      .single();

    if (existing) {
      return { enqueued: false, reason: 'already_analyzed' };
    }

    // Fire the deviation analysis via internal API call
    // In production, this would call the /api/process-deviation endpoint
    // For now, we do inline analysis to avoid circular HTTP calls in Vercel
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const cronSecret = process.env.CRON_SECRET;

    try {
      await fetch(`${baseUrl}/api/process-deviation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ user_id: userId, activity_id: activityId }),
      });
    } catch (fetchError) {
      // Fire-and-forget — log but don't fail the webhook
      console.warn('Deviation analysis fetch failed (non-blocking):', fetchError.message);
    }

    return { enqueued: true };
  } catch (error) {
    console.error('enqueueDeviationAnalysis error:', error);
    return { enqueued: false, reason: error.message };
  }
}
