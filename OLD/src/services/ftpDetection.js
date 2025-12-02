// FTP Detection Service
// Automatically detect FTP from ride data using various test protocols

import { supabase } from '../supabase';
import { getCurrentFTP, setCurrentFTP } from './ftp';

/**
 * Analyze a ride to detect if it might be an FTP test
 * @param {Object} ride - Route/ride object
 * @returns {Object|null} {estimatedFTP, testType, confidence} or null
 */
export const analyzeRideForFTPTest = (ride) => {
  if (!ride || !ride.average_power || !ride.duration) {
    return null;
  }

  const durationMinutes = ride.duration / 60;
  const avgPower = ride.average_power;
  const normalizedPower = ride.normalized_power || avgPower;

  // 20-Minute FTP Test (most common)
  // FTP = 95% of 20-min average power
  if (durationMinutes >= 18 && durationMinutes <= 22) {
    return {
      estimatedFTP: Math.round(normalizedPower * 0.95),
      testType: '20min',
      confidence: 0.85,
      details: {
        duration: durationMinutes,
        avgPower,
        normalizedPower,
        multiplier: 0.95
      }
    };
  }

  // 8-Minute Test (less common, used for shorter duration athletes)
  // FTP = 90% of 8-min average power
  if (durationMinutes >= 7 && durationMinutes <= 9) {
    return {
      estimatedFTP: Math.round(normalizedPower * 0.90),
      testType: '8min',
      confidence: 0.75,
      details: {
        duration: durationMinutes,
        avgPower,
        normalizedPower,
        multiplier: 0.90
      }
    };
  }

  // Ramp Test (TrainerRoad style)
  // FTP = 75% of max 1-min power from a ramp test
  // This requires power stream data to find max 1-min power
  // For now, we'll skip this as it needs detailed power data

  // 60-Minute Test (true FTP)
  // FTP = average power for 60 minutes
  if (durationMinutes >= 55 && durationMinutes <= 65) {
    // Check if the ride was steady (low variability)
    // If VI (Variability Index) is close to 1.0, it's likely a steady effort
    const vi = ride.variability_index || (normalizedPower / avgPower);

    if (vi <= 1.05) {
      return {
        estimatedFTP: Math.round(normalizedPower),
        testType: '60min',
        confidence: 0.95,
        details: {
          duration: durationMinutes,
          avgPower,
          normalizedPower,
          variabilityIndex: vi,
          multiplier: 1.0
        }
      };
    }
  }

  return null;
};

/**
 * Detect potential FTP breakthrough from recent rides
 * Looks for sustained high power efforts that suggest FTP improvement
 * @param {string} userId - User UUID
 * @param {number} daysBack - Number of days to analyze
 * @returns {Promise<Object|null>} Detection result or null
 */
export const detectFTPBreakthrough = async (userId, daysBack = 30) => {
  try {
    // Get current FTP
    const currentFTPData = await getCurrentFTP(userId);
    if (!currentFTPData || !currentFTPData.ftp) {
      return null; // Can't detect breakthrough without baseline
    }

    const currentFTP = currentFTPData.ftp;

    // Get recent rides with power data
    const { data: rides, error } = await supabase
      .from('routes')
      .select('*')
      .eq('user_id', userId)
      .gte('recorded_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
      .not('average_power', 'is', null)
      .not('duration', 'is', null)
      .order('recorded_at', { ascending: false });

    if (error) throw error;
    if (!rides || rides.length === 0) return null;

    // Look for rides with sustained power significantly above current FTP
    const breakthroughCandidates = rides
      .map(ride => {
        const durationMinutes = ride.duration / 60;
        const avgPower = ride.average_power;
        const normalizedPower = ride.normalized_power || avgPower;

        // Calculate how much above FTP this ride was
        const percentAboveFTP = ((normalizedPower - currentFTP) / currentFTP) * 100;

        // Look for rides 20-65 minutes long with power >2% above current FTP
        if (durationMinutes >= 20 && durationMinutes <= 65 && percentAboveFTP > 2) {
          return {
            ride,
            durationMinutes,
            normalizedPower,
            percentAboveFTP,
            confidence: Math.min(0.95, 0.5 + (percentAboveFTP / 20)) // Higher confidence for bigger breakthroughs
          };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.percentAboveFTP - a.percentAboveFTP); // Sort by biggest breakthrough

    if (breakthroughCandidates.length === 0) {
      return null;
    }

    // Take the most significant breakthrough
    const breakthrough = breakthroughCandidates[0];

    // Estimate new FTP based on the breakthrough ride
    let estimatedFTP;
    let testType;

    if (breakthrough.durationMinutes >= 55 && breakthrough.durationMinutes <= 65) {
      // 60-minute effort = true FTP
      estimatedFTP = Math.round(breakthrough.normalizedPower);
      testType = '60min';
    } else if (breakthrough.durationMinutes >= 18 && breakthrough.durationMinutes <= 22) {
      // 20-minute effort
      estimatedFTP = Math.round(breakthrough.normalizedPower * 0.95);
      testType = '20min';
    } else {
      // Longer effort (>20 min but <60 min)
      // Use a sliding scale multiplier
      const multiplier = 0.95 - ((breakthrough.durationMinutes - 20) / 100);
      estimatedFTP = Math.round(breakthrough.normalizedPower * Math.max(0.90, multiplier));
      testType = 'auto_detected';
    }

    return {
      estimatedFTP,
      currentFTP,
      improvement: estimatedFTP - currentFTP,
      improvementPercent: ((estimatedFTP - currentFTP) / currentFTP) * 100,
      testType,
      confidence: breakthrough.confidence,
      rideId: breakthrough.ride.id,
      rideDate: breakthrough.ride.recorded_at,
      rideName: breakthrough.ride.name || 'Untitled Ride',
      details: {
        duration: breakthrough.durationMinutes,
        normalizedPower: breakthrough.normalizedPower,
        percentAboveFTP: breakthrough.percentAboveFTP
      }
    };
  } catch (error) {
    console.error('Error detecting FTP breakthrough:', error);
    throw error;
  }
};

/**
 * Check recent rides and prompt user for FTP update if detected
 * @param {string} userId - User UUID
 * @param {number} daysBack - Number of days to check
 * @returns {Promise<Object|null>} Prompt data or null
 */
export const checkForFTPUpdate = async (userId, daysBack = 14) => {
  try {
    // First check for explicit FTP tests
    const { data: rides, error } = await supabase
      .from('routes')
      .select('*')
      .eq('user_id', userId)
      .gte('recorded_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
      .not('average_power', 'is', null)
      .not('duration', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!rides || rides.length === 0) return null;

    // Check each ride for FTP test patterns
    for (const ride of rides) {
      const ftpTest = analyzeRideForFTPTest(ride);

      if (ftpTest && ftpTest.confidence >= 0.75) {
        // Get current FTP to compare
        const currentFTPData = await getCurrentFTP(userId);
        const currentFTP = currentFTPData?.ftp;

        // Only prompt if new FTP is significantly different (>3% change)
        if (!currentFTP || Math.abs(ftpTest.estimatedFTP - currentFTP) / currentFTP > 0.03) {
          return {
            rideId: ride.id,
            rideName: ride.name || 'Untitled Ride',
            rideDate: ride.recorded_at,
            estimatedFTP: ftpTest.estimatedFTP,
            currentFTP,
            testType: ftpTest.testType,
            confidence: ftpTest.confidence,
            improvement: currentFTP ? ftpTest.estimatedFTP - currentFTP : null,
            improvementPercent: currentFTP ? ((ftpTest.estimatedFTP - currentFTP) / currentFTP) * 100 : null,
            details: ftpTest.details
          };
        }
      }
    }

    // If no explicit test found, check for breakthroughs
    return await detectFTPBreakthrough(userId, daysBack);
  } catch (error) {
    console.error('Error checking for FTP update:', error);
    throw error;
  }
};

/**
 * Apply detected FTP update
 * @param {string} userId - User UUID
 * @param {number} newFTP - New FTP value
 * @param {Object} detectionData - Data from checkForFTPUpdate
 */
export const applyFTPUpdate = async (userId, newFTP, detectionData) => {
  try {
    await setCurrentFTP(userId, newFTP, {
      testDate: new Date(detectionData.rideDate).toISOString().split('T')[0],
      testType: detectionData.testType,
      routeId: detectionData.rideId,
      notes: `Auto-detected from ride: ${detectionData.rideName}. Confidence: ${(detectionData.confidence * 100).toFixed(0)}%`
    });
  } catch (error) {
    console.error('Error applying FTP update:', error);
    throw error;
  }
};

/**
 * Get FTP detection history
 * @param {string} userId - User UUID
 * @param {number} limit - Number of entries
 * @returns {Promise<Array>}
 */
export const getFTPDetectionHistory = async (userId, limit = 10) => {
  try {
    const { data, error } = await supabase
      .from('user_ftp_history')
      .select(`
        *,
        route:route_id (
          id,
          name,
          recorded_at,
          duration,
          average_power,
          normalized_power
        )
      `)
      .eq('user_id', userId)
      .in('test_type', ['auto_detected', '20min', '8min', 'ramp'])
      .order('test_date', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting FTP detection history:', error);
    throw error;
  }
};

/**
 * Calculate FTP from ramp test (requires power stream)
 * @param {Array} powerStream - Array of power values (second-by-second)
 * @returns {number|null} Estimated FTP
 */
export const calculateFTPFromRampTest = (powerStream) => {
  if (!powerStream || powerStream.length < 60) {
    return null; // Need at least 60 seconds of data
  }

  // Find max 1-minute average power
  let maxOnMinutePower = 0;

  for (let i = 0; i <= powerStream.length - 60; i++) {
    const oneMinuteSlice = powerStream.slice(i, i + 60);
    const avg = oneMinuteSlice.reduce((sum, p) => sum + p, 0) / 60;

    if (avg > maxOnMinutePower) {
      maxOnMinutePower = avg;
    }
  }

  // FTP = 75% of max 1-minute power
  return Math.round(maxOnMinutePower * 0.75);
};

/**
 * Format FTP change for display
 * @param {number} change - FTP change in watts
 * @param {number} changePercent - Percentage change
 * @returns {string}
 */
export const formatFTPChange = (change, changePercent) => {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change}W (${sign}${changePercent.toFixed(1)}%)`;
};
