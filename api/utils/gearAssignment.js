/**
 * Gear Assignment Utilities
 * Handles auto-assignment of gear to activities and mileage accumulation.
 * Imported by all three webhook handlers (Strava, Garmin, Wahoo).
 */

import { getSportType } from './sportTypes.js';

/**
 * Auto-assign gear to an activity and accumulate mileage.
 * Called after activity insert in webhook handlers.
 *
 * @param {object} supabase - Supabase client (service role)
 * @param {object} params
 * @param {string} params.activityId - UUID of the inserted activity
 * @param {string} params.userId - UUID of the user
 * @param {string} params.activityType - e.g. 'Ride', 'Run', 'VirtualRide'
 * @param {number|null} params.distance - Activity distance in meters
 * @param {string|null} params.stravaGearId - Strava's gear_id string (only from Strava)
 */
export async function assignGearToActivity(supabase, { activityId, userId, activityType, distance, stravaGearId }) {
  const sportType = getSportType(activityType);
  if (!sportType) return; // unsupported sport type

  let gearItem = null;
  let assignedBy = 'auto';

  // Step 1: Try Strava gear_id matching first
  if (stravaGearId) {
    const { data } = await supabase
      .from('gear_items')
      .select('id')
      .eq('user_id', userId)
      .eq('strava_gear_id', stravaGearId)
      .eq('status', 'active')
      .single();
    if (data) {
      gearItem = data;
      assignedBy = 'strava';
    }
  }

  // Step 2: Fall back to default gear for this sport type
  if (!gearItem) {
    const { data } = await supabase
      .from('gear_items')
      .select('id')
      .eq('user_id', userId)
      .eq('sport_type', sportType)
      .eq('is_default', true)
      .eq('status', 'active')
      .single();
    if (data) {
      gearItem = data;
      assignedBy = 'auto';
    }
  }

  if (!gearItem) return; // no gear to assign

  // Step 3: Create activity_gear link
  const { error: linkError } = await supabase
    .from('activity_gear')
    .upsert({
      activity_id: activityId,
      gear_item_id: gearItem.id,
      user_id: userId,
      assigned_by: assignedBy,
    }, { onConflict: 'activity_id' });

  if (linkError) {
    console.error('⚠️ Failed to link gear to activity:', linkError.message);
    return;
  }

  // Step 4: Increment total_distance_logged atomically
  if (distance && distance > 0) {
    await supabase.rpc('increment_gear_distance', {
      p_gear_id: gearItem.id,
      p_distance: distance,
    });
  }

  console.log(`🔧 Gear assigned: activity=${activityId}, gear=${gearItem.id}, by=${assignedBy}`);
}

/**
 * Recalculate total_distance_logged for a gear item from all linked activities.
 * Used when retroactively assigning gear to past activities.
 *
 * @param {object} supabase - Supabase client (service role)
 * @param {string} gearItemId - UUID of the gear item
 */
export async function recalculateGearMileage(supabase, gearItemId) {
  const { data, error } = await supabase
    .from('activity_gear')
    .select('activities(distance)')
    .eq('gear_item_id', gearItemId);

  if (error) {
    console.error('Failed to fetch activities for mileage recalculation:', error.message);
    throw error;
  }

  const totalDistance = (data || []).reduce((sum, ag) => {
    return sum + (ag.activities?.distance || 0);
  }, 0);

  const { error: updateError } = await supabase
    .from('gear_items')
    .update({
      total_distance_logged: totalDistance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gearItemId);

  if (updateError) {
    console.error('Failed to update gear mileage:', updateError.message);
    throw updateError;
  }

  return totalDistance;
}

/**
 * Reassign gear on an activity, updating mileage for both old and new gear.
 *
 * @param {object} supabase - Supabase client (service role)
 * @param {string} activityId - UUID of the activity
 * @param {string} newGearItemId - UUID of the new gear item
 * @param {string} userId - UUID of the user
 */
export async function reassignActivityGear(supabase, activityId, newGearItemId, userId) {
  // Get the activity distance
  const { data: activity } = await supabase
    .from('activities')
    .select('distance')
    .eq('id', activityId)
    .single();

  const distance = activity?.distance || 0;

  // Get the existing gear assignment
  const { data: existing } = await supabase
    .from('activity_gear')
    .select('gear_item_id')
    .eq('activity_id', activityId)
    .single();

  // Decrement old gear mileage
  if (existing && existing.gear_item_id !== newGearItemId && distance > 0) {
    await supabase.rpc('increment_gear_distance', {
      p_gear_id: existing.gear_item_id,
      p_distance: -distance,
    });
  }

  // Upsert the new assignment
  await supabase
    .from('activity_gear')
    .upsert({
      activity_id: activityId,
      gear_item_id: newGearItemId,
      user_id: userId,
      assigned_by: 'manual',
    }, { onConflict: 'activity_id' });

  // Increment new gear mileage (skip if same gear)
  if ((!existing || existing.gear_item_id !== newGearItemId) && distance > 0) {
    await supabase.rpc('increment_gear_distance', {
      p_gear_id: newGearItemId,
      p_distance: distance,
    });
  }
}
