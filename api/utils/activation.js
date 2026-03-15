/**
 * Activation Step Tracking Utility
 *
 * Shared utility for marking user activation steps complete.
 * Used by webhook handlers and API routes (all server-side with service key).
 */

const VALID_STEPS = ['connect_device', 'first_sync', 'first_insight', 'first_route', 'first_plan'];

/**
 * Mark an activation step as completed for a user.
 * Idempotent - does nothing if step is already completed.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Server-side Supabase client
 * @param {string} userId - User ID
 * @param {string} stepName - One of: connect_device, first_sync, first_insight, first_route, first_plan
 */
export async function completeActivationStep(supabase, userId, stepName) {
  if (!VALID_STEPS.includes(stepName)) {
    console.error(`Invalid activation step: ${stepName}`);
    return;
  }

  try {
    const { data: activation } = await supabase
      .from('user_activation')
      .select('steps')
      .eq('user_id', userId)
      .single();

    if (!activation) {
      // No activation record - create one (handles race condition with trigger)
      const { error: insertError } = await supabase
        .from('user_activation')
        .insert({ user_id: userId })
        .select()
        .single();

      if (insertError && !insertError.message?.includes('duplicate')) {
        console.error('Failed to create activation record:', insertError);
        return;
      }

      // Re-fetch after creation
      const { data: newActivation } = await supabase
        .from('user_activation')
        .select('steps')
        .eq('user_id', userId)
        .single();

      if (!newActivation) return;
      activation.steps = newActivation.steps;
    }

    const steps = activation.steps;

    // Already completed - no-op
    if (steps[stepName]?.completed) return;

    // Mark step as completed
    steps[stepName] = {
      completed: true,
      completed_at: new Date().toISOString()
    };

    await supabase
      .from('user_activation')
      .update({ steps, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    console.log(`✅ Activation step '${stepName}' completed for user ${userId}`);
  } catch (error) {
    // Non-critical - don't let activation tracking break main flows
    console.error(`⚠️ Activation step update failed (${stepName}):`, error.message);
  }
}

/**
 * Enqueue a proactive insight for generation by the cron processor.
 * Inserts a pending row in proactive_insights table.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Server-side Supabase client
 * @param {string} userId - User ID
 * @param {string} activityId - Activity ID to generate insight for
 * @param {string} insightType - Type of insight (default: 'post_ride')
 */
/**
 * Enqueue a coaching check-in for generation after an activity sync.
 * Guards: user must have an active plan and a persona set (not 'pending').
 * Idempotent — skips if a check-in already exists for this activity.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Server-side Supabase client
 * @param {string} userId - User ID
 * @param {string} activityId - Activity ID that triggered the check-in
 * @returns {Promise<string|null>} The check-in ID if enqueued, null otherwise
 */
export async function enqueueCheckIn(supabase, userId, activityId) {
  try {
    // Guard: user has a persona set (completed intake)
    const { data: settings } = await supabase
      .from('user_coach_settings')
      .select('coaching_persona')
      .eq('user_id', userId)
      .maybeSingle();

    if (!settings?.coaching_persona || settings.coaching_persona === 'pending') {
      console.log(`ℹ️ No persona set for user ${userId}, skipping check-in`);
      return null;
    }

    // Guard: no existing check-in for this activity (idempotent)
    const { data: existing } = await supabase
      .from('coach_check_ins')
      .select('id')
      .eq('activity_id', activityId)
      .maybeSingle();

    if (existing) {
      console.log(`ℹ️ Check-in already exists for activity ${activityId}`);
      return null;
    }

    const { data: checkIn, error } = await supabase
      .from('coach_check_ins')
      .insert({
        user_id: userId,
        activity_id: activityId,
        persona_id: settings.coaching_persona,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to enqueue check-in:', error);
      return null;
    }

    console.log(`📋 Coach check-in enqueued for activity ${activityId}`);
    return checkIn.id;
  } catch (error) {
    // Non-critical — don't let check-in tracking break main flows
    console.error('⚠️ Failed to enqueue check-in:', error.message);
    return null;
  }
}

export async function enqueueProactiveInsight(supabase, userId, activityId, insightType = 'post_ride') {
  try {
    // Check if an insight already exists for this activity
    const { data: existing } = await supabase
      .from('proactive_insights')
      .select('id')
      .eq('activity_id', activityId)
      .maybeSingle();

    if (existing) {
      console.log(`ℹ️ Insight already exists for activity ${activityId}`);
      return;
    }

    const { error } = await supabase
      .from('proactive_insights')
      .insert({
        user_id: userId,
        activity_id: activityId,
        insight_type: insightType,
        status: 'pending'
      });

    if (error) {
      console.error('Failed to enqueue proactive insight:', error);
      return;
    }

    console.log(`📋 Proactive insight enqueued for activity ${activityId}`);
  } catch (error) {
    console.error('⚠️ Failed to enqueue proactive insight:', error.message);
  }
}
