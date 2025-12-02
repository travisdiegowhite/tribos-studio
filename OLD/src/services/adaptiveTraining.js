// Adaptive Training Service
// Automatically adjusts upcoming workouts based on performance, fatigue, and progression

import { supabase } from '../supabase';

/**
 * Get adaptation settings for a user
 * @param {string} userId - User UUID
 * @returns {Promise<Object>}
 */
export const getAdaptationSettings = async (userId) => {
  try {
    const { data, error } = await supabase.rpc('get_adaptation_settings', {
      user_uuid: userId
    });

    if (error) throw error;

    return data?.[0] || {
      adaptive_enabled: true,
      auto_apply: false,
      adaptation_sensitivity: 'moderate',
      min_days_before_workout: 2,
      tsb_fatigued_threshold: -30,
      tsb_fresh_threshold: 5
    };
  } catch (error) {
    console.error('Error getting adaptation settings:', error);
    throw error;
  }
};

/**
 * Update adaptation settings for a user
 * @param {string} userId - User UUID
 * @param {Object} settings - Settings to update
 */
export const updateAdaptationSettings = async (userId, settings) => {
  try {
    const { error } = await supabase
      .from('adaptation_settings')
      .upsert({
        user_id: userId,
        ...settings,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error updating adaptation settings:', error);
    throw error;
  }
};

/**
 * Get recent training metrics for adaptation decisions
 * @param {string} userId - User UUID
 * @param {number} daysBack - Number of days to analyze
 * @returns {Promise<Object>}
 */
export const getRecentTrainingMetrics = async (userId, daysBack = 7) => {
  try {
    const { data, error } = await supabase.rpc('get_recent_training_metrics', {
      user_uuid: userId,
      days_back: daysBack
    });

    if (error) throw error;

    return data?.[0] || {
      completion_rate: 0,
      avg_rpe: null,
      workouts_completed: 0,
      workouts_missed: 0,
      avg_completion_percentage: 0,
      current_tsb: 0
    };
  } catch (error) {
    console.error('Error getting recent training metrics:', error);
    throw error;
  }
};

/**
 * Evaluate if a workout should be adapted
 * @param {string} userId - User UUID
 * @param {string} workoutId - Planned workout UUID
 * @returns {Promise<Object>} Evaluation result
 */
export const evaluateWorkoutAdaptation = async (userId, workoutId) => {
  try {
    const { data, error } = await supabase.rpc('evaluate_workout_adaptation', {
      user_uuid: userId,
      workout_id: workoutId
    });

    if (error) throw error;

    return data?.[0] || {
      should_adapt: false,
      adaptation_type: 'no_change',
      new_level: null,
      level_change: 0,
      reason: 'No adaptation needed',
      confidence: 0
    };
  } catch (error) {
    console.error('Error evaluating workout adaptation:', error);
    throw error;
  }
};

/**
 * Apply an adaptation to a workout
 * @param {string} userId - User UUID
 * @param {string} workoutId - Planned workout UUID
 * @param {string} adaptationType - Type of adaptation
 * @param {number} newLevel - New workout level
 * @param {string} reason - Reason for adaptation
 * @param {boolean} autoAccept - Auto-accept or require user approval
 * @returns {Promise<string>} Adaptation ID
 */
export const applyAdaptation = async (
  userId,
  workoutId,
  adaptationType,
  newLevel,
  reason,
  autoAccept = false
) => {
  try {
    const { data, error } = await supabase.rpc('apply_adaptation', {
      user_uuid: userId,
      workout_id: workoutId,
      adaptation_type_param: adaptationType,
      new_level: newLevel,
      reason_param: reason,
      auto_accept: autoAccept
    });

    if (error) throw error;

    return data; // Returns adaptation ID
  } catch (error) {
    console.error('Error applying adaptation:', error);
    throw error;
  }
};

/**
 * Accept or reject a pending adaptation
 * @param {string} adaptationId - Adaptation UUID
 * @param {boolean} accept - True to accept, false to reject
 * @param {string} userFeedback - Optional user feedback
 */
export const respondToAdaptation = async (adaptationId, accept, userFeedback = null) => {
  try {
    const { error } = await supabase.rpc('respond_to_adaptation', {
      adaptation_id_param: adaptationId,
      accept,
      user_feedback_param: userFeedback
    });

    if (error) throw error;
  } catch (error) {
    console.error('Error responding to adaptation:', error);
    throw error;
  }
};

/**
 * Run adaptive training evaluation for all upcoming workouts
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} Array of recommended adaptations
 */
export const runAdaptiveTraining = async (userId) => {
  try {
    const { data, error } = await supabase.rpc('run_adaptive_training', {
      user_uuid: userId
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error running adaptive training:', error);
    throw error;
  }
};

/**
 * Get adaptation history for a user
 * @param {string} userId - User UUID
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Array>}
 */
export const getAdaptationHistory = async (userId, limit = 20) => {
  try {
    const { data, error } = await supabase
      .from('adaptation_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting adaptation history:', error);
    throw error;
  }
};

/**
 * Get pending adaptations (not yet accepted/rejected)
 * @param {string} userId - User UUID
 * @returns {Promise<Array>}
 */
export const getPendingAdaptations = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('adaptation_history')
      .select('*')
      .eq('user_id', userId)
      .is('was_accepted', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting pending adaptations:', error);
    throw error;
  }
};

/**
 * Get adaptation type label for display
 * @param {string} adaptationType
 * @returns {string}
 */
export const getAdaptationTypeLabel = (adaptationType) => {
  const labels = {
    increase: 'Increase Difficulty',
    decrease: 'Decrease Difficulty',
    substitute: 'Substitute Workout',
    skip: 'Skip Workout',
    reschedule: 'Reschedule',
    no_change: 'No Change'
  };
  return labels[adaptationType] || adaptationType;
};

/**
 * Get adaptation type color
 * @param {string} adaptationType
 * @returns {string}
 */
export const getAdaptationTypeColor = (adaptationType) => {
  const colors = {
    increase: 'green',
    decrease: 'orange',
    substitute: 'blue',
    skip: 'red',
    reschedule: 'violet',
    no_change: 'gray'
  };
  return colors[adaptationType] || 'gray';
};

/**
 * Get adaptation type icon name
 * @param {string} adaptationType
 * @returns {string} Tabler icon name
 */
export const getAdaptationTypeIcon = (adaptationType) => {
  const icons = {
    increase: 'IconTrendingUp',
    decrease: 'IconTrendingDown',
    substitute: 'IconReplace',
    skip: 'IconX',
    reschedule: 'IconCalendar',
    no_change: 'IconMinus'
  };
  return icons[adaptationType] || 'IconInfoCircle';
};

/**
 * Format adaptation reason for display
 * @param {string} reason - Full reason text
 * @returns {string} Shortened/formatted reason
 */
export const formatAdaptationReason = (reason) => {
  if (!reason) return 'No reason provided';
  // Truncate long reasons
  if (reason.length > 100) {
    return reason.substring(0, 97) + '...';
  }
  return reason;
};

/**
 * Calculate confidence level label
 * @param {number} confidence - Confidence score (0-1)
 * @returns {Object} {label, color}
 */
export const getConfidenceInfo = (confidence) => {
  if (confidence >= 0.8) {
    return { label: 'High Confidence', color: 'green' };
  } else if (confidence >= 0.6) {
    return { label: 'Medium Confidence', color: 'yellow' };
  } else {
    return { label: 'Low Confidence', color: 'orange' };
  }
};
