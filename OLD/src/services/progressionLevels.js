// Progression Levels Service
// Manages user fitness levels (1-10 scale) across 7 training zones

import { supabase } from '../supabase';

/**
 * Get all progression levels for a user
 * @param {string} userId - User UUID
 * @returns {Promise<Array>}
 */
export const getProgressionLevels = async (userId) => {
  try {
    const { data, error } = await supabase.rpc('get_progression_levels', {
      user_uuid: userId
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting progression levels:', error);
    throw error;
  }
};

/**
 * Get progression level for a specific zone
 * @param {string} userId - User UUID
 * @param {string} zoneName - Zone name (e.g., 'threshold', 'vo2max')
 * @returns {Promise<number>} Level (1.0-10.0)
 */
export const getProgressionLevelForZone = async (userId, zoneName) => {
  try {
    const { data, error } = await supabase.rpc('get_progression_level_for_zone', {
      user_uuid: userId,
      zone_name: zoneName
    });

    if (error) throw error;

    return data || 3.0; // Default to 3.0 if not found
  } catch (error) {
    console.error('Error getting progression level for zone:', error);
    throw error;
  }
};

/**
 * Initialize progression levels for a new user (all zones at 3.0)
 * @param {string} userId - User UUID
 */
export const initializeProgressionLevels = async (userId) => {
  try {
    const { error } = await supabase.rpc('initialize_progression_levels', {
      user_uuid: userId
    });

    if (error) throw error;
  } catch (error) {
    console.error('Error initializing progression levels:', error);
    throw error;
  }
};

/**
 * Update progression level for a zone
 * @param {string} userId - User UUID
 * @param {string} zoneName - Zone name
 * @param {number} levelChange - Amount to change (+0.3, -0.5, etc.)
 * @param {Object} options - Optional parameters
 * @returns {Promise<number>} New level
 */
export const updateProgressionLevel = async (userId, zoneName, levelChange, options = {}) => {
  const {
    reason = 'manual_adjustment',
    routeId = null,
    plannedWorkoutId = null
  } = options;

  try {
    const { data, error } = await supabase.rpc('update_progression_level', {
      user_uuid: userId,
      zone_name: zoneName,
      level_change: levelChange,
      reason_text: reason,
      route_id_param: routeId,
      planned_workout_id_param: plannedWorkoutId
    });

    if (error) throw error;

    return data; // Returns new level
  } catch (error) {
    console.error('Error updating progression level:', error);
    throw error;
  }
};

/**
 * Apply workout results to update progression level
 * This is the main function called after a workout is completed
 * @param {string} userId - User UUID
 * @param {string} zoneName - Zone name
 * @param {number} workoutLevel - Difficulty of the workout (1.0-10.0)
 * @param {number} completionPercentage - % of workout completed (0-100)
 * @param {number} perceivedExertion - RPE (1-10)
 * @param {Object} options - Optional parameters
 * @returns {Promise<number>} New progression level
 */
export const applyWorkoutToProgression = async (
  userId,
  zoneName,
  workoutLevel,
  completionPercentage,
  perceivedExertion,
  options = {}
) => {
  const { routeId = null, plannedWorkoutId = null } = options;

  try {
    const { data, error } = await supabase.rpc('apply_workout_to_progression', {
      user_uuid: userId,
      zone_name: zoneName,
      workout_level_param: workoutLevel,
      completion_percentage: completionPercentage,
      perceived_exertion: perceivedExertion,
      route_id_param: routeId,
      planned_workout_id_param: plannedWorkoutId
    });

    if (error) throw error;

    return data; // Returns new level
  } catch (error) {
    console.error('Error applying workout to progression:', error);
    throw error;
  }
};

/**
 * Increment workout count for a zone
 * @param {string} userId - User UUID
 * @param {string} zoneName - Zone name
 * @param {string} workoutDate - Date of workout (YYYY-MM-DD)
 */
export const incrementZoneWorkoutCount = async (userId, zoneName, workoutDate = null) => {
  try {
    const { error } = await supabase.rpc('increment_zone_workout_count', {
      user_uuid: userId,
      zone_name: zoneName,
      workout_date: workoutDate || new Date().toISOString().split('T')[0]
    });

    if (error) throw error;
  } catch (error) {
    console.error('Error incrementing zone workout count:', error);
    throw error;
  }
};

/**
 * Get progression level history for a zone
 * @param {string} userId - User UUID
 * @param {string} zoneName - Zone name (optional, null for all zones)
 * @param {number} daysBack - Number of days to look back
 * @returns {Promise<Array>}
 */
export const getProgressionHistory = async (userId, zoneName = null, daysBack = 90) => {
  try {
    const { data, error } = await supabase.rpc('get_progression_history', {
      user_uuid: userId,
      zone_name: zoneName,
      days_back: daysBack
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting progression history:', error);
    throw error;
  }
};

/**
 * Seed progression levels from existing RPE data
 * Analyzes past workout feedback to estimate initial levels
 * @param {string} userId - User UUID
 * @returns {Promise<string>} Result message
 */
export const seedProgressionFromRPE = async (userId) => {
  try {
    const { data, error } = await supabase.rpc('seed_progression_from_rpe_data', {
      user_uuid: userId
    });

    if (error) throw error;

    return data; // Returns message like "Seeded 5 zones from RPE data"
  } catch (error) {
    console.error('Error seeding progression from RPE:', error);
    throw error;
  }
};

/**
 * Calculate level adjustment based on workout performance (client-side calculation)
 * Mirrors the database function for preview purposes
 * @param {number} completionPercentage - 0-100
 * @param {number} perceivedExertion - 1-10
 * @param {number} workoutLevel - 1.0-10.0
 * @param {number} currentLevel - User's current level in zone
 * @returns {number} Adjustment amount (+0.3, -0.5, etc.)
 */
export const calculateLevelAdjustment = (
  completionPercentage,
  perceivedExertion,
  workoutLevel,
  currentLevel
) => {
  const levelDiff = workoutLevel - currentLevel;
  let adjustment = 0;

  // Success case: completed >=90% and RPE was manageable
  if (completionPercentage >= 90) {
    if (perceivedExertion <= 7) {
      adjustment = 0.3; // Easy success
    } else if (perceivedExertion <= 9) {
      adjustment = 0.2; // Hard but successful
    } else {
      adjustment = 0.1; // Barely made it
    }
  }
  // Partial completion (70-89%)
  else if (completionPercentage >= 70) {
    if (perceivedExertion <= 8) {
      adjustment = 0.1; // Partial but felt okay
    } else {
      adjustment = 0.0; // Struggled - no change
    }
  }
  // Poor completion (50-69%)
  else if (completionPercentage >= 50) {
    if (perceivedExertion >= 9) {
      adjustment = -0.3; // Really struggled
    } else {
      adjustment = -0.1; // Didn't complete but wasn't maxed out
    }
  }
  // Failure (<50% completion)
  else {
    adjustment = -0.5;
  }

  // If workout was way above their level, be more lenient
  if (levelDiff > 2.0 && adjustment < 0) {
    adjustment = adjustment / 2.0; // Halve the penalty
  }

  // If workout was way below their level, limit the gains
  if (levelDiff < -2.0 && adjustment > 0) {
    adjustment = adjustment / 2.0; // Halve the increase
  }

  return adjustment;
};

/**
 * Get progression level label/description
 * @param {number} level - Level (1.0-10.0)
 * @returns {Object} {label, description, color}
 */
export const getProgressionLevelInfo = (level) => {
  if (level < 2.0) {
    return {
      label: 'Beginner',
      description: 'Just starting zone training',
      color: '#868e96'
    };
  } else if (level < 3.0) {
    return {
      label: 'Novice',
      description: 'Building foundational fitness',
      color: '#adb5bd'
    };
  } else if (level < 5.0) {
    return {
      label: 'Intermediate',
      description: 'Building zone-specific fitness',
      color: '#4dabf7'
    };
  } else if (level < 6.0) {
    return {
      label: 'Trained',
      description: 'Solid fitness in this zone',
      color: '#51cf66'
    };
  } else if (level < 8.0) {
    return {
      label: 'Advanced',
      description: 'Strong fitness in this zone',
      color: '#ff922b'
    };
  } else if (level < 9.0) {
    return {
      label: 'Expert',
      description: 'Very high fitness level',
      color: '#ff6b6b'
    };
  } else {
    return {
      label: 'Elite',
      description: 'Peak zone performance',
      color: '#862e9c'
    };
  }
};

/**
 * Format progression level for display
 * @param {number} level - Level (1.0-10.0)
 * @param {boolean} includeLabel - Include label text
 * @returns {string}
 */
export const formatProgressionLevel = (level, includeLabel = false) => {
  const formatted = level.toFixed(1);
  if (includeLabel) {
    const info = getProgressionLevelInfo(level);
    return `${formatted} (${info.label})`;
  }
  return formatted;
};

/**
 * Get zone name label for display
 * @param {string} zoneName - Zone name (e.g., 'vo2max')
 * @returns {string} Display label (e.g., 'VO2max')
 */
export const getZoneLabel = (zoneName) => {
  const labels = {
    recovery: 'Recovery',
    endurance: 'Endurance',
    tempo: 'Tempo',
    sweet_spot: 'Sweet Spot',
    threshold: 'Threshold',
    vo2max: 'VO2max',
    anaerobic: 'Anaerobic'
  };
  return labels[zoneName] || zoneName;
};

/**
 * Get all zone names in order
 * @returns {Array<string>}
 */
export const getAllZoneNames = () => {
  return ['recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'];
};
