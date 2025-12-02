import { supabase } from '../supabase';

/**
 * Athlete Workout Service
 * Handles athlete-side workout operations: viewing, completing, rating, and requesting modifications
 */

/**
 * Get athlete's upcoming workouts
 * @param {string} athleteId - Athlete user ID
 * @param {number} daysAhead - Number of days to look ahead (default 7)
 * @returns {Promise} Upcoming workouts array
 */
export const getUpcomingWorkouts = async (athleteId, daysAhead = 7) => {
  try {
    const { data, error } = await supabase
      .rpc('get_athlete_upcoming_workouts', {
        athlete_user_id: athleteId,
        days_ahead: daysAhead
      });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching upcoming workouts:', err);
    return { data: null, error: err };
  }
};

/**
 * Get athlete's workout history
 * @param {string} athleteId - Athlete user ID
 * @param {number} limit - Number of workouts to return (default 20)
 * @returns {Promise} Workout history array
 */
export const getWorkoutHistory = async (athleteId, limit = 20) => {
  try {
    const { data, error} = await supabase
      .rpc('get_athlete_workout_history', {
        athlete_user_id: athleteId,
        limit_count: limit
      });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching workout history:', err);
    return { data: null, error: err };
  }
};

/**
 * Get athlete's workout statistics
 * @param {string} athleteId - Athlete user ID
 * @param {Date} dateFrom - Start date for stats period
 * @param {Date} dateTo - End date for stats period
 * @returns {Promise} Statistics object
 */
export const getWorkoutStats = async (athleteId, dateFrom = null, dateTo = null) => {
  try {
    const params = { athlete_user_id: athleteId };

    if (dateFrom) {
      params.date_from = dateFrom.toISOString().split('T')[0];
    }
    if (dateTo) {
      params.date_to = dateTo.toISOString().split('T')[0];
    }

    const { data, error } = await supabase
      .rpc('get_athlete_workout_stats', params);

    if (error) throw error;
    return { data: data?.[0] || null, error: null };
  } catch (err) {
    console.error('Error fetching workout stats:', err);
    return { data: null, error: err };
  }
};

/**
 * Get workouts for a specific date range
 * @param {string} athleteId - Athlete user ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise} Workouts array
 */
export const getWorkoutsByDateRange = async (athleteId, startDate, endDate) => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .select(`
        *,
        template:workout_templates (
          id,
          name,
          description,
          structure,
          category,
          difficulty_level,
          primary_zone,
          intensity_factor,
          tags
        )
      `)
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', startDate.toISOString().split('T')[0])
      .lte('scheduled_date', endDate.toISOString().split('T')[0])
      .order('scheduled_date')
      .order('day_of_week');

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching workouts by date range:', err);
    return { data: null, error: err };
  }
};

/**
 * Get single workout by ID with full template details
 * @param {string} workoutId - Planned workout ID
 * @returns {Promise} Workout object
 */
export const getWorkoutById = async (workoutId) => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .select(`
        *,
        template:workout_templates (
          id,
          name,
          description,
          structure,
          category,
          difficulty_level,
          terrain_type,
          primary_zone,
          intensity_factor,
          focus_area,
          tags,
          coach_notes
        )
      `)
      .eq('id', workoutId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching workout by ID:', err);
    return { data: null, error: err };
  }
};

/**
 * Mark workout as completed
 * @param {string} workoutId - Planned workout ID
 * @param {object} completionData - Completion details
 * @returns {Promise} Updated workout
 */
export const completeWorkout = async (workoutId, completionData = {}) => {
  try {
    const updateData = {
      completion_status: 'completed',
      completed_at: new Date().toISOString(),
      actual_tss: completionData.actualTss || null,
      actual_duration: completionData.actualDuration || null,
      athlete_rating: completionData.rating || null,
      athlete_feedback: completionData.feedback || null
    };

    const { data, error } = await supabase
      .from('planned_workouts')
      .update(updateData)
      .eq('id', workoutId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error completing workout:', err);
    return { data: null, error: err };
  }
};

/**
 * Add or update feedback for a workout
 * @param {string} workoutId - Planned workout ID
 * @param {object} feedbackData - Feedback details
 * @returns {Promise} Updated workout
 */
export const addWorkoutFeedback = async (workoutId, feedbackData) => {
  try {
    const updateData = {
      athlete_rating: feedbackData.rating || null,
      athlete_feedback: feedbackData.feedback || null
    };

    const { data, error } = await supabase
      .from('planned_workouts')
      .update(updateData)
      .eq('id', workoutId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error adding workout feedback:', err);
    return { data: null, error: err };
  }
};

/**
 * Skip workout with reason
 * @param {string} workoutId - Planned workout ID
 * @param {string} reason - Reason for skipping
 * @returns {Promise} Updated workout
 */
export const skipWorkout = async (workoutId, reason = '') => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .update({
        completion_status: 'skipped',
        skipped_reason: reason,
        completed_at: new Date().toISOString()
      })
      .eq('id', workoutId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error skipping workout:', err);
    return { data: null, error: err };
  }
};

/**
 * Request workout modification
 * @param {string} workoutId - Planned workout ID
 * @param {string} athleteId - Athlete user ID
 * @param {string} requestType - Type of request (too_hard, too_easy, swap, reschedule, rest_day, other)
 * @param {string} message - Optional message to coach
 * @returns {Promise} Created modification request
 */
export const requestWorkoutModification = async (workoutId, athleteId, requestType, message = '') => {
  try {
    const { data, error } = await supabase
      .from('workout_modification_requests')
      .insert({
        planned_workout_id: workoutId,
        athlete_id: athleteId,
        request_type: requestType,
        message: message,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error requesting workout modification:', err);
    return { data: null, error: err };
  }
};

/**
 * Get athlete's modification requests
 * @param {string} athleteId - Athlete user ID
 * @param {string} status - Filter by status (pending, approved, declined) - optional
 * @returns {Promise} Modification requests array
 */
export const getModificationRequests = async (athleteId, status = null) => {
  try {
    let query = supabase
      .from('workout_modification_requests')
      .select(`
        *,
        workout:planned_workouts (
          id,
          scheduled_date,
          workout_type,
          target_tss,
          template:workout_templates (
            name
          )
        )
      `)
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching modification requests:', err);
    return { data: null, error: err };
  }
};

/**
 * Get today's workout
 * @param {string} athleteId - Athlete user ID
 * @returns {Promise} Today's workout or null
 */
export const getTodaysWorkout = async (athleteId) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('planned_workouts')
      .select(`
        *,
        template:workout_templates (
          id,
          name,
          description,
          structure,
          category,
          difficulty_level,
          primary_zone,
          intensity_factor,
          tags
        )
      `)
      .eq('athlete_id', athleteId)
      .eq('scheduled_date', today)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching today\'s workout:', err);
    return { data: null, error: err };
  }
};

/**
 * Get this week's workouts
 * @param {string} athleteId - Athlete user ID
 * @returns {Promise} This week's workouts array
 */
export const getThisWeeksWorkouts = async (athleteId) => {
  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return await getWorkoutsByDateRange(
      athleteId,
      monday,
      sunday
    );
  } catch (err) {
    console.error('Error fetching this week\'s workouts:', err);
    return { data: null, error: err };
  }
};

/**
 * Undo workout completion (revert to scheduled)
 * @param {string} workoutId - Planned workout ID
 * @returns {Promise} Updated workout
 */
export const undoWorkoutCompletion = async (workoutId) => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .update({
        completion_status: 'scheduled',
        completed_at: null,
        actual_tss: null,
        actual_duration: null,
        athlete_rating: null,
        athlete_feedback: null,
        skipped_reason: null
      })
      .eq('id', workoutId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error undoing workout completion:', err);
    return { data: null, error: err };
  }
};

// Export as default object
const athleteWorkoutService = {
  getUpcomingWorkouts,
  getWorkoutHistory,
  getWorkoutStats,
  getWorkoutsByDateRange,
  getWorkoutById,
  completeWorkout,
  addWorkoutFeedback,
  skipWorkout,
  requestWorkoutModification,
  getModificationRequests,
  getTodaysWorkout,
  getThisWeeksWorkouts,
  undoWorkoutCompletion
};

export default athleteWorkoutService;
