// Vercel API Route: Strava Activities
// Fetches activities from Strava and stores them in Supabase

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';
import { checkForDuplicate, mergeActivityData } from './utils/activityDedup.js';
import { extractAndStoreActivitySegments } from './utils/roadSegmentExtractor.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

/**
 * Extract and validate user from Authorization header
 * Returns user object or null if not authenticated
 */
async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Auth token validation failed:', error?.message);
    return null;
  }

  return user;
}

/**
 * Validate that authenticated user matches the requested userId
 * Returns error response if validation fails, null if valid
 */
async function validateUserAccess(req, res, requestedUserId) {
  const authUser = await getUserFromAuthHeader(req);

  if (!authUser) {
    // No auth header - log warning but allow for backwards compatibility
    // TODO: Make this required after frontend is updated
    console.warn('⚠️ No Authorization header provided for strava-activities request');
    return null;
  }

  if (authUser.id !== requestedUserId) {
    console.error(`🚨 User ID mismatch: auth user ${authUser.id} requested data for ${requestedUserId}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You can only access your own data'
    });
  }

  return null; // Validation passed
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return; // Was an OPTIONS request, already handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, userId, page = 1, perPage = 50 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Validate that authenticated user matches requested userId
    const validationError = await validateUserAccess(req, res, userId);
    if (validationError) {
      return; // Response already sent
    }

    switch (action) {
      case 'sync_activities':
        return await syncActivities(req, res, userId, page, perPage);

      case 'sync_all_activities':
        return await syncAllActivities(req, res, userId);

      case 'get_speed_profile':
        return await getSpeedProfile(req, res, userId);

      case 'calculate_speed_profile':
        return await calculateSpeedProfile(req, res, userId);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Strava activities error:', error);
    return res.status(500).json({
      error: 'Failed to process request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Get valid access token, refreshing if needed
 */
async function getValidAccessToken(userId) {
  // Get stored tokens
  const { data: integration, error } = await supabase
    .from('bike_computer_integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'strava')
    .single();

  if (error || !integration) {
    throw new Error('Strava not connected');
  }

  // Check if token is expired (with 10 min buffer for safety)
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();
  const isExpired = (expiresAt.getTime() - 600000) < now.getTime();

  if (!isExpired) {
    return integration.access_token;
  }

  // Refresh the token
  console.log('🔄 Refreshing Strava access token...');

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token
    })
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Strava token');
  }

  const tokenData = await response.json();

  // Update stored tokens
  const newExpiresAt = new Date(tokenData.expires_at * 1000).toISOString();
  await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('provider', 'strava');

  console.log('✅ Strava token refreshed');
  return tokenData.access_token;
}

/**
 * Sync activities from Strava to Supabase
 */
async function syncActivities(req, res, userId, page, perPage) {
  try {
    const accessToken = await getValidAccessToken(userId);

    // Fetch activities from Strava
    const url = `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=${perPage}`;
    console.log(`📥 Fetching Strava activities (page ${page})...`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Strava API error:', errorText);
      throw new Error(`Strava API error: ${response.status}`);
    }

    const activities = await response.json();
    console.log(`📦 Received ${activities.length} activities from Strava`);

    // Filter to only cycling activities
    const cyclingActivities = activities.filter(a =>
      ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'].includes(a.type)
    );

    console.log(`🚴 ${cyclingActivities.length} cycling activities`);

    // Store activities in Supabase
    const storedCount = await storeActivities(userId, cyclingActivities);

    // Recalculate speed profile after syncing
    await calculateAndStoreSpeedProfile(userId);

    return res.status(200).json({
      success: true,
      fetched: activities.length,
      cyclingActivities: cyclingActivities.length,
      stored: storedCount,
      hasMore: activities.length === perPage
    });

  } catch (error) {
    console.error('Sync activities error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Sync ALL activities from Strava (full history)
 * Processes in chunks to avoid timeout - frontend should call repeatedly until reachedEnd is true
 */
async function syncAllActivities(req, res, userId) {
  // Process 5 pages per call (~500 activities) to stay within timeout
  const { startPage = 1, pagesPerChunk = 5, after, before } = req.body;

  try {
    const accessToken = await getValidAccessToken(userId);

    let page = startPage;
    let totalFetched = 0;
    let totalStored = 0;
    let hasMore = true;
    const endPage = startPage + pagesPerChunk - 1;

    console.log(`📥 Strava history sync for user ${userId} (pages ${startPage}-${endPage})...`);
    if (after) console.log(`📅 Filtering after: ${new Date(after * 1000).toISOString()}`);
    if (before) console.log(`📅 Filtering before: ${new Date(before * 1000).toISOString()}`);

    while (hasMore && page <= endPage) {
      let url = `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=100`;
      if (after) url += `&after=${after}`;
      if (before) url += `&before=${before}`;
      console.log(`📄 Fetching page ${page}...`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Strava API error:', errorText);

        // Check for rate limiting
        if (response.status === 429) {
          console.log('⏳ Rate limited, returning partial results');
          return res.status(200).json({
            success: true,
            totalFetched,
            totalStored,
            pagesProcessed: page - startPage,
            nextPage: page,
            reachedEnd: false,
            rateLimited: true
          });
        }

        throw new Error(`Strava API error: ${response.status}`);
      }

      const activities = await response.json();
      console.log(`📦 Page ${page}: ${activities.length} activities`);

      if (activities.length === 0) {
        hasMore = false;
        break;
      }

      totalFetched += activities.length;

      // Filter to cycling activities
      const cyclingActivities = activities.filter(a =>
        ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'].includes(a.type)
      );

      // Store with deduplication
      const stored = await storeActivities(userId, cyclingActivities);
      totalStored += stored;

      // Check if there are more pages
      hasMore = activities.length === 100;
      page++;

      // Small delay to be nice to Strava API
      if (hasMore && page <= endPage) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Only recalculate speed profile when we've finished all pages
    const reachedEnd = !hasMore;
    if (reachedEnd) {
      await calculateAndStoreSpeedProfile(userId);
      console.log(`✅ Full sync complete: ${totalFetched} fetched, ${totalStored} stored/merged`);
    } else {
      console.log(`📄 Chunk complete: ${totalFetched} fetched, ${totalStored} stored, more pages available`);
    }

    return res.status(200).json({
      success: true,
      totalFetched,
      totalStored,
      pagesProcessed: page - startPage,
      nextPage: hasMore ? page : null,
      reachedEnd
    });

  } catch (error) {
    console.error('Full sync error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Store activities in Supabase with cross-provider duplicate detection
 */
async function storeActivities(userId, activities) {
  if (activities.length === 0) return 0;

  let stored = 0;
  let merged = 0;
  let skipped = 0;

  for (const a of activities) {
    const activityData = {
      user_id: userId,
      provider: 'strava',
      provider_activity_id: a.id.toString(),
      name: a.name,
      type: a.type,
      sport_type: a.sport_type || a.type,
      start_date: a.start_date,
      start_date_local: a.start_date_local,
      distance: a.distance, // meters
      moving_time: a.moving_time, // seconds
      elapsed_time: a.elapsed_time, // seconds
      total_elevation_gain: a.total_elevation_gain, // meters
      average_speed: a.average_speed, // m/s
      max_speed: a.max_speed, // m/s
      average_watts: a.average_watts || null,
      kilojoules: a.kilojoules || null,
      average_heartrate: a.average_heartrate || null,
      max_heartrate: a.max_heartrate || null,
      suffer_score: a.suffer_score || null,
      workout_type: a.workout_type || null,
      trainer: a.trainer || false,
      commute: a.commute || false,
      gear_id: a.gear_id || null,
      map_summary_polyline: a.map?.summary_polyline || null,
      raw_data: a,
      updated_at: new Date().toISOString()
    };

    // Check for same-provider duplicate first
    const { data: existingStrava } = await supabase
      .from('activities')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .eq('provider_activity_id', a.id.toString())
      .maybeSingle();

    if (existingStrava) {
      // Update existing Strava activity
      await supabase
        .from('activities')
        .update(activityData)
        .eq('id', existingStrava.id);
      skipped++;
      continue;
    }

    // Check for cross-provider duplicate (e.g., same ride from Garmin)
    const dupCheck = await checkForDuplicate(
      userId,
      a.start_date,
      a.distance,
      'strava',
      a.id.toString()
    );

    if (dupCheck.isDuplicate) {
      // Merge Strava data into existing activity
      console.log(`🔄 Cross-provider duplicate: Strava activity ${a.id} matches ${dupCheck.existingActivity.provider}`);
      const stravaData = {
        map_summary_polyline: a.map?.summary_polyline || null,
        average_watts: a.average_watts || null,
        kilojoules: a.kilojoules || null,
        average_heartrate: a.average_heartrate || null,
        max_heartrate: a.max_heartrate || null,
        average_cadence: a.average_cadence || null,
        raw_data: a
      };
      await mergeActivityData(dupCheck.existingActivity.id, stravaData, 'strava');
      merged++;
      continue;
    }

    // No duplicate - insert new activity
    const { data: inserted, error } = await supabase
      .from('activities')
      .insert(activityData)
      .select('id')
      .single();

    if (error) {
      console.error('Error storing activity:', a.id, error.message);
    } else {
      stored++;

      // Extract road segments for preference-based routing (async, don't block)
      if (activityData.map_summary_polyline && inserted?.id) {
        extractAndStoreActivitySegments(inserted.id, userId).catch(err => {
          console.warn(`⚠️ Segment extraction failed for activity ${a.id}:`, err.message);
        });
      }
    }
  }

  console.log(`📊 Strava sync: ${stored} new, ${merged} merged, ${skipped} updated`);
  return stored + merged;
}

/**
 * Get user's speed profile
 */
async function getSpeedProfile(req, res, userId) {
  try {
    const { data: profile, error } = await supabase
      .from('user_speed_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!profile) {
      return res.status(200).json({
        success: true,
        profile: null,
        message: 'No speed profile yet. Sync activities to generate.'
      });
    }

    return res.status(200).json({
      success: true,
      profile
    });

  } catch (error) {
    console.error('Get speed profile error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Calculate speed profile from stored activities
 */
async function calculateSpeedProfile(req, res, userId) {
  try {
    const profile = await calculateAndStoreSpeedProfile(userId);

    return res.status(200).json({
      success: true,
      profile
    });

  } catch (error) {
    console.error('Calculate speed profile error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Calculate and store speed profile
 */
async function calculateAndStoreSpeedProfile(userId) {
  // Get recent outdoor cycling activities (last 3 months)
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const { data: activities, error } = await supabase
    .from('activities')
    .select('*')
    .eq('user_id', userId)
    .eq('trainer', false) // Outdoor only
    .gte('start_date', threeMonthsAgo.toISOString())
    .gte('distance', 5000) // At least 5km
    .order('start_date', { ascending: false });

  if (error) {
    throw error;
  }

  if (!activities || activities.length < 3) {
    console.log(`⚠️ Not enough activities for speed profile (need 3, have ${activities?.length || 0})`);
    return null;
  }

  console.log(`📊 Calculating speed profile from ${activities.length} activities`);

  // Calculate speeds by activity type
  const roadActivities = activities.filter(a =>
    a.type === 'Ride' || a.type === 'VirtualRide'
  );
  const gravelActivities = activities.filter(a =>
    a.type === 'GravelRide'
  );
  const mtbActivities = activities.filter(a =>
    a.type === 'MountainBikeRide'
  );

  // Calculate median speed - most robust against outliers
  // Median is unaffected by a few very slow or very fast rides
  const medianSpeed = (acts) => {
    if (acts.length === 0) return null;
    const speeds = acts
      .map(a => (a.average_speed || 0) * 3.6) // m/s to km/h
      .filter(s => s > 0) // Remove zero speeds
      .sort((a, b) => a - b);
    if (speeds.length === 0) return null;
    const mid = Math.floor(speeds.length / 2);
    // For even length, average the two middle values
    if (speeds.length % 2 === 0) {
      return (speeds[mid - 1] + speeds[mid]) / 2;
    }
    return speeds[mid];
  };

  // Calculate percentile speed for performance tiers
  const percentileSpeed = (acts, percentile) => {
    if (acts.length === 0) return null;
    const speeds = acts
      .map(a => (a.average_speed || 0) * 3.6)
      .filter(s => s > 0)
      .sort((a, b) => a - b);
    if (speeds.length === 0) return null;
    const index = Math.floor(speeds.length * percentile);
    return speeds[Math.min(index, speeds.length - 1)];
  };

  // Calculate stats for all activities
  const allSpeeds = activities.map(a => (a.average_speed || 0) * 3.6).filter(s => s > 0);
  const simpleAvgSpeed = allSpeeds.length > 0 ? allSpeeds.reduce((a, b) => a + b, 0) / allSpeeds.length : 0;
  const stdDev = allSpeeds.length > 0 ? Math.sqrt(
    allSpeeds.reduce((sum, s) => sum + Math.pow(s - simpleAvgSpeed, 2), 0) / allSpeeds.length
  ) : 0;

  // Use median speed - most robust against outliers
  const overallMedianSpeed = medianSpeed(activities);

  const speedProfile = {
    user_id: userId,
    // Overall stats - use median to avoid slow/fast ride bias
    average_speed: overallMedianSpeed || simpleAvgSpeed,
    speed_std_dev: stdDev,
    rides_analyzed: activities.length,

    // By activity type - use median for each category
    road_speed: medianSpeed(roadActivities),
    road_rides_count: roadActivities.length,
    gravel_speed: medianSpeed(gravelActivities),
    gravel_rides_count: gravelActivities.length,
    mtb_speed: medianSpeed(mtbActivities),
    mtb_rides_count: mtbActivities.length,

    // Performance tiers - based on percentiles
    easy_speed: (overallMedianSpeed || simpleAvgSpeed) * 0.75, // Recovery pace
    endurance_speed: (overallMedianSpeed || simpleAvgSpeed) * 0.90, // Sustainable pace
    tempo_speed: percentileSpeed(activities, 0.75), // Faster pace
    fast_speed: percentileSpeed(activities, 0.90), // Top 10% pace

    // Elevation tolerance
    avg_elevation_per_km: activities.reduce((sum, a) =>
      sum + (a.total_elevation_gain / (a.distance / 1000)), 0) / activities.length,

    // Time preferences
    avg_ride_duration: activities.reduce((sum, a) => sum + a.moving_time, 0) / activities.length / 60, // minutes

    // Metadata
    has_sufficient_data: activities.length >= 5,
    last_calculated: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  console.log('📊 Speed Profile (using median):', {
    avgSpeed: speedProfile.average_speed?.toFixed(1) + ' km/h (' + (speedProfile.average_speed * 0.621371).toFixed(1) + ' mph)',
    roadSpeed: speedProfile.road_speed?.toFixed(1) + ' km/h (' + (speedProfile.road_speed ? (speedProfile.road_speed * 0.621371).toFixed(1) : 'N/A') + ' mph)',
    roadRides: roadActivities.length,
    gravelSpeed: speedProfile.gravel_speed?.toFixed(1) + ' km/h (' + (speedProfile.gravel_speed ? (speedProfile.gravel_speed * 0.621371).toFixed(1) : 'N/A') + ' mph)',
    gravelRides: gravelActivities.length,
    ridesAnalyzed: speedProfile.rides_analyzed
  });

  // Store speed profile
  const { error: upsertError } = await supabase
    .from('user_speed_profiles')
    .upsert(speedProfile, {
      onConflict: 'user_id'
    });

  if (upsertError) {
    console.error('Error storing speed profile:', upsertError);
    throw upsertError;
  }

  return speedProfile;
}
