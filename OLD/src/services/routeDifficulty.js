/**
 * Route Difficulty Service
 *
 * Calculates and manages route difficulty scores:
 * - Difficulty scoring (1-10 scale)
 * - Performance ratio tracking
 * - Route recommendations based on fitness
 */

import { supabase } from '../supabase';

/**
 * Calculates difficulty score for a route
 * @param {string} routeId - UUID of the route
 * @returns {Promise<number>} Difficulty score (1-10)
 */
export async function calculateRouteDifficulty(routeId) {
  try {
    const { data, error } = await supabase.rpc('calculate_route_difficulty', {
      p_route_id: routeId
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error calculating route difficulty:', error);
    throw error;
  }
}

/**
 * Batch calculates difficulty for all routes
 * @param {string} userId - UUID of the user (optional, defaults to all)
 * @returns {Promise<Object>} Summary statistics
 */
export async function calculateAllRouteDifficulties(userId = null) {
  try {
    const { data, error } = await supabase.rpc('calculate_all_route_difficulties', {
      p_user_id: userId
    });

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error calculating all route difficulties:', error);
    throw error;
  }
}

/**
 * Calculates performance ratio for a ride
 * @param {string} rideId - UUID of the ride
 * @param {string} userId - UUID of the user
 * @returns {Promise<number>} Performance ratio (>1 = overperformed)
 */
export async function calculatePerformanceRatio(rideId, userId) {
  try {
    const { data, error } = await supabase.rpc('calculate_performance_ratio', {
      p_ride_id: rideId,
      p_user_id: userId
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error calculating performance ratio:', error);
    throw error;
  }
}

/**
 * Gets route recommendations based on user fitness
 * @param {string} userId - UUID of the user
 * @param {Object} options - Filtering options
 * @returns {Promise<Array>} Recommended routes
 */
export async function getRouteRecommendations(userId, options = {}) {
  const {
    targetZone = null,
    targetDifficultyMin = null,
    targetDifficultyMax = null,
    limit = 10
  } = options;

  try {
    const { data, error } = await supabase.rpc('get_route_recommendations', {
      p_user_id: userId,
      p_target_zone: targetZone,
      p_target_difficulty_min: targetDifficultyMin,
      p_target_difficulty_max: targetDifficultyMax,
      p_limit: limit
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting route recommendations:', error);
    throw error;
  }
}

/**
 * Gets routes by difficulty range
 * @param {string} userId - UUID of the user
 * @param {number} minDifficulty - Minimum difficulty (1-10)
 * @param {number} maxDifficulty - Maximum difficulty (1-10)
 * @returns {Promise<Array>} Filtered routes
 */
export async function getRoutesByDifficulty(userId, minDifficulty, maxDifficulty) {
  try {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('user_id', userId)
      .gte('difficulty_score', minDifficulty)
      .lte('difficulty_score', maxDifficulty)
      .order('difficulty_score', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting routes by difficulty:', error);
    throw error;
  }
}

/**
 * Gets difficulty distribution for user's routes
 * @param {string} userId - UUID of the user
 * @returns {Promise<Object>} Distribution stats
 */
export async function getDifficultyDistribution(userId) {
  try {
    const { data, error } = await supabase
      .from('routes')
      .select('difficulty_score')
      .eq('user_id', userId)
      .not('difficulty_score', 'is', null);

    if (error) throw error;

    const distribution = {
      easy: 0,      // 1-3
      moderate: 0,  // 4-6
      hard: 0,      // 7-8
      extreme: 0    // 9-10
    };

    data.forEach(route => {
      const score = route.difficulty_score;
      if (score <= 3) distribution.easy++;
      else if (score <= 6) distribution.moderate++;
      else if (score <= 8) distribution.hard++;
      else distribution.extreme++;
    });

    return distribution;
  } catch (error) {
    console.error('Error getting difficulty distribution:', error);
    throw error;
  }
}

/**
 * Formats difficulty score for UI display
 * @param {number} score - Difficulty score (1-10)
 * @returns {Object} Formatted difficulty with label, color, icon
 */
export function formatDifficultyScore(score) {
  if (!score) return null;

  let label, color, icon, description;

  if (score <= 2) {
    label = 'Very Easy';
    color = 'green';
    icon = '🟢';
    description = 'Perfect for recovery or easy days';
  } else if (score <= 4) {
    label = 'Easy';
    color = 'lime';
    icon = '🟢';
    description = 'Good for base building';
  } else if (score <= 6) {
    label = 'Moderate';
    color = 'yellow';
    icon = '🟡';
    description = 'Solid workout effort';
  } else if (score <= 8) {
    label = 'Hard';
    color = 'orange';
    icon = '🟠';
    description = 'Challenging route';
  } else {
    label = 'Very Hard';
    color = 'red';
    icon = '🔴';
    description = 'Extreme difficulty';
  }

  return {
    score: score.toFixed(1),
    label,
    color,
    icon,
    description
  };
}

/**
 * Formats performance ratio for UI display
 * @param {number} ratio - Performance ratio
 * @returns {Object} Formatted performance with message, color, icon
 */
export function formatPerformanceRatio(ratio) {
  if (!ratio) return null;

  let message, color, icon, description;

  if (ratio >= 1.15) {
    message = 'Crushed it!';
    color = 'green';
    icon = '🚀';
    description = 'Outstanding performance - way above expected';
  } else if (ratio >= 1.08) {
    message = 'Great ride!';
    color = 'green';
    icon = '💪';
    description = 'Excellent performance - above expected';
  } else if (ratio >= 1.02) {
    message = 'Solid effort';
    color = 'blue';
    icon = '👍';
    description = 'Good performance - slightly above expected';
  } else if (ratio >= 0.98) {
    message = 'As expected';
    color = 'gray';
    icon = '✓';
    description = 'Right on target';
  } else if (ratio >= 0.92) {
    message = 'Tough day';
    color = 'yellow';
    icon = '⚡';
    description = 'Below expected - might be fatigued';
  } else if (ratio >= 0.85) {
    message = 'Struggled';
    color = 'orange';
    icon = '😓';
    description = 'Well below expected - consider recovery';
  } else {
    message = 'Very tough';
    color = 'red';
    icon = '⚠️';
    description = 'Significantly below expected - rest needed';
  }

  return {
    ratio: ratio.toFixed(2),
    percentage: ((ratio - 1) * 100).toFixed(1),
    message,
    color,
    icon,
    description
  };
}

/**
 * Gets difficulty factors breakdown
 * @param {string} routeId - UUID of the route
 * @returns {Promise<Object>} Difficulty factor breakdown
 */
export async function getDifficultyFactors(routeId) {
  try {
    const { data, error } = await supabase
      .from('routes')
      .select('difficulty_score, difficulty_factors')
      .eq('id', routeId)
      .single();

    if (error) throw error;
    return data?.difficulty_factors || null;
  } catch (error) {
    console.error('Error getting difficulty factors:', error);
    throw error;
  }
}

/**
 * Formats difficulty factors for UI display
 * @param {Object} factors - Difficulty factors from database
 * @returns {Array} Formatted factors array
 */
export function formatDifficultyFactors(factors) {
  if (!factors) return [];

  const factorLabels = {
    elevation_score: 'Elevation',
    gradient_score: 'Gradient',
    distance_score: 'Distance',
    duration_score: 'Duration'
  };

  const factorDescriptions = {
    elevation_score: `${factors.elevation_gain?.toFixed(0) || 0}m climbing`,
    gradient_score: `Max ${factors.max_gradient?.toFixed(1) || 0}%, Avg ${factors.avg_grade?.toFixed(1) || 0}%`,
    distance_score: `${factors.distance?.toFixed(1) || 0} km`,
    duration_score: 'Fatigue factor'
  };

  return Object.entries(factors)
    .filter(([key]) => key.endsWith('_score'))
    .map(([key, value]) => ({
      key,
      label: factorLabels[key] || key,
      score: value,
      description: factorDescriptions[key] || ''
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Suggests target difficulty based on training goal
 * @param {string} trainingGoal - 'recovery', 'endurance', 'tempo', etc.
 * @param {number} userFitnessLevel - User's average progression level (1-10)
 * @returns {Object} Suggested difficulty range
 */
export function suggestDifficultyForGoal(trainingGoal, userFitnessLevel = 5) {
  const suggestions = {
    recovery: {
      min: Math.max(1, userFitnessLevel - 3),
      max: Math.max(3, userFitnessLevel - 1),
      description: 'Easy route for active recovery'
    },
    endurance: {
      min: Math.max(2, userFitnessLevel - 2),
      max: Math.min(10, userFitnessLevel + 1),
      description: 'Moderate route for base building'
    },
    tempo: {
      min: Math.max(4, userFitnessLevel - 1),
      max: Math.min(10, userFitnessLevel + 2),
      description: 'Challenging route for tempo work'
    },
    threshold: {
      min: Math.max(5, userFitnessLevel),
      max: Math.min(10, userFitnessLevel + 3),
      description: 'Hard route for threshold training'
    },
    vo2max: {
      min: Math.max(6, userFitnessLevel + 1),
      max: 10,
      description: 'Very hard route for high-intensity work'
    }
  };

  return suggestions[trainingGoal] || suggestions.endurance;
}

/**
 * Compares route difficulty to user's previous performance
 * @param {string} userId - UUID of the user
 * @param {string} routeId - UUID of the route
 * @returns {Promise<Object>} Comparison data
 */
export async function compareToUserHistory(userId, routeId) {
  try {
    // Get route difficulty
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('difficulty_score')
      .eq('id', routeId)
      .single();

    if (routeError) throw routeError;

    // Get user's average difficulty
    const { data: routes, error: routesError } = await supabase
      .from('routes')
      .select('difficulty_score')
      .eq('user_id', userId)
      .not('difficulty_score', 'is', null);

    if (routesError) throw routesError;

    const avgDifficulty = routes.reduce((sum, r) => sum + r.difficulty_score, 0) / routes.length;

    return {
      routeDifficulty: route.difficulty_score,
      userAverage: avgDifficulty,
      comparison: route.difficulty_score > avgDifficulty ? 'harder' : 'easier',
      percentageDiff: ((route.difficulty_score - avgDifficulty) / avgDifficulty * 100).toFixed(1)
    };
  } catch (error) {
    console.error('Error comparing to user history:', error);
    throw error;
  }
}
