// Vercel API Route: Strava Activities
// Fetches activities from Strava and stores them in Supabase

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://tribos-studio.vercel.app'];
  }
  return ['http://localhost:3000', 'http://localhost:5173'];
};

export default async function handler(req, res) {
  // Handle CORS
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, userId, page = 1, perPage = 50 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    switch (action) {
      case 'sync_activities':
        return await syncActivities(req, res, userId, page, perPage);

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

  // Check if token is expired (with 5 min buffer)
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();
  const isExpired = (expiresAt.getTime() - 300000) < now.getTime();

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
 * Store activities in Supabase
 */
async function storeActivities(userId, activities) {
  if (activities.length === 0) return 0;

  const activitiesToStore = activities.map(a => ({
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
    raw_data: a, // Store full activity for future use
    updated_at: new Date().toISOString()
  }));

  // Upsert activities (update if exists based on provider_activity_id)
  const { error } = await supabase
    .from('activities')
    .upsert(activitiesToStore, {
      onConflict: 'user_id,provider_activity_id',
      ignoreDuplicates: false
    });

  if (error) {
    console.error('Error storing activities:', error);
    // Continue even if storage fails for some
  }

  return activitiesToStore.length;
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

  // Calculate average speeds (convert m/s to km/h)
  const avgSpeed = (acts) => {
    if (acts.length === 0) return null;
    const totalSpeed = acts.reduce((sum, a) => sum + (a.average_speed || 0), 0);
    return (totalSpeed / acts.length) * 3.6; // m/s to km/h
  };

  // Calculate 90th percentile for "fast" speed
  const percentileSpeed = (acts, percentile = 0.9) => {
    if (acts.length === 0) return null;
    const speeds = acts.map(a => (a.average_speed || 0) * 3.6).sort((a, b) => a - b);
    const index = Math.floor(speeds.length * percentile);
    return speeds[index];
  };

  // Calculate stats for all activities
  const allSpeeds = activities.map(a => (a.average_speed || 0) * 3.6);
  const avgAllSpeed = allSpeeds.reduce((a, b) => a + b, 0) / allSpeeds.length;
  const stdDev = Math.sqrt(
    allSpeeds.reduce((sum, s) => sum + Math.pow(s - avgAllSpeed, 2), 0) / allSpeeds.length
  );

  const speedProfile = {
    user_id: userId,
    // Overall stats
    average_speed: avgAllSpeed,
    speed_std_dev: stdDev,
    rides_analyzed: activities.length,

    // By activity type
    road_speed: avgSpeed(roadActivities),
    road_rides_count: roadActivities.length,
    gravel_speed: avgSpeed(gravelActivities),
    gravel_rides_count: gravelActivities.length,
    mtb_speed: avgSpeed(mtbActivities),
    mtb_rides_count: mtbActivities.length,

    // Performance tiers
    easy_speed: avgAllSpeed * 0.75, // Recovery pace
    endurance_speed: avgAllSpeed * 0.90, // Sustainable pace
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

  console.log('📊 Speed Profile:', {
    avgSpeed: speedProfile.average_speed?.toFixed(1),
    roadSpeed: speedProfile.road_speed?.toFixed(1),
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
