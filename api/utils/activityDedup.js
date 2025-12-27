// Activity Deduplication Utility
// Prevents duplicate activities when users connect multiple providers
// (e.g., Garmin syncs to both Garmin Connect AND Strava)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Check if an activity is a duplicate based on start time and distance
 * Works across providers - a Garmin ride and Strava ride with same time/distance = duplicate
 *
 * @param {string} userId - User ID to check against
 * @param {Date|string} startDate - Activity start time
 * @param {number} distanceMeters - Activity distance in meters
 * @param {string} currentProvider - Provider being imported ('strava', 'garmin', 'wahoo')
 * @param {string} currentActivityId - Provider's activity ID (to avoid self-match)
 * @returns {Promise<{isDuplicate: boolean, existingActivity: object|null, reason: string|null}>}
 */
export async function checkForDuplicate(userId, startDate, distanceMeters, currentProvider, currentActivityId) {
  // If no start date or distance, can't check for duplicates reliably
  if (!startDate || !distanceMeters) {
    return { isDuplicate: false, existingActivity: null, reason: null };
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
      return { isDuplicate: false, existingActivity: null, reason: null };
    }

    if (!existingActivities || existingActivities.length === 0) {
      return { isDuplicate: false, existingActivity: null, reason: null };
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

      console.log(`🔄 Duplicate detected: ${currentProvider} activity matches ${existing.provider} activity`);
      console.log(`   Existing: ${existing.name} at ${existing.start_date} (${existing.distance}m)`);
      console.log(`   New: ${startDate} (${distanceMeters}m)`);

      return {
        isDuplicate: true,
        existingActivity: existing,
        reason
      };
    }

    return { isDuplicate: false, existingActivity: null, reason: null };

  } catch (error) {
    console.error('Duplicate check error:', error);
    // On error, allow the import to proceed
    return { isDuplicate: false, existingActivity: null, reason: null };
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
  mergeActivityData
};
