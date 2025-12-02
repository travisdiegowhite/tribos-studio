import { supabase } from '../supabase';

/**
 * Workout Service
 * Handles all workout template operations including fetching, creating, and sharing
 */

/**
 * Get all workouts accessible to a user
 * Returns system templates (library workouts), user's custom workouts, and shared workouts
 * @param {string} userId - User ID
 * @returns {Promise} Workout templates array
 */
export const getAccessibleWorkouts = async (userId) => {
  try {
    if (!userId) {
      // If no user, return only system templates
      const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('is_system_template', true)
        .eq('is_public', true)
        .order('name');

      if (error) throw error;
      return { data, error: null };
    }

    // Use database function to get all accessible workouts
    const { data, error } = await supabase
      .rpc('get_accessible_workouts', { user_id: userId });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching accessible workouts:', err);
    return { data: null, error: err };
  }
};

/**
 * Get a single workout by ID
 * @param {string} workoutId - Workout template ID
 * @returns {Promise} Workout template object
 */
export const getWorkoutById = async (workoutId) => {
  try {
    const { data, error } = await supabase
      .from('workout_templates')
      .select('*')
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
 * Search workouts by tag
 * @param {string} userId - User ID
 * @param {string} tag - Tag to search for
 * @returns {Promise} Matching workouts array
 */
export const searchWorkoutsByTag = async (userId, tag) => {
  try {
    const { data, error } = await supabase
      .rpc('search_workouts_by_tag', {
        user_id: userId,
        search_tag: tag
      });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error searching workouts by tag:', err);
    return { data: null, error: err };
  }
};

/**
 * Get system library workouts only
 * @returns {Promise} System workout templates array
 */
export const getLibraryWorkouts = async () => {
  try {
    const { data, error } = await supabase
      .from('workout_templates')
      .select('*')
      .eq('is_system_template', true)
      .eq('is_public', true)
      .order('name');

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching library workouts:', err);
    return { data: null, error: err };
  }
};

/**
 * Get user's custom workouts
 * @param {string} userId - User ID
 * @returns {Promise} Custom workouts array
 */
export const getUserCustomWorkouts = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('workout_templates')
      .select('*')
      .eq('created_by_user_id', userId)
      .eq('is_system_template', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching custom workouts:', err);
    return { data: null, error: err };
  }
};

/**
 * Get workouts shared with user
 * @param {string} userId - User ID
 * @returns {Promise} Shared workouts array
 */
export const getSharedWorkouts = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('workout_shares')
      .select(`
        *,
        workout:workout_templates (*),
        shared_by:profiles!shared_by_user_id (display_name)
      `)
      .eq('shared_with_user_id', userId);

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching shared workouts:', err);
    return { data: null, error: err };
  }
};

/**
 * Create a custom workout
 * @param {string} userId - User ID (creator)
 * @param {object} workoutData - Workout template data
 * @returns {Promise} Created workout object
 */
export const createCustomWorkout = async (userId, workoutData) => {
  try {
    const { data, error } = await supabase
      .from('workout_templates')
      .insert({
        ...workoutData,
        created_by_user_id: userId,
        is_system_template: false,
        is_public: workoutData.is_public || false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error creating custom workout:', err);
    return { data: null, error: err };
  }
};

/**
 * Update a custom workout
 * @param {string} workoutId - Workout ID
 * @param {object} workoutData - Updated workout data
 * @returns {Promise} Updated workout object
 */
export const updateCustomWorkout = async (workoutId, workoutData) => {
  try {
    const { data, error } = await supabase
      .from('workout_templates')
      .update({
        ...workoutData,
        updated_at: new Date().toISOString()
      })
      .eq('id', workoutId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error updating custom workout:', err);
    return { data: null, error: err };
  }
};

/**
 * Delete a custom workout
 * @param {string} workoutId - Workout ID
 * @returns {Promise} Success status
 */
export const deleteCustomWorkout = async (workoutId) => {
  try {
    const { error } = await supabase
      .from('workout_templates')
      .delete()
      .eq('id', workoutId);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error('Error deleting custom workout:', err);
    return { error: err };
  }
};

/**
 * Share a workout with another user
 * @param {string} workoutId - Workout ID
 * @param {string} sharedWithUserId - User to share with
 * @param {boolean} canEdit - Whether sharee can edit (future feature)
 * @returns {Promise} Share record
 */
export const shareWorkoutWithUser = async (workoutId, sharedWithUserId, canEdit = false) => {
  try {
    const { data, error } = await supabase
      .from('workout_shares')
      .insert({
        workout_id: workoutId,
        shared_with_user_id: sharedWithUserId,
        can_edit: canEdit,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error sharing workout:', err);
    return { data: null, error: err };
  }
};

/**
 * Unshare a workout
 * @param {string} workoutId - Workout ID
 * @param {string} sharedWithUserId - User to unshare from
 * @returns {Promise} Success status
 */
export const unshareWorkout = async (workoutId, sharedWithUserId) => {
  try {
    const { error } = await supabase
      .from('workout_shares')
      .delete()
      .eq('workout_id', workoutId)
      .eq('shared_with_user_id', sharedWithUserId);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error('Error unsharing workout:', err);
    return { error: err };
  }
};

/**
 * Get workout statistics for a user
 * @param {string} userId - User ID
 * @returns {Promise} Statistics object
 */
export const getWorkoutStats = async (userId) => {
  try {
    // Count custom workouts
    const { data: customCount, error: customError } = await supabase
      .rpc('count_user_custom_workouts', { user_id: userId });

    if (customError) throw customError;

    // Count shared workouts
    const { data: sharedCount, error: sharedError } = await supabase
      .rpc('count_workouts_shared_by_user', { user_id: userId });

    if (sharedError) throw sharedError;

    return {
      data: {
        custom_workouts: customCount || 0,
        workouts_shared: sharedCount || 0
      },
      error: null
    };
  } catch (err) {
    console.error('Error fetching workout stats:', err);
    return { data: null, error: err };
  }
};

/**
 * Get all public workouts (community workouts)
 * Returns workouts marked as public, excluding user's own workouts
 * @returns {Promise} Public workout templates array
 */
export const getPublicWorkouts = async () => {
  try {
    const { data, error } = await supabase
      .from('workout_templates')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error fetching public workouts:', err);
    return { data: null, error: err };
  }
};

// Export as default object
const workoutService = {
  getAccessibleWorkouts,
  getWorkoutById,
  searchWorkoutsByTag,
  getLibraryWorkouts,
  getUserCustomWorkouts,
  getSharedWorkouts,
  createCustomWorkout,
  updateCustomWorkout,
  deleteCustomWorkout,
  shareWorkoutWithUser,
  unshareWorkout,
  getWorkoutStats,
  getPublicWorkouts
};

export default workoutService;
