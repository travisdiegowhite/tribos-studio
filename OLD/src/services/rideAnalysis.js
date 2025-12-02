/**
 * Ride Analysis Service
 *
 * Provides detailed analysis of individual rides including:
 * - Zone time distribution
 * - Peak power efforts
 * - Efficiency metrics (VI, IF, EF)
 * - HR/Power decoupling
 * - Performance ratios
 */

import { supabase } from '../supabase';

/**
 * Analyzes a ride and stores all computed metrics
 * @param {string} rideId - UUID of the ride to analyze
 * @param {string} userId - UUID of the user
 * @returns {Promise<string>} Analysis ID
 */
export async function analyzeRide(rideId, userId) {
  try {
    const { data, error } = await supabase.rpc('analyze_ride', {
      p_ride_id: rideId,
      p_user_id: userId
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error analyzing ride:', error);
    throw error;
  }
}

/**
 * Gets analysis for a ride (computes if doesn't exist)
 * @param {string} rideId - UUID of the ride
 * @param {string} userId - UUID of the user
 * @returns {Promise<Object>} Ride analysis data
 */
export async function getRideAnalysis(rideId, userId) {
  try {
    const { data, error } = await supabase.rpc('get_ride_analysis', {
      p_ride_id: rideId,
      p_user_id: userId
    });

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error getting ride analysis:', error);
    throw error;
  }
}

/**
 * Gets zone time distribution for a ride
 * @param {string} rideId - UUID of the ride
 * @param {string} userId - UUID of the user
 * @returns {Promise<Object>} Zone distribution {recovery: 0, endurance: 1200, ...}
 */
export async function getZoneDistribution(rideId, userId) {
  try {
    const analysis = await getRideAnalysis(rideId, userId);
    return analysis?.zone_distribution || null;
  } catch (error) {
    console.error('Error getting zone distribution:', error);
    throw error;
  }
}

/**
 * Gets peak powers for a ride
 * @param {string} rideId - UUID of the ride
 * @param {string} userId - UUID of the user
 * @returns {Promise<Object>} Peak powers {5s: 1200, 1min: 450, ...}
 */
export async function getPeakPowers(rideId, userId) {
  try {
    const analysis = await getRideAnalysis(rideId, userId);
    return analysis?.peak_powers || null;
  } catch (error) {
    console.error('Error getting peak powers:', error);
    throw error;
  }
}

/**
 * Gets efficiency metrics for a ride
 * @param {string} rideId - UUID of the ride
 * @param {string} userId - UUID of the user
 * @returns {Promise<Object>} Efficiency metrics {vi, if, ef, decoupling}
 */
export async function getEfficiencyMetrics(rideId, userId) {
  try {
    const analysis = await getRideAnalysis(rideId, userId);

    if (!analysis) return null;

    return {
      variabilityIndex: analysis.variability_index,
      intensityFactor: analysis.intensity_factor,
      efficiencyFactor: analysis.efficiency_factor,
      hrPowerDecoupling: analysis.hr_power_decoupling,
      performanceRatio: analysis.performance_ratio
    };
  } catch (error) {
    console.error('Error getting efficiency metrics:', error);
    throw error;
  }
}

/**
 * Formats zone distribution for UI display
 * @param {Object} zoneDistribution - Raw zone distribution from DB
 * @returns {Array} Formatted array of {zone, seconds, percentage, color}
 */
export function formatZoneDistribution(zoneDistribution) {
  if (!zoneDistribution) return [];

  const zoneColors = {
    recovery: '#10b981',      // green
    endurance: '#3b82f6',     // blue
    tempo: '#eab308',         // yellow
    sweet_spot: '#f97316',    // orange
    threshold: '#ef4444',     // red
    vo2max: '#a855f7',        // purple
    anaerobic: '#7c3aed'      // dark purple
  };

  const zoneLabels = {
    recovery: 'Recovery',
    endurance: 'Endurance',
    tempo: 'Tempo',
    sweet_spot: 'Sweet Spot',
    threshold: 'Threshold',
    vo2max: 'VO2max',
    anaerobic: 'Anaerobic'
  };

  const totalSeconds = Object.values(zoneDistribution).reduce((sum, val) => sum + val, 0);

  return Object.entries(zoneDistribution).map(([zone, seconds]) => ({
    zone,
    label: zoneLabels[zone] || zone,
    seconds,
    minutes: Math.round(seconds / 60),
    percentage: totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0,
    color: zoneColors[zone] || '#6b7280'
  })).filter(z => z.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

/**
 * Formats peak powers for UI display
 * @param {Object} peakPowers - Raw peak powers from DB
 * @returns {Array} Formatted array of {duration, power, label}
 */
export function formatPeakPowers(peakPowers) {
  if (!peakPowers) return [];

  const labels = {
    '5s': '5 sec',
    '1min': '1 min',
    '5min': '5 min',
    '20min': '20 min',
    '60min': '60 min'
  };

  return Object.entries(peakPowers)
    .filter(([_, power]) => power != null)
    .map(([duration, power]) => ({
      duration,
      label: labels[duration] || duration,
      power,
      powerFormatted: `${power}W`
    }));
}

/**
 * Gets human-readable efficiency interpretation
 * @param {Object} metrics - Efficiency metrics {vi, if, ef}
 * @returns {Object} Interpretations for each metric
 */
export function interpretEfficiencyMetrics(metrics) {
  if (!metrics) return null;

  const viInterpretation = () => {
    const vi = metrics.variabilityIndex;
    if (!vi) return null;

    if (vi < 1.05) return { rating: 'Excellent', description: 'Very steady pacing', color: 'green' };
    if (vi < 1.10) return { rating: 'Good', description: 'Consistent effort', color: 'blue' };
    if (vi < 1.20) return { rating: 'Moderate', description: 'Some power variability', color: 'yellow' };
    return { rating: 'High', description: 'Very variable effort', color: 'orange' };
  };

  const ifInterpretation = () => {
    const ifVal = metrics.intensityFactor;
    if (!ifVal) return null;

    if (ifVal < 0.55) return { rating: 'Recovery', description: 'Easy recovery pace', color: 'green' };
    if (ifVal < 0.75) return { rating: 'Endurance', description: 'Aerobic base building', color: 'blue' };
    if (ifVal < 0.88) return { rating: 'Tempo', description: 'Moderately hard effort', color: 'yellow' };
    if (ifVal < 0.94) return { rating: 'Sweet Spot', description: 'High aerobic training', color: 'orange' };
    if (ifVal < 1.05) return { rating: 'Threshold', description: 'Sustained hard effort', color: 'red' };
    return { rating: 'VO2max+', description: 'Very high intensity', color: 'purple' };
  };

  const decouplingInterpretation = () => {
    const decoupling = metrics.hrPowerDecoupling;
    if (!decoupling) return null;

    if (decoupling < 3.5) return { rating: 'Excellent', description: 'No cardiac drift', color: 'green' };
    if (decoupling < 5.0) return { rating: 'Good', description: 'Minimal drift', color: 'blue' };
    if (decoupling < 7.5) return { rating: 'Moderate', description: 'Some fatigue', color: 'yellow' };
    return { rating: 'High', description: 'Significant fatigue', color: 'orange' };
  };

  const performanceInterpretation = () => {
    const ratio = metrics.performanceRatio;
    if (!ratio) return null;

    if (ratio > 1.10) return { rating: 'Outstanding', description: 'Crushed this ride!', color: 'green' };
    if (ratio > 1.05) return { rating: 'Excellent', description: 'Above expected', color: 'blue' };
    if (ratio > 0.95) return { rating: 'As Expected', description: 'On target', color: 'gray' };
    if (ratio > 0.90) return { rating: 'Below Expected', description: 'Struggled a bit', color: 'yellow' };
    return { rating: 'Struggled', description: 'Tough day', color: 'orange' };
  };

  return {
    vi: viInterpretation(),
    if: ifInterpretation(),
    decoupling: decouplingInterpretation(),
    performance: performanceInterpretation()
  };
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
 * Batch analyzes multiple rides
 * @param {Array<string>} rideIds - Array of ride UUIDs
 * @param {string} userId - UUID of the user
 * @returns {Promise<Array>} Array of analysis results
 */
export async function analyzeBatchRides(rideIds, userId) {
  try {
    const results = await Promise.all(
      rideIds.map(rideId => analyzeRide(rideId, userId))
    );
    return results;
  } catch (error) {
    console.error('Error batch analyzing rides:', error);
    throw error;
  }
}

/**
 * Gets ride analysis summary for multiple rides
 * @param {string} userId - UUID of the user
 * @param {number} limit - Number of recent rides to include
 * @returns {Promise<Array>} Array of ride analysis summaries
 */
export async function getRecentRideAnalyses(userId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('ride_analysis')
      .select(`
        *,
        routes:ride_id (
          id,
          route_name,
          activity_date,
          distance,
          elevation_gain,
          moving_time
        )
      `)
      .eq('user_id', userId)
      .order('analyzed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting recent ride analyses:', error);
    throw error;
  }
}

/**
 * Formats seconds to HH:MM:SS or MM:SS
 * @param {number} seconds - Total seconds
 * @returns {string} Formatted time string
 */
export function formatDuration(seconds) {
  if (!seconds) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculates zone percentages from distribution
 * @param {Object} zoneDistribution - Zone distribution object
 * @returns {Object} Percentages for each zone
 */
export function calculateZonePercentages(zoneDistribution) {
  if (!zoneDistribution) return {};

  const total = Object.values(zoneDistribution).reduce((sum, val) => sum + val, 0);

  if (total === 0) return {};

  const percentages = {};
  Object.entries(zoneDistribution).forEach(([zone, seconds]) => {
    percentages[zone] = ((seconds / total) * 100).toFixed(1);
  });

  return percentages;
}
