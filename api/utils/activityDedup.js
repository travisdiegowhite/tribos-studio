// Activity Deduplication Utility
// Prevents duplicate activities when users connect multiple providers
// (e.g., Garmin syncs to both Garmin Connect AND Strava)
//
// PROVIDER PRIORITY (highest to lowest):
// 1. Garmin - Has FIT files with power data, most accurate metrics
// 2. Wahoo - Similar quality to Garmin
// 3. Strava - Good for GPS/social but limited power data access
// 4. Manual uploads

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Provider priority - higher number = higher priority
const PROVIDER_PRIORITY = {
  'garmin': 100,  // Highest priority - has FIT files with real power data
  'wahoo': 90,
  'strava': 50,   // Lower priority - limited power data access
  'manual': 10
};

/**
 * Get priority for a provider
 */
function getProviderPriority(provider) {
  return PROVIDER_PRIORITY[provider?.toLowerCase()] || 0;
}

/**
 * Check if an activity is a duplicate based on start time and distance
 * Works across providers - a Garmin ride and Strava ride with same time/distance = duplicate
 *
 * Returns additional context:
 * - shouldTakeover: true if the new provider has higher priority and should replace the existing
 * - shouldMerge: true if the new provider should just add missing data to existing
 *
 * @param {string} userId - User ID to check against
 * @param {Date|string} startDate - Activity start time
 * @param {number} distanceMeters - Activity distance in meters
 * @param {string} currentProvider - Provider being imported ('strava', 'garmin', 'wahoo')
 * @param {string} currentActivityId - Provider's activity ID (to avoid self-match)
 * @returns {Promise<{isDuplicate: boolean, existingActivity: object|null, reason: string|null, shouldTakeover: boolean, shouldMerge: boolean}>}
 */
export async function checkForDuplicate(userId, startDate, distanceMeters, currentProvider, currentActivityId) {
  // If no start date or distance, can't check for duplicates reliably
  if (!startDate || !distanceMeters) {
    return { isDuplicate: false, existingActivity: null, reason: null, shouldTakeover: false, shouldMerge: false };
  }

  const startTime = new Date(startDate);

  // Check within 5 minute window (clocks might be slightly different)
  const fiveMinutesBefore = new Date(startTime.getTime() - 5 * 60 * 1000);
  const fiveMinutesAfter = new Date(startTime.getTime() + 5 * 60 * 1000);

  // Distance tolerance: 1% or 100m, whichever is greater
  const distanceTolerance = Math.max(distanceMeters * 0.01, 100);
  const minDistance = distanceMeters - distanceTolerance;
  const maxDistance = distanceMeters + distanceTolerance;

  try {
    const { data: existingActivities, error } = await supabase
      .from('activities')
      .select('id, provider, provider_activity_id, name, start_date, distance')
      .eq('user_id', userId)
      .gte('start_date', fiveMinutesBefore.toISOString())
      .lte('start_date', fiveMinutesAfter.toISOString())
      .gte('distance', minDistance)
      .lte('distance', maxDistance)
      .limit(5);

    if (error) {
      console.error('Error checking for duplicate:', error);
      // On error, allow the import to proceed
      return { isDuplicate: false, existingActivity: null, reason: null, shouldTakeover: false, shouldMerge: false };
    }

    if (!existingActivities || existingActivities.length === 0) {
      return { isDuplicate: false, existingActivity: null, reason: null, shouldTakeover: false, shouldMerge: false };
    }

    // Filter out the current activity (in case of re-processing)
    const duplicates = existingActivities.filter(activity => {
      // Don't match against the same provider's same activity ID
      if (activity.provider === currentProvider &&
          activity.provider_activity_id === currentActivityId?.toString()) {
        return false;
      }
      return true;
    });

    if (duplicates.length > 0) {
      const existing = duplicates[0];
      const reason = `Matches existing ${existing.provider} activity "${existing.name}" ` +
                     `(ID: ${existing.id}) - same time window and distance`;

      // Determine if the new provider should take over or just merge
      const newPriority = getProviderPriority(currentProvider);
      const existingPriority = getProviderPriority(existing.provider);

      // shouldTakeover: New provider has higher priority - it should become the source of truth
      const shouldTakeover = newPriority > existingPriority;
      // shouldMerge: New provider has lower/equal priority - just add missing data to existing
      const shouldMerge = !shouldTakeover;

      console.log(`🔄 Duplicate detected: ${currentProvider} activity matches ${existing.provider} activity`);
      console.log(`   Existing: ${existing.name} at ${existing.start_date} (${existing.distance}m)`);
      console.log(`   New: ${startDate} (${distanceMeters}m)`);
      console.log(`   Priority: ${currentProvider}(${newPriority}) vs ${existing.provider}(${existingPriority}) → ${shouldTakeover ? 'TAKEOVER' : 'MERGE'}`);

      return {
        isDuplicate: true,
        existingActivity: existing,
        reason,
        shouldTakeover,
        shouldMerge
      };
    }

    return { isDuplicate: false, existingActivity: null, reason: null, shouldTakeover: false, shouldMerge: false };

  } catch (error) {
    console.error('Duplicate check error:', error);
    // On error, allow the import to proceed
    return { isDuplicate: false, existingActivity: null, reason: null, shouldTakeover: false, shouldMerge: false };
  }
}

/**
 * Take over an existing activity with data from a higher-priority provider
 * This replaces the provider and updates all data fields, preserving the activity ID
 *
 * @param {string} existingActivityId - ID of existing activity to take over
 * @param {object} newActivityData - Full activity data from the higher-priority provider
 * @param {string} newProvider - The new provider name
 * @param {string} newProviderActivityId - The new provider's activity ID
 */
export async function takeoverActivity(existingActivityId, newActivityData, newProvider, newProviderActivityId) {
  try {
    // Get existing activity to preserve some metadata
    const { data: existing, error: fetchError } = await supabase
      .from('activities')
      .select('*')
      .eq('id', existingActivityId)
      .single();

    if (fetchError || !existing) {
      console.error('Could not fetch existing activity for takeover:', fetchError);
      return { success: false, error: fetchError?.message || 'Activity not found' };
    }

    const oldProvider = existing.provider;
    const oldProviderActivityId = existing.provider_activity_id;

    // Build the update - replace provider info and all activity data
    const updates = {
      provider: newProvider,
      provider_activity_id: newProviderActivityId?.toString(),
      // Update all the activity fields from new provider
      name: newActivityData.name || existing.name,
      type: newActivityData.type || existing.type,
      sport_type: newActivityData.sport_type || existing.sport_type,
      start_date: newActivityData.start_date || existing.start_date,
      distance: newActivityData.distance ?? existing.distance,
      moving_time: newActivityData.moving_time ?? existing.moving_time,
      elapsed_time: newActivityData.elapsed_time ?? existing.elapsed_time,
      total_elevation_gain: newActivityData.total_elevation_gain ?? existing.total_elevation_gain,
      average_speed: newActivityData.average_speed ?? existing.average_speed,
      max_speed: newActivityData.max_speed ?? existing.max_speed,
      average_watts: newActivityData.average_watts ?? existing.average_watts,
      max_watts: newActivityData.max_watts ?? existing.max_watts,
      normalized_power: newActivityData.normalized_power ?? existing.normalized_power,
      average_heartrate: newActivityData.average_heartrate ?? existing.average_heartrate,
      max_heartrate: newActivityData.max_heartrate ?? existing.max_heartrate,
      average_cadence: newActivityData.average_cadence ?? existing.average_cadence,
      calories: newActivityData.calories ?? existing.calories,
      map_summary_polyline: newActivityData.map_summary_polyline || existing.map_summary_polyline,
      power_curve_summary: newActivityData.power_curve_summary || existing.power_curve_summary,
      // Track the takeover in raw_data
      raw_data: {
        ...newActivityData.raw_data,
        takeover_history: [
          ...(existing.raw_data?.takeover_history || []),
          {
            from_provider: oldProvider,
            from_provider_activity_id: oldProviderActivityId,
            to_provider: newProvider,
            to_provider_activity_id: newProviderActivityId,
            timestamp: new Date().toISOString()
          }
        ],
        original_provider: existing.raw_data?.original_provider || oldProvider
      },
      updated_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('activities')
      .update(updates)
      .eq('id', existingActivityId);

    if (updateError) {
      console.error('Error taking over activity:', updateError);
      return { success: false, error: updateError.message };
    }

    console.log(`✅ Activity takeover: ${oldProvider} → ${newProvider} for activity ${existingActivityId}`);
    console.log(`   Previous: ${oldProvider} ID ${oldProviderActivityId}`);
    console.log(`   New: ${newProvider} ID ${newProviderActivityId}`);

    return { success: true, existingActivityId };

  } catch (error) {
    console.error('Activity takeover error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing activity with data from another provider
 * Useful when Garmin has more detailed data than Strava or vice versa
 *
 * @param {string} existingActivityId - ID of existing activity
 * @param {object} newData - Data from the new provider
 * @param {string} newProvider - The new provider name
 */
export async function mergeActivityData(existingActivityId, newData, newProvider) {
  try {
    // Get existing activity
    const { data: existing, error: fetchError } = await supabase
      .from('activities')
      .select('*')
      .eq('id', existingActivityId)
      .single();

    if (fetchError || !existing) {
      console.error('Could not fetch existing activity for merge:', fetchError);
      return;
    }

    // Merge strategy: fill in missing data, prefer more detailed values
    const updates = {};

    // GPS data: prefer polyline if existing doesn't have one
    if (!existing.map_summary_polyline && newData.map_summary_polyline) {
      updates.map_summary_polyline = newData.map_summary_polyline;
    }

    // Power data: prefer if existing doesn't have it
    if (!existing.average_watts && newData.average_watts) {
      updates.average_watts = newData.average_watts;
    }

    // Heart rate: prefer if existing doesn't have it
    if (!existing.average_heartrate && newData.average_heartrate) {
      updates.average_heartrate = newData.average_heartrate;
      updates.max_heartrate = newData.max_heartrate;
    }

    // Cadence: prefer if existing doesn't have it
    if (!existing.average_cadence && newData.average_cadence) {
      updates.average_cadence = newData.average_cadence;
    }

    // Track which providers contributed to this activity
    const providers = existing.raw_data?.merged_providers || [existing.provider];
    if (!providers.includes(newProvider)) {
      providers.push(newProvider);
    }

    updates.raw_data = {
      ...existing.raw_data,
      merged_providers: providers,
      [`${newProvider}_data`]: newData.raw_data
    };
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length > 1) { // More than just updated_at
      const { error: updateError } = await supabase
        .from('activities')
        .update(updates)
        .eq('id', existingActivityId);

      if (updateError) {
        console.error('Error merging activity data:', updateError);
      } else {
        console.log(`✅ Merged ${newProvider} data into existing activity ${existingActivityId}`);
      }
    }

  } catch (error) {
    console.error('Activity merge error:', error);
  }
}

export default {
  checkForDuplicate,
  takeoverActivity,
  mergeActivityData
};
