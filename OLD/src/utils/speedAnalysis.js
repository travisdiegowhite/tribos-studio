/**
 * Speed Analysis Service
 * Calculates user-specific cycling speeds from ride history for personalized routing
 */

import { supabase } from '../supabase';

/**
 * Analyze user's speed profile from ride history
 * Calculates median speeds across different terrain types
 *
 * @param {string} userId - User ID to analyze
 * @param {number} rideLimit - Number of recent rides to analyze (default: 30)
 * @returns {Promise<Object>} Speed profile object
 */
export async function analyzeUserSpeedProfile(userId, rideLimit = 30) {
  console.log(`📊 Analyzing speed profile for user ${userId}`);

  try {
    // Fetch recent rides with speed and terrain data
    const { data: rides, error } = await supabase
      .from('routes')
      .select(`
        id,
        distance_km,
        duration_seconds,
        elevation_gain_m,
        average_speed,
        surface_type,
        route_type,
        recorded_at,
        imported_from
      `)
      .eq('user_id', userId)
      .in('imported_from', ['strava', 'wahoo', 'garmin', 'manual'])
      .not('average_speed', 'is', null)
      .not('distance_km', 'is', null)
      .gt('distance_km', 5) // At least 5km to be meaningful
      .lt('distance_km', 300) // Under 300km (filter out ultra events)
      .order('recorded_at', { ascending: false })
      .limit(rideLimit);

    if (error) {
      console.error('Error fetching rides for speed analysis:', error);
      throw error;
    }

    if (!rides || rides.length < 3) {
      console.log('⚠️ Insufficient ride data for speed analysis (need at least 3 rides)');
      return {
        hasData: false,
        needsMoreRides: true,
        ridesCount: rides?.length || 0
      };
    }

    console.log(`✅ Found ${rides.length} rides for analysis`);

    // Categorize rides by terrain type
    const categorizedRides = categorizeRidesByTerrain(rides);

    // Calculate median speeds for each category
    const speedProfile = {
      baseRoadSpeed: calculateMedianSpeed(categorizedRides.road),
      baseGravelSpeed: calculateMedianSpeed(categorizedRides.gravel),
      baseClimbingSpeed: calculateMedianSpeed(categorizedRides.climbing),
      baseCommuteSpeed: calculateMedianSpeed(categorizedRides.commute),
      baseMountainSpeed: calculateMedianSpeed(categorizedRides.mountain),

      // Metadata
      ridesAnalyzed: rides.length,
      roadRidesCount: categorizedRides.road.length,
      gravelRidesCount: categorizedRides.gravel.length,
      climbingRidesCount: categorizedRides.climbing.length,
      commuteRidesCount: categorizedRides.commute.length,

      // Calculate confidence score
      speedConfidence: calculateConfidenceScore(
        rides.length,
        categorizedRides.road.length,
        categorizedRides.gravel.length,
        categorizedRides.climbing.length
      ),

      hasSufficientData: rides.length >= 10,
      analyzedAt: new Date().toISOString()
    };

    console.log('📈 Speed profile calculated:', speedProfile);

    // Save to database
    await saveSpeedProfile(userId, speedProfile);

    return {
      hasData: true,
      ...speedProfile
    };

  } catch (error) {
    console.error('Speed analysis failed:', error);
    throw error;
  }
}

/**
 * Categorize rides by terrain type based on surface, elevation, and distance
 */
function categorizeRidesByTerrain(rides) {
  const categories = {
    road: [],
    gravel: [],
    climbing: [],
    commute: [],
    mountain: []
  };

  rides.forEach(ride => {
    // Skip rides with invalid speed data
    if (!ride.average_speed || ride.average_speed < 10 || ride.average_speed > 50) {
      return;
    }

    // Calculate elevation gain per km
    const elevationPerKm = ride.elevation_gain_m / ride.distance_km;

    // Categorize based on surface type and elevation
    const surfaceType = ride.surface_type?.toLowerCase() || '';

    // Mountain biking (technical terrain)
    if (surfaceType.includes('single') || surfaceType.includes('mountain') ||
        (surfaceType.includes('dirt') && elevationPerKm > 30)) {
      categories.mountain.push(ride);
    }
    // Gravel/mixed terrain
    else if (surfaceType.includes('gravel') || surfaceType.includes('mixed') ||
             surfaceType.includes('unpaved')) {
      categories.gravel.push(ride);
    }
    // Sustained climbing (road or gravel)
    else if (elevationPerKm > 40) {
      categories.climbing.push(ride);
    }
    // Commute rides (short, urban)
    else if (ride.distance_km < 20 && elevationPerKm < 15) {
      categories.commute.push(ride);
    }
    // Road cycling (default)
    else {
      categories.road.push(ride);
    }
  });

  console.log('📊 Ride categorization:', {
    road: categories.road.length,
    gravel: categories.gravel.length,
    climbing: categories.climbing.length,
    commute: categories.commute.length,
    mountain: categories.mountain.length
  });

  return categories;
}

/**
 * Calculate median speed from array of rides (robust to outliers)
 */
function calculateMedianSpeed(rides) {
  if (!rides || rides.length === 0) {
    return null; // No data for this category
  }

  // Extract speeds and sort
  const speeds = rides
    .map(r => r.average_speed)
    .filter(s => s && s > 0)
    .sort((a, b) => a - b);

  if (speeds.length === 0) return null;

  // Calculate median
  const mid = Math.floor(speeds.length / 2);
  const median = speeds.length % 2 === 0
    ? (speeds[mid - 1] + speeds[mid]) / 2
    : speeds[mid];

  return Math.round(median * 10) / 10; // Round to 1 decimal
}

/**
 * Calculate confidence score (0-1) based on data quantity and diversity
 */
function calculateConfidenceScore(totalRides, roadCount, gravelCount, climbingCount) {
  let confidence = 0;

  // Base confidence from total rides (0-0.6)
  confidence += Math.min(totalRides / 30, 0.6);

  // Terrain diversity bonus (0-0.4)
  if (roadCount >= 5) confidence += 0.15;
  if (gravelCount >= 3) confidence += 0.15;
  if (climbingCount >= 3) confidence += 0.10;

  return Math.min(confidence, 1.0);
}

/**
 * Save speed profile to database
 */
async function saveSpeedProfile(userId, profile) {
  const { error } = await supabase
    .from('athlete_performance_profile')
    .upsert({
      user_id: userId,
      base_road_speed: profile.baseRoadSpeed,
      base_gravel_speed: profile.baseGravelSpeed,
      base_climbing_speed: profile.baseClimbingSpeed,
      base_commute_speed: profile.baseCommuteSpeed,
      base_mountain_speed: profile.baseMountainSpeed,
      speed_confidence: profile.speedConfidence,
      rides_analyzed_count: profile.ridesAnalyzed,
      road_rides_count: profile.roadRidesCount,
      gravel_rides_count: profile.gravelRidesCount,
      climbing_rides_count: profile.climbingRidesCount,
      commute_rides_count: profile.commuteRidesCount,
      has_sufficient_data: profile.hasSufficientData,
      needs_recalculation: false,
      last_calculated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('Error saving speed profile:', error);
    throw error;
  }

  console.log('✅ Speed profile saved to database');
}

/**
 * Get user's speed profile (from DB or calculate if needed)
 */
export async function getUserSpeedProfile(userId) {
  try {
    // Try to get existing profile
    const { data: profile, error } = await supabase
      .from('user_speed_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      console.error('Error fetching speed profile:', error);
    }

    // If no profile exists or needs recalculation, analyze now
    if (!profile || profile.needs_recalculation) {
      console.log('🔄 Speed profile needs calculation');
      const newProfile = await analyzeUserSpeedProfile(userId);

      if (!newProfile.hasData) {
        // Return defaults if insufficient data
        return getDefaultSpeedProfile();
      }

      // Fetch the newly saved profile
      return await getUserSpeedProfile(userId);
    }

    // Return existing profile with effective speeds
    return {
      baseRoadSpeed: profile.base_road_speed,
      baseGravelSpeed: profile.base_gravel_speed,
      baseClimbingSpeed: profile.base_climbing_speed,
      baseCommuteSpeed: profile.base_commute_speed,
      baseMountainSpeed: profile.base_mountain_speed,
      effectiveRoadSpeed: profile.effective_road_speed,
      effectiveGravelSpeed: profile.effective_gravel_speed,
      effectiveClimbingSpeed: profile.effective_climbing_speed,
      effectiveCommuteSpeed: profile.effective_commute_speed,
      currentSpeedModifier: profile.current_speed_modifier || 1.0,
      suggestedSpeedModifier: profile.suggested_speed_modifier || 1.0,
      speedModifierReason: profile.speed_modifier_reason,
      speedConfidence: profile.speed_confidence,
      ridesAnalyzedCount: profile.rides_analyzed_count,
      hasSufficientData: profile.has_sufficient_data,
      fatigueLevel: profile.fatigue_level
    };

  } catch (error) {
    console.error('Error getting user speed profile:', error);
    return getDefaultSpeedProfile();
  }
}

/**
 * Get default speed profile (fallback when no data)
 */
function getDefaultSpeedProfile() {
  return {
    baseRoadSpeed: 25.0,
    baseGravelSpeed: 20.0,
    baseClimbingSpeed: 14.0,
    baseCommuteSpeed: 18.0,
    baseMountainSpeed: 16.0,
    effectiveRoadSpeed: 25.0,
    effectiveGravelSpeed: 20.0,
    effectiveClimbingSpeed: 14.0,
    effectiveCommuteSpeed: 18.0,
    currentSpeedModifier: 1.0,
    suggestedSpeedModifier: 1.0,
    speedConfidence: 0.0,
    ridesAnalyzedCount: 0,
    hasSufficientData: false,
    fatigueLevel: 'fresh'
  };
}

/**
 * Suggest speed modifier based on fatigue and training context
 */
export async function suggestSpeedModifier(userId) {
  try {
    // Get training context
    const { data: context, error } = await supabase
      .from('training_context')
      .select('fatigue_level, current_phase, recent_intensity')
      .eq('user_id', userId)
      .single();

    if (error || !context) {
      return {
        modifier: 1.0,
        reason: 'No training context available'
      };
    }

    // Base modifiers by fatigue level
    const fatigueModifiers = {
      'fresh': 1.0,
      'moderate': 0.95,
      'tired': 0.85,
      'exhausted': 0.75
    };

    let modifier = fatigueModifiers[context.fatigue_level] || 1.0;
    let reasons = [];

    // Fatigue adjustment
    if (context.fatigue_level === 'tired' || context.fatigue_level === 'exhausted') {
      reasons.push(`You're ${context.fatigue_level} - consider an easier pace`);
    }

    // Recent intensity adjustment
    if (context.recent_intensity === 'high') {
      modifier = Math.max(modifier - 0.05, 0.70);
      reasons.push('Recent high-intensity rides - recovery recommended');
    }

    // Training phase adjustment
    if (context.current_phase === 'recovery') {
      modifier = Math.max(modifier - 0.10, 0.70);
      reasons.push('Recovery week - prioritize easy efforts');
    } else if (context.current_phase === 'peak') {
      modifier = Math.max(modifier - 0.05, 0.85);
      reasons.push('Taper phase - save energy for your event');
    }

    const reason = reasons.length > 0 ? reasons.join('. ') : 'You\'re feeling good!';

    // Save suggestion to database
    await supabase
      .from('training_context')
      .update({
        suggested_speed_modifier: modifier,
        speed_modifier_reason: reason
      })
      .eq('user_id', userId);

    return {
      modifier: Math.round(modifier * 100) / 100, // Round to 2 decimals
      reason
    };

  } catch (error) {
    console.error('Error suggesting speed modifier:', error);
    return {
      modifier: 1.0,
      reason: 'Error calculating suggestion'
    };
  }
}

/**
 * Update user's current speed modifier preference
 */
export async function updateSpeedModifier(userId, modifier) {
  try {
    const { error } = await supabase
      .from('training_context')
      .upsert({
        user_id: userId,
        current_speed_modifier: modifier
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;

    console.log(`✅ Speed modifier updated to ${modifier}x`);
    return true;

  } catch (error) {
    console.error('Error updating speed modifier:', error);
    return false;
  }
}

export default {
  analyzeUserSpeedProfile,
  getUserSpeedProfile,
  suggestSpeedModifier,
  updateSpeedModifier
};
