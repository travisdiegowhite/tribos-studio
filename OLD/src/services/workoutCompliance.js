import { supabase } from '../supabase';

/**
 * Workout Compliance Service
 * Functions for tracking and analyzing workout completion
 */

/**
 * Get detailed completion stats for a training plan
 */
export const getPlanCompletionStats = async (planId) => {
  try {
    // Call the database function
    const { data, error } = await supabase.rpc('get_plan_completion_stats', {
      plan_uuid: planId,
    });

    if (error) {
      console.error('Error fetching plan completion stats:', error);
      // Fallback to manual calculation if function doesn't exist
      return await calculateManualStats(planId);
    }

    return data?.[0] || {
      total_workouts: 0,
      completed_workouts: 0,
      completion_rate: 0,
      excellent_count: 0,
      good_count: 0,
      partial_count: 0,
      poor_count: 0,
      skipped_count: 0,
    };
  } catch (err) {
    console.error('Failed to get plan completion stats:', err);
    return await calculateManualStats(planId);
  }
};

/**
 * Fallback manual calculation if RPC function not available
 */
const calculateManualStats = async (planId) => {
  try {
    const { data: workouts, error } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('plan_id', planId)
      .neq('workout_type', 'rest'); // Exclude rest days

    if (error) throw error;

    const total = workouts.length;
    const completed = workouts.filter(w => w.completed).length;

    const stats = {
      total_workouts: total,
      completed_workouts: completed,
      completion_rate: total > 0 ? ((completed / total) * 100).toFixed(1) : 0,
      excellent_count: workouts.filter(w => w.completion_quality === 'excellent').length,
      good_count: workouts.filter(w => w.completion_quality === 'good').length,
      partial_count: workouts.filter(w => w.completion_quality === 'partial').length,
      poor_count: workouts.filter(w => w.completion_quality === 'poor').length,
      skipped_count: workouts.filter(w => w.completion_quality === 'skipped').length,
    };

    return stats;
  } catch (err) {
    console.error('Manual stats calculation failed:', err);
    return {
      total_workouts: 0,
      completed_workouts: 0,
      completion_rate: 0,
      excellent_count: 0,
      good_count: 0,
      partial_count: 0,
      poor_count: 0,
      skipped_count: 0,
    };
  }
};

/**
 * Mark a workout as completed and link to a route
 */
export const completeWorkout = async (workoutId, routeId = null, actualMetrics = {}) => {
  try {
    const updates = {
      completed: true,
      completed_at: new Date().toISOString(),
      route_id: routeId,
    };

    // Add actual metrics if provided
    if (actualMetrics.duration) {
      updates.actual_duration = actualMetrics.duration;
    }
    if (actualMetrics.distance) {
      updates.actual_distance = actualMetrics.distance;
    }
    if (actualMetrics.tss) {
      updates.actual_tss = actualMetrics.tss;
    }

    const { data, error } = await supabase
      .from('planned_workouts')
      .update(updates)
      .eq('id', workoutId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, workout: data };
  } catch (err) {
    console.error('Failed to complete workout:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Un-mark a workout as completed
 */
export const uncompleteWorkout = async (workoutId) => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .update({
        completed: false,
        completed_at: null,
        route_id: null,
        actual_duration: null,
        actual_distance: null,
        actual_tss: null,
        completion_percentage: 0,
        completion_quality: null,
      })
      .eq('id', workoutId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, workout: data };
  } catch (err) {
    console.error('Failed to uncomplete workout:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Link a ride to a planned workout automatically based on date/type
 */
export const autoLinkRideToWorkout = async (userId, route) => {
  try {
    const rideDate = new Date(route.recorded_at || route.created_at);
    const rideDateStr = rideDate.toISOString().split('T')[0];

    // Find active training plans for this user
    const { data: plans, error: planError } = await supabase
      .from('training_plans')
      .select('id, started_at, duration_weeks')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (planError || !plans?.length) return null;

    // For each active plan, find matching workout
    for (const plan of plans) {
      const planStartDate = new Date(plan.started_at);
      const daysSinceStart = Math.floor((rideDate - planStartDate) / (24 * 60 * 60 * 1000));

      if (daysSinceStart < 0) continue; // Ride before plan started

      const weekNumber = Math.floor(daysSinceStart / 7) + 1;
      const dayOfWeek = rideDate.getDay();

      // Find workout for this day
      const { data: workout, error: workoutError } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('plan_id', plan.id)
        .eq('week_number', weekNumber)
        .eq('day_of_week', dayOfWeek)
        .eq('completed', false) // Only link to uncompleted workouts
        .single();

      if (workoutError || !workout) continue;

      // Auto-complete the workout with actual metrics
      const durationMinutes = route.duration_seconds
        ? Math.round(route.duration_seconds / 60)
        : null;

      const result = await completeWorkout(workout.id, route.id, {
        duration: durationMinutes,
        distance: route.distance_km,
        tss: route.training_stress_score,
      });

      if (result.success) {
        return { linked: true, workout: result.workout, plan };
      }
    }

    return null; // No matching workout found
  } catch (err) {
    console.error('Failed to auto-link ride:', err);
    return null;
  }
};

/**
 * Get compliance stats for a specific week
 */
export const getWeekComplianceStats = async (planId, weekNumber) => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('plan_id', planId)
      .eq('week_number', weekNumber);

    if (error) throw error;

    const nonRestWorkouts = data.filter(w => w.workout_type !== 'rest');
    const completed = nonRestWorkouts.filter(w => w.completed).length;
    const total = nonRestWorkouts.length;

    return {
      total,
      completed,
      compliance_rate: total > 0 ? ((completed / total) * 100).toFixed(0) : 0,
      workouts: data,
    };
  } catch (err) {
    console.error('Failed to get week compliance:', err);
    return { total: 0, completed: 0, compliance_rate: 0, workouts: [] };
  }
};
