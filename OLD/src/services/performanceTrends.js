/**
 * Performance Trends Service
 *
 * Detects and tracks performance trends including:
 * - FTP improvements/declines
 * - Zone-specific fitness gains
 * - Training volume changes
 * - Fatigue accumulation
 * - Consistency streaks
 */

import { supabase } from '../supabase';

/**
 * Detects FTP trend based on recent rides
 * @param {string} userId - UUID of the user
 * @param {number} lookbackDays - Days to analyze (default: 28)
 * @returns {Promise<string|null>} Trend ID if detected
 */
export async function detectFTPTrend(userId, lookbackDays = 28) {
  try {
    const { data, error } = await supabase.rpc('detect_ftp_trend', {
      p_user_id: userId,
      p_lookback_days: lookbackDays
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error detecting FTP trend:', error);
    throw error;
  }
}

/**
 * Detects zone-specific fitness trends
 * @param {string} userId - UUID of the user
 * @param {number} lookbackDays - Days to analyze (default: 28)
 * @returns {Promise<Array>} Array of trend IDs
 */
export async function detectZoneFitnessTrends(userId, lookbackDays = 28) {
  try {
    const { data, error } = await supabase.rpc('detect_zone_fitness_trends', {
      p_user_id: userId,
      p_lookback_days: lookbackDays
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error detecting zone fitness trends:', error);
    throw error;
  }
}

/**
 * Detects training volume trends
 * @param {string} userId - UUID of the user
 * @param {number} lookbackWeeks - Weeks to analyze (default: 4)
 * @returns {Promise<string|null>} Trend ID if detected
 */
export async function detectVolumeTrends(userId, lookbackWeeks = 4) {
  try {
    const { data, error } = await supabase.rpc('detect_volume_trends', {
      p_user_id: userId,
      p_lookback_weeks: lookbackWeeks
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error detecting volume trends:', error);
    throw error;
  }
}

/**
 * Runs all trend detection algorithms
 * @param {string} userId - UUID of the user
 * @param {number} lookbackDays - Days to analyze (default: 28)
 * @returns {Promise<Object>} Summary of detected trends
 */
export async function detectAllTrends(userId, lookbackDays = 28) {
  try {
    const { data, error } = await supabase.rpc('detect_all_trends', {
      p_user_id: userId,
      p_lookback_days: lookbackDays
    });

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error detecting all trends:', error);
    throw error;
  }
}

/**
 * Gets all active trends for a user
 * @param {string} userId - UUID of the user
 * @returns {Promise<Array>} Array of active trends with descriptions
 */
export async function getActiveTrends(userId) {
  try {
    const { data, error } = await supabase.rpc('get_active_trends', {
      p_user_id: userId
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting active trends:', error);
    throw error;
  }
}

/**
 * Gets trends by type
 * @param {string} userId - UUID of the user
 * @param {string} trendType - Type filter
 * @returns {Promise<Array>} Filtered trends
 */
export async function getTrendsByType(userId, trendType) {
  try {
    const { data, error } = await supabase
      .from('performance_trends')
      .select('*')
      .eq('user_id', userId)
      .eq('trend_type', trendType)
      .eq('is_active', true)
      .order('confidence', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting trends by type:', error);
    throw error;
  }
}

/**
 * Gets trend history
 * @param {string} userId - UUID of the user
 * @param {number} limit - Number of trends to fetch
 * @returns {Promise<Array>} Trend history
 */
export async function getTrendHistory(userId, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('performance_trends')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting trend history:', error);
    throw error;
  }
}

/**
 * Marks a trend as inactive
 * @param {string} trendId - UUID of the trend
 * @returns {Promise<void>}
 */
export async function deactivateTrend(trendId) {
  try {
    const { error } = await supabase
      .from('performance_trends')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', trendId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deactivating trend:', error);
    throw error;
  }
}

/**
 * Marks a trend as notified
 * @param {string} trendId - UUID of the trend
 * @returns {Promise<void>}
 */
export async function markTrendNotified(trendId) {
  try {
    const { error } = await supabase
      .from('performance_trends')
      .update({
        user_notified: true,
        notified_at: new Date().toISOString()
      })
      .eq('id', trendId);

    if (error) throw error;
  } catch (error) {
    console.error('Error marking trend as notified:', error);
    throw error;
  }
}

/**
 * Gets unnotified trends
 * @param {string} userId - UUID of the user
 * @returns {Promise<Array>} Unnotified trends
 */
export async function getUnnotifiedTrends(userId) {
  try {
    const { data, error } = await supabase
      .from('performance_trends')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('user_notified', false)
      .order('confidence', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting unnotified trends:', error);
    throw error;
  }
}

/**
 * Formats trend for UI display
 * @param {Object} trend - Trend object from database
 * @returns {Object} Formatted trend with UI properties
 */
export function formatTrendForDisplay(trend) {
  if (!trend) return null;

  const icons = {
    ftp_improvement: '📈',
    ftp_decline: '📉',
    zone_fitness: '🎯',
    volume_increase: '📊',
    volume_decrease: '📉',
    consistency_streak: '🔥',
    fatigue_accumulation: '⚠️',
    recovery_needed: '💤'
  };

  const colors = {
    improving: 'green',
    declining: 'orange',
    stable: 'gray'
  };

  const confidenceLabel = (confidence) => {
    if (confidence >= 0.85) return 'High';
    if (confidence >= 0.70) return 'Medium';
    return 'Low';
  };

  return {
    ...trend,
    icon: icons[trend.trend_type] || '📊',
    color: colors[trend.direction] || 'blue',
    confidenceLabel: confidenceLabel(trend.confidence),
    daysActive: trend.end_date
      ? Math.ceil((new Date(trend.end_date) - new Date(trend.start_date)) / (1000 * 60 * 60 * 24))
      : Math.ceil((new Date() - new Date(trend.start_date)) / (1000 * 60 * 60 * 24))
  };
}

/**
 * Groups trends by category
 * @param {Array} trends - Array of trends
 * @returns {Object} Trends grouped by category
 */
export function groupTrendsByCategory(trends) {
  const grouped = {
    power: [],
    fitness: [],
    volume: [],
    recovery: []
  };

  trends.forEach(trend => {
    const formatted = formatTrendForDisplay(trend);

    if (trend.trend_type.includes('ftp')) {
      grouped.power.push(formatted);
    } else if (trend.trend_type === 'zone_fitness') {
      grouped.fitness.push(formatted);
    } else if (trend.trend_type.includes('volume')) {
      grouped.volume.push(formatted);
    } else if (trend.trend_type.includes('recovery') || trend.trend_type.includes('fatigue')) {
      grouped.recovery.push(formatted);
    }
  });

  return grouped;
}

/**
 * Gets trend summary statistics
 * @param {string} userId - UUID of the user
 * @returns {Promise<Object>} Trend statistics
 */
export async function getTrendSummary(userId) {
  try {
    const trends = await getActiveTrends(userId);

    const summary = {
      totalActive: trends.length,
      improving: trends.filter(t => t.direction === 'improving').length,
      declining: trends.filter(t => t.direction === 'declining').length,
      stable: trends.filter(t => t.direction === 'stable').length,
      highConfidence: trends.filter(t => t.confidence >= 0.85).length,
      byType: {}
    };

    // Count by type
    trends.forEach(trend => {
      summary.byType[trend.trend_type] = (summary.byType[trend.trend_type] || 0) + 1;
    });

    return summary;
  } catch (error) {
    console.error('Error getting trend summary:', error);
    throw error;
  }
}

/**
 * Gets AI Coach-friendly trend descriptions
 * @param {Array} trends - Array of trends
 * @returns {string} Human-readable trend summary
 */
export function getTrendDescriptionsForAI(trends) {
  if (!trends || trends.length === 0) {
    return 'No significant performance trends detected in recent training.';
  }

  const descriptions = trends.map(trend => {
    const direction = trend.direction === 'improving' ? '↑' : trend.direction === 'declining' ? '↓' : '→';
    const confidence = `${(trend.confidence * 100).toFixed(0)}% confidence`;

    return `${direction} ${trend.description} (${confidence})`;
  });

  return descriptions.join('\n');
}

/**
 * Checks if user should be alerted about a trend
 * @param {Object} trend - Trend object
 * @returns {boolean} True if alert-worthy
 */
export function shouldAlertUser(trend) {
  // Alert if high confidence and significant change
  if (trend.confidence < 0.75) return false;

  // Alert for FTP changes > 5%
  if (trend.trend_type.includes('ftp') && Math.abs(trend.value_change_percent) > 5) {
    return true;
  }

  // Alert for zone fitness changes > 1.0 level
  if (trend.trend_type === 'zone_fitness' && Math.abs(trend.value_change) > 1.0) {
    return true;
  }

  // Alert for volume changes > 20%
  if (trend.trend_type.includes('volume') && Math.abs(trend.value_change_percent) > 20) {
    return true;
  }

  return false;
}
