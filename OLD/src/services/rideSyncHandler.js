import { supabase } from '../supabase';
import { autoLinkRideToWorkout } from './workoutCompliance';

/**
 * Ride Sync Handler Service
 * Handles post-sync actions: workout linking, RPE prompts, etc.
 */

/**
 * Handle a newly synced ride
 * @param {Object} ride - The synced ride/route object
 * @param {string} userId - User ID
 * @returns {Object} Result with workout link and RPE prompt recommendation
 */
export const handleRideSynced = async (ride, userId) => {
  try {
    console.log('🔄 Processing synced ride:', ride.id, ride.name);

    const result = {
      success: true,
      linkedWorkout: null,
      shouldPromptRPE: false,
      rideAge: null,
    };

    // 1. Try to auto-link to planned workout
    const linkResult = await autoLinkRideToWorkout(userId, ride);
    if (linkResult?.linked) {
      console.log('✅ Auto-linked ride to workout:', linkResult.workout.id);
      result.linkedWorkout = linkResult.workout;
      result.plan = linkResult.plan;
    }

    // 2. Check if should prompt for RPE feedback
    const { data: shouldPrompt, error } = await supabase.rpc('should_prompt_feedback', {
      route_uuid: ride.id,
    });

    if (error) {
      console.error('Error checking RPE prompt:', error);
    } else {
      result.shouldPromptRPE = shouldPrompt === true;

      // Calculate ride age
      const rideDate = new Date(ride.recorded_at || ride.created_at);
      const now = new Date();
      const ageInDays = (now - rideDate) / (1000 * 60 * 60 * 24);
      result.rideAge = ageInDays;

      console.log('📊 RPE Prompt check:', {
        shouldPrompt: result.shouldPromptRPE,
        rideAge: ageInDays.toFixed(1) + ' days',
      });
    }

    return result;
  } catch (err) {
    console.error('Failed to handle synced ride:', err);
    return {
      success: false,
      error: err.message,
      linkedWorkout: null,
      shouldPromptRPE: false,
    };
  }
};

/**
 * Process multiple synced rides in batch
 * @param {Array} rides - Array of synced rides
 * @param {string} userId - User ID
 * @returns {Object} Summary of processed rides
 */
export const handleBatchRideSync = async (rides, userId) => {
  try {
    const results = {
      totalProcessed: 0,
      linkedCount: 0,
      rpePromptCount: 0,
      linkedWorkouts: [],
      ridesToPromptRPE: [],
    };

    for (const ride of rides) {
      const result = await handleRideSynced(ride, userId);

      if (result.success) {
        results.totalProcessed++;

        if (result.linkedWorkout) {
          results.linkedCount++;
          results.linkedWorkouts.push({
            ride: ride,
            workout: result.linkedWorkout,
          });
        }

        if (result.shouldPromptRPE) {
          results.rpePromptCount++;
          results.ridesToPromptRPE.push(ride);
        }
      }
    }

    console.log('📦 Batch sync results:', results);
    return results;
  } catch (err) {
    console.error('Failed to process batch ride sync:', err);
    return {
      totalProcessed: 0,
      linkedCount: 0,
      rpePromptCount: 0,
      error: err.message,
    };
  }
};

/**
 * Get rides that need RPE feedback
 * @param {string} userId - User ID
 * @param {number} maxDays - Maximum age of rides to check (default 7)
 * @returns {Array} Rides needing feedback
 */
export const getRidesNeedingFeedback = async (userId, maxDays = 7) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDays);

    // Get recent rides
    const { data: rides, error: ridesError } = await supabase
      .from('routes')
      .select('id, name, distance_km, duration_seconds, elevation_gain_m, recorded_at, created_at')
      .eq('user_id', userId)
      .gte('recorded_at', cutoffDate.toISOString())
      .order('recorded_at', { ascending: false });

    if (ridesError) throw ridesError;

    // Get existing feedback
    const { data: feedback, error: feedbackError } = await supabase
      .from('workout_feedback')
      .select('route_id')
      .eq('user_id', userId);

    if (feedbackError) throw feedbackError;

    const feedbackRouteIds = new Set(feedback.map(f => f.route_id));

    // Filter rides without feedback
    const needingFeedback = rides.filter(ride => !feedbackRouteIds.has(ride.id));

    console.log(`📋 Found ${needingFeedback.length} rides needing feedback`);
    return needingFeedback;
  } catch (err) {
    console.error('Failed to get rides needing feedback:', err);
    return [];
  }
};

/**
 * Mark a ride as "skip feedback" to prevent future prompts
 * (Adds a placeholder feedback entry)
 */
export const skipRideFeedback = async (userId, routeId) => {
  try {
    const { error } = await supabase
      .from('workout_feedback')
      .insert([{
        user_id: userId,
        route_id: routeId,
        perceived_exertion: 5, // Neutral default
        notes: 'Skipped feedback',
        workout_date: new Date().toISOString().split('T')[0],
      }]);

    if (error) throw error;
    console.log('⏭️ Skipped feedback for ride:', routeId);
    return { success: true };
  } catch (err) {
    console.error('Failed to skip ride feedback:', err);
    return { success: false, error: err.message };
  }
};

export default {
  handleRideSynced,
  handleBatchRideSync,
  getRidesNeedingFeedback,
  skipRideFeedback,
};
