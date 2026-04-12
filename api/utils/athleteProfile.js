// Shared athlete profile loader for FIT coach context construction.
// Loads FTP, max HR, and power zones from user_profiles. Returns an object
// in the shape expected by downloadAndParseFitFile / parseFitBuffer, or null
// on any failure — the parser degrades gracefully without these fields.
//
// Previously duplicated across api/garmin-activities.js,
// api/garmin-webhook-process.js, and api/wahoo-webhook.js. Consolidated here
// when adding manual FIT upload so all ingestion paths share one definition.

import { getSupabaseAdmin } from './supabaseAdmin.js';

/**
 * @param {string} userId
 * @returns {Promise<{ ftp: number|null, maxHR: number|null, powerZones: object|null } | null>}
 */
export async function fetchAthleteProfile(userId) {
  if (!userId) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('ftp, power_zones, max_hr')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      ftp: data.ftp ?? null,
      maxHR: data.max_hr ?? null,
      powerZones: data.power_zones ?? null,
    };
  } catch (err) {
    console.warn('⚠️ Failed to load athlete profile for FIT coach context:', err.message);
    return null;
  }
}

export default { fetchAthleteProfile };
