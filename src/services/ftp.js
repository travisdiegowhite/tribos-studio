// FTP (Functional Threshold Power) Management Service
import { supabase } from '../lib/supabase';

/**
 * Get the current FTP for a user
 */
export const getCurrentFTP = async (userId) => {
  try {
    // First try user_ftp_history table
    const { data, error } = await supabase
      .from('user_ftp_history')
      .select('*')
      .eq('user_id', userId)
      .eq('is_current', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') {
        // Table doesn't exist or no FTP set - try user_profiles
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('ftp, power_zones')
          .eq('id', userId)
          .single();

        if (profile?.ftp) {
          return {
            ftp: profile.ftp,
            powerZones: profile.power_zones,
            testType: 'manual',
            testDate: null,
          };
        }
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
      createdAt: data.created_at
    };
  } catch (error) {
    console.error('Error getting current FTP:', error);
    // Fallback to user_profiles
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('ftp, power_zones')
        .eq('id', userId)
        .single();

      if (profile?.ftp) {
        return {
          ftp: profile.ftp,
          powerZones: profile.power_zones,
          testType: 'manual',
        };
      }
    } catch {
      // Ignore fallback errors
    }
    return null;
  }
};

/**
 * Calculate training zones from FTP (client-side calculation)
 */
export const calculateZones = (ftpWatts, lthrBpm = null) => {
  const zones = [
    { number: 1, name: 'recovery', label: 'Recovery', ftpMin: 0, ftpMax: 55, color: '#51cf66' },
    { number: 2, name: 'endurance', label: 'Endurance', ftpMin: 56, ftpMax: 75, color: '#4dabf7' },
    { number: 3, name: 'tempo', label: 'Tempo', ftpMin: 76, ftpMax: 87, color: '#ffd43b' },
    { number: 4, name: 'sweet_spot', label: 'Sweet Spot', ftpMin: 88, ftpMax: 93, color: '#ff922b' },
    { number: 5, name: 'threshold', label: 'Threshold', ftpMin: 94, ftpMax: 105, color: '#ff6b6b' },
    { number: 6, name: 'vo2max', label: 'VO2max', ftpMin: 106, ftpMax: 120, color: '#cc5de8' },
    { number: 7, name: 'anaerobic', label: 'Anaerobic', ftpMin: 121, ftpMax: 150, color: '#862e9c' },
  ];

  return zones.map(zone => ({
    ...zone,
    powerMin: Math.round(ftpWatts * (zone.ftpMin / 100)),
    powerMax: Math.round(ftpWatts * (zone.ftpMax / 100)),
  }));
};

/**
 * Get zone for a power value
 */
export const getZoneForPower = (powerWatts, zones) => {
  return zones.find(zone =>
    powerWatts >= zone.powerMin && powerWatts <= zone.powerMax
  ) || null;
};
