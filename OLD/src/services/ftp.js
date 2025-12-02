// FTP (Functional Threshold Power) Management Service
// Handles FTP storage, history, and zone calculations

import { supabase } from '../supabase';

/**
 * Get the current FTP for a user
 * @param {string} userId - User UUID
 * @returns {Promise<{ftp: number, lthr: number, testDate: string, testType: string}|null>}
 */
export const getCurrentFTP = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_ftp_history')
      .select('*')
      .eq('user_id', userId)
      .eq('is_current', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No FTP set yet
        return null;
      }
      throw error;
    }

    return {
      id: data.id,
      ftp: data.ftp_watts,
      lthr: data.lthr_bpm,
      testDate: data.test_date,
      testType: data.test_type,
      notes: data.notes,
      routeId: data.route_id,
      createdAt: data.created_at
    };
  } catch (error) {
    console.error('Error getting current FTP:', error);
    throw error;
  }
};

/**
 * Set a new FTP for a user (marks all others as not current)
 * @param {string} userId - User UUID
 * @param {number} ftpWatts - FTP in watts
 * @param {Object} options - Optional parameters
 * @returns {Promise<string>} - ID of new FTP entry
 */
export const setCurrentFTP = async (userId, ftpWatts, options = {}) => {
  const {
    lthr = null,
    testDate = new Date().toISOString().split('T')[0],
    testType = 'manual',
    routeId = null,
    notes = null
  } = options;

  try {
    const { data, error } = await supabase.rpc('set_current_ftp', {
      user_uuid: userId,
      new_ftp: ftpWatts,
      new_lthr: lthr,
      test_date_param: testDate,
      test_type_param: testType,
      route_id_param: routeId,
      notes_param: notes
    });

    if (error) throw error;

    return data; // Returns UUID of new FTP entry
  } catch (error) {
    console.error('Error setting FTP:', error);
    throw error;
  }
};

/**
 * Get FTP history for a user
 * @param {string} userId - User UUID
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Array>}
 */
export const getFTPHistory = async (userId, limit = 10) => {
  try {
    const { data, error } = await supabase.rpc('get_ftp_history', {
      user_uuid: userId,
      limit_count: limit
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting FTP history:', error);
    throw error;
  }
};

/**
 * Get training zones for a user
 * @param {string} userId - User UUID
 * @returns {Promise<Array>}
 */
export const getTrainingZones = async (userId) => {
  try {
    const { data, error } = await supabase.rpc('get_user_training_zones', {
      user_uuid: userId
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting training zones:', error);
    throw error;
  }
};

/**
 * Initialize training zones for a user based on FTP/LTHR
 * This is automatically called when FTP is set via trigger, but can be called manually
 * @param {string} userId - User UUID
 * @param {number} ftpWatts - FTP in watts
 * @param {number|null} lthrBpm - LTHR in bpm (optional)
 */
export const initializeTrainingZones = async (userId, ftpWatts, lthrBpm = null) => {
  try {
    const { error } = await supabase.rpc('initialize_training_zones', {
      user_uuid: userId,
      ftp_watts: ftpWatts,
      lthr_bpm: lthrBpm
    });

    if (error) throw error;
  } catch (error) {
    console.error('Error initializing training zones:', error);
    throw error;
  }
};

/**
 * Calculate training zones from FTP/LTHR (client-side calculation)
 * Useful for preview before saving
 * @param {number} ftpWatts - FTP in watts
 * @param {number|null} lthrBpm - LTHR in bpm
 * @returns {Array} Array of zone objects
 */
export const calculateZones = (ftpWatts, lthrBpm = null) => {
  const zones = [
    {
      number: 1,
      name: 'recovery',
      label: 'Recovery',
      ftpMin: 0,
      ftpMax: 55,
      lthrMin: 0,
      lthrMax: 68,
      description: 'Active recovery, very easy spinning',
      color: '#51cf66'
    },
    {
      number: 2,
      name: 'endurance',
      label: 'Endurance',
      ftpMin: 56,
      ftpMax: 75,
      lthrMin: 69,
      lthrMax: 83,
      description: 'Aerobic base building, conversational pace',
      color: '#4dabf7'
    },
    {
      number: 3,
      name: 'tempo',
      label: 'Tempo',
      ftpMin: 76,
      ftpMax: 87,
      lthrMin: 84,
      lthrMax: 94,
      description: 'Moderately hard, sustained effort',
      color: '#ffd43b'
    },
    {
      number: 4,
      name: 'sweet_spot',
      label: 'Sweet Spot',
      ftpMin: 88,
      ftpMax: 93,
      lthrMin: 95,
      lthrMax: 105,
      description: 'High aerobic training, efficient fitness gains',
      color: '#ff922b'
    },
    {
      number: 5,
      name: 'threshold',
      label: 'Threshold',
      ftpMin: 94,
      ftpMax: 105,
      lthrMin: 100,
      lthrMax: 102,
      description: 'Lactate threshold, ~1 hour sustainable',
      color: '#ff6b6b'
    },
    {
      number: 6,
      name: 'vo2max',
      label: 'VO2max',
      ftpMin: 106,
      ftpMax: 120,
      lthrMin: 103,
      lthrMax: 106,
      description: 'Maximal aerobic power, 3-8 min intervals',
      color: '#cc5de8'
    },
    {
      number: 7,
      name: 'anaerobic',
      label: 'Anaerobic',
      ftpMin: 121,
      ftpMax: 150,
      lthrMin: 106,
      lthrMax: 110,
      description: 'Sprints and neuromuscular power, <3 min',
      color: '#862e9c'
    }
  ];

  return zones.map(zone => ({
    ...zone,
    powerMin: Math.round(ftpWatts * (zone.ftpMin / 100)),
    powerMax: Math.round(ftpWatts * (zone.ftpMax / 100)),
    hrMin: lthrBpm ? Math.round(lthrBpm * (zone.lthrMin / 100)) : null,
    hrMax: lthrBpm ? Math.round(lthrBpm * (zone.lthrMax / 100)) : null,
    ftpPercentMin: zone.ftpMin,
    ftpPercentMax: zone.ftpMax,
    lthrPercentMin: zone.lthrMin,
    lthrPercentMax: zone.lthrMax
  }));
};

/**
 * Determine which zone a power value falls into
 * @param {number} powerWatts - Power in watts
 * @param {Array} zones - Array of zone objects from getTrainingZones or calculateZones
 * @returns {Object|null} Zone object or null if not found
 */
export const getZoneForPower = (powerWatts, zones) => {
  return zones.find(zone =>
    powerWatts >= zone.powerMin && powerWatts <= zone.powerMax
  ) || null;
};

/**
 * Determine which zone a heart rate value falls into
 * @param {number} heartRate - Heart rate in bpm
 * @param {Array} zones - Array of zone objects from getTrainingZones or calculateZones
 * @returns {Object|null} Zone object or null if not found
 */
export const getZoneForHeartRate = (heartRate, zones) => {
  return zones.find(zone =>
    zone.hrMin && zone.hrMax &&
    heartRate >= zone.hrMin && heartRate <= zone.hrMax
  ) || null;
};

/**
 * Format zone range for display
 * @param {Object} zone - Zone object
 * @param {string} type - 'power', 'hr', or 'both'
 * @returns {string}
 */
export const formatZoneRange = (zone, type = 'power') => {
  if (type === 'power') {
    return `${zone.powerMin}-${zone.powerMax}W (${zone.ftpPercentMin}-${zone.ftpPercentMax}%)`;
  } else if (type === 'hr' && zone.hrMin && zone.hrMax) {
    return `${zone.hrMin}-${zone.hrMax} bpm (${zone.lthrPercentMin}-${zone.lthrPercentMax}%)`;
  } else if (type === 'both') {
    const powerRange = formatZoneRange(zone, 'power');
    const hrRange = zone.hrMin ? formatZoneRange(zone, 'hr') : 'N/A';
    return `${powerRange} | ${hrRange}`;
  }
  return 'N/A';
};

/**
 * Estimate FTP from a ride's power data
 * Various methods: 20-min test, 8-min test, ramp test, etc.
 * @param {Object} ride - Route/ride object with power data
 * @param {string} method - 'auto', '20min', '8min', 'ramp'
 * @returns {number|null} Estimated FTP in watts
 */
export const estimateFTPFromRide = (ride, method = 'auto') => {
  // This will be implemented in ftpDetection.js
  // Placeholder for now
  return null;
};

/**
 * Get zone distribution from a ride
 * Calculates time spent in each zone
 * @param {Object} ride - Route/ride object with power stream
 * @param {Array} zones - Array of zone objects
 * @returns {Object} Distribution object with time in each zone
 */
export const getZoneDistribution = (ride, zones) => {
  // This would require power stream data
  // For now, return null - can be implemented later with detailed ride data
  return null;
};
