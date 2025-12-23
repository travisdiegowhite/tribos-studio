// Vercel API Route: Garmin Activities
// Fetches/backfills activities from Garmin Health API and stores them in Supabase
// Similar to strava-activities.js but for Garmin

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GARMIN_API_BASE = 'https://apis.garmin.com/wellness-api/rest';
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';

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
    console.warn('⚠️ No Authorization header provided for garmin-activities request');
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
    const { action, userId, startDate, endDate, days = 30 } = req.body;

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
        return await syncActivities(req, res, userId, startDate, endDate, days);

      case 'backfill_activities':
        return await backfillActivities(req, res, userId, days);

      case 'get_activity':
        const { activityId } = req.body;
        if (!activityId) {
          return res.status(400).json({ error: 'activityId required' });
        }
        return await getActivityDetails(req, res, userId, activityId);

      default:
        return res.status(400).json({ error: 'Invalid action. Use: sync_activities, backfill_activities, get_activity' });
    }

  } catch (error) {
    console.error('Garmin activities error:', error);
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
    .select('id, access_token, refresh_token, token_expires_at, provider_user_id')
    .eq('user_id', userId)
    .eq('provider', 'garmin')
    .single();

  if (error || !integration) {
    throw new Error('Garmin not connected');
  }

  if (!integration.access_token) {
    throw new Error('No Garmin access token found. Please reconnect your Garmin account.');
  }

  // Check if token is expired (with 5 min buffer)
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : new Date(0);
  const now = new Date();
  const isExpired = (expiresAt.getTime() - 300000) < now.getTime();

  if (!isExpired) {
    return { accessToken: integration.access_token, integration };
  }

  // Refresh the token
  console.log('🔄 Refreshing Garmin access token...');

  if (!integration.refresh_token) {
    throw new Error('No refresh token available. Please reconnect your Garmin account.');
  }

  const response = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.GARMIN_CONSUMER_KEY,
      client_secret: process.env.GARMIN_CONSUMER_SECRET,
      refresh_token: integration.refresh_token
    }).toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Garmin token refresh failed:', errorText);
    throw new Error('Failed to refresh Garmin token. Please reconnect your Garmin account.');
  }

  const tokenData = await response.json();

  // Update stored tokens
  const expiresInSeconds = tokenData.expires_in || 7776000; // Default 90 days
  const newExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const { error: updateError } = await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || integration.refresh_token,
      token_expires_at: newExpiresAt,
      sync_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', integration.id);

  if (updateError) {
    console.error('❌ CRITICAL: Failed to persist tokens:', updateError);
    throw new Error(`Failed to persist refreshed tokens: ${updateError.message || updateError}`);
  }

  console.log('✅ Garmin token refreshed and persisted');
  return { accessToken: tokenData.access_token, integration };
}

/**
 * Sync activities from Garmin for a date range
 */
async function syncActivities(req, res, userId, startDate, endDate, days) {
  try {
    const { accessToken, integration } = await getValidAccessToken(userId);

    // Calculate date range
    // Garmin uses Unix timestamps (seconds since epoch)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

    const startTimestamp = Math.floor(start.getTime() / 1000);
    const endTimestamp = Math.floor(end.getTime() / 1000);

    console.log(`📥 Fetching Garmin activities from ${start.toISOString()} to ${end.toISOString()}`);

    // Fetch activities from Garmin Health API
    // The activities endpoint returns activities within the specified time range
    const url = `${GARMIN_API_BASE}/activities?uploadStartTimeInSeconds=${startTimestamp}&uploadEndTimeInSeconds=${endTimestamp}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Garmin API error:', response.status, errorText);

      if (response.status === 401 || response.status === 403) {
        throw new Error('Garmin authentication failed. Please reconnect your account.');
      }

      throw new Error(`Garmin API error: ${response.status}`);
    }

    const activities = await response.json();
    console.log(`📦 Received ${activities.length} activities from Garmin`);

    // Filter to cycling activities
    const cyclingTypes = ['cycling', 'road_biking', 'mountain_biking', 'gravel_cycling', 'indoor_cycling', 'virtual_ride', 'e_biking'];
    const cyclingActivities = activities.filter(a =>
      cyclingTypes.includes((a.activityType || '').toLowerCase())
    );

    console.log(`🚴 ${cyclingActivities.length} cycling activities`);

    // Store activities in Supabase
    const storedCount = await storeActivities(userId, cyclingActivities);

    // Update last sync timestamp
    await supabase
      .from('bike_computer_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', integration.id);

    return res.status(200).json({
      success: true,
      fetched: activities.length,
      cyclingActivities: cyclingActivities.length,
      stored: storedCount,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    });

  } catch (error) {
    console.error('Sync activities error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Backfill historical activities using Garmin's backfill endpoint
 * Per Garmin docs: The Activity API is Push/Ping based - you don't directly fetch activities.
 * Backfill requests Garmin to send historical data via webhooks asynchronously.
 *
 * - Uses summaryStartTimeInSeconds and summaryEndTimeInSeconds (when data was RECORDED)
 * - Returns HTTP 202 immediately, data arrives via Push/Ping webhooks
 * - Maximum 30 days per request
 * - Rate limited: 100 days/minute for eval keys, 10,000 days/minute for production
 */
async function backfillActivities(req, res, userId, days) {
  try {
    const { accessToken, integration } = await getValidAccessToken(userId);

    // Calculate date range for backfill
    // Garmin limits backfill to 30 days per request, so we may need multiple requests
    const end = new Date();
    const requestedStart = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

    // Limit to 30 days per Garmin API docs
    const maxDays = 30;
    const actualDays = Math.min(days, maxDays);
    const start = new Date(end.getTime() - actualDays * 24 * 60 * 60 * 1000);

    const startTimestamp = Math.floor(start.getTime() / 1000);
    const endTimestamp = Math.floor(end.getTime() / 1000);

    console.log(`📥 Requesting Garmin backfill for last ${actualDays} days (requested: ${days})`);
    console.log(`   Start: ${start.toISOString()} (${startTimestamp})`);
    console.log(`   End: ${end.toISOString()} (${endTimestamp})`);

    // Garmin Activity API backfill endpoint
    // Per docs: GET /wellness-api/rest/backfill/activities?summaryStartTimeInSeconds=X&summaryEndTimeInSeconds=Y
    const backfillUrl = `${GARMIN_API_BASE}/backfill/activities?summaryStartTimeInSeconds=${startTimestamp}&summaryEndTimeInSeconds=${endTimestamp}`;

    console.log('📤 Requesting backfill:', backfillUrl);

    const backfillResponse = await fetch(backfillUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    // Per docs: Successful backfill returns 202 (Accepted)
    if (backfillResponse.status === 202 || backfillResponse.ok) {
      console.log('✅ Backfill request accepted by Garmin');

      // Update last sync attempt
      await supabase
        .from('bike_computer_integrations')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', integration.id);

      return res.status(200).json({
        success: true,
        method: 'webhook_backfill',
        message: `Backfill request accepted. Garmin will send activities for the last ${actualDays} days via webhooks.`,
        note: days > maxDays ? `Note: Garmin limits backfill to ${maxDays} days per request. Request again for older data.` : undefined,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
          days: actualDays,
          requestedDays: days
        }
      });
    }

    // Handle specific error codes per Garmin docs
    const errorText = await backfillResponse.text();
    console.error('❌ Backfill failed:', backfillResponse.status, errorText);

    // 401 - Unauthorized
    if (backfillResponse.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Garmin authorization failed. Please reconnect your account.',
        status: 401
      });
    }

    // 403 - User hasn't given permission for this data type
    if (backfillResponse.status === 403) {
      return res.status(200).json({
        success: false,
        method: 'none',
        message: 'Garmin permissions issue. Please reconnect your Garmin account and ensure activity sharing is enabled.',
        status: 403
      });
    }

    // 409 - Duplicate backfill request (already requested this time range)
    if (backfillResponse.status === 409) {
      return res.status(200).json({
        success: true,
        method: 'webhook_backfill',
        message: 'Backfill already requested for this time range. Activities will arrive via webhooks shortly.',
        note: 'Duplicate request - Garmin is already processing this time range.',
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
          days: actualDays
        }
      });
    }

    // Other errors
    return res.status(200).json({
      success: false,
      method: 'none',
      message: 'Could not request activity backfill from Garmin.',
      error: errorText,
      status: backfillResponse.status,
      hint: 'Activities will still sync automatically when you complete new rides and sync your Garmin device.',
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
        days: actualDays
      }
    });

  } catch (error) {
    console.error('Backfill activities error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Get details for a specific activity
 */
async function getActivityDetails(req, res, userId, activityId) {
  try {
    const { accessToken } = await getValidAccessToken(userId);

    console.log(`📥 Fetching Garmin activity details for: ${activityId}`);

    const url = `${GARMIN_API_BASE}/activities?summaryId=${activityId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Garmin API error:', response.status, errorText);
      throw new Error(`Failed to fetch activity: ${response.status}`);
    }

    const activities = await response.json();

    if (!Array.isArray(activities) || activities.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const activity = activities[0];

    return res.status(200).json({
      success: true,
      activity: {
        id: activity.summaryId || activityId,
        name: activity.activityName,
        type: activity.activityType,
        startTime: activity.startTimeInSeconds ? new Date(activity.startTimeInSeconds * 1000).toISOString() : null,
        distance: activity.distanceInMeters,
        duration: activity.durationInSeconds,
        movingDuration: activity.movingDurationInSeconds,
        elevation: activity.elevationGainInMeters,
        avgSpeed: activity.averageSpeedInMetersPerSecond,
        maxSpeed: activity.maxSpeedInMetersPerSecond,
        avgHeartRate: activity.averageHeartRateInBeatsPerMinute,
        maxHeartRate: activity.maxHeartRateInBeatsPerMinute,
        avgPower: activity.averageBikingPowerInWatts,
        avgCadence: activity.averageBikingCadenceInRPM,
        calories: activity.activeKilocalories,
        raw: activity
      }
    });

  } catch (error) {
    console.error('Get activity details error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Store activities in Supabase
 */
async function storeActivities(userId, activities) {
  if (!activities || activities.length === 0) return 0;

  let storedCount = 0;

  for (const a of activities) {
    try {
      const activityId = a.summaryId?.toString() || a.activityId?.toString();
      if (!activityId) {
        console.warn('Skipping activity without ID:', a);
        continue;
      }

      const activityData = {
        user_id: userId,
        provider: 'garmin',
        provider_activity_id: activityId,
        name: a.activityName || generateActivityName(a.activityType, a.startTimeInSeconds),
        type: mapGarminActivityType(a.activityType),
        sport_type: a.activityType,
        start_date: a.startTimeInSeconds
          ? new Date(a.startTimeInSeconds * 1000).toISOString()
          : new Date().toISOString(),
        start_date_local: a.startTimeInSeconds
          ? new Date(a.startTimeInSeconds * 1000).toISOString()
          : new Date().toISOString(),
        distance: a.distanceInMeters ?? a.distance ?? null,
        moving_time: a.movingDurationInSeconds ?? a.durationInSeconds ?? null,
        elapsed_time: a.elapsedDurationInSeconds ?? a.durationInSeconds ?? null,
        total_elevation_gain: a.elevationGainInMeters ?? a.totalElevationGain ?? null,
        average_speed: a.averageSpeedInMetersPerSecond ?? a.averageSpeed ?? null,
        max_speed: a.maxSpeedInMetersPerSecond ?? a.maxSpeed ?? null,
        average_watts: a.averageBikingPowerInWatts ?? a.averagePower ?? null,
        average_heartrate: a.averageHeartRateInBeatsPerMinute ?? a.averageHeartRate ?? null,
        max_heartrate: a.maxHeartRateInBeatsPerMinute ?? a.maxHeartRate ?? null,
        average_cadence: a.averageBikingCadenceInRPM ?? null,
        kilojoules: a.activeKilocalories ? a.activeKilocalories * 4.184 : null,
        trainer: a.isParent === false || (a.deviceName || '').toLowerCase().includes('indoor'),
        raw_data: a,
        imported_from: 'garmin_sync',
        updated_at: new Date().toISOString()
      };

      // Upsert (update if exists)
      const { error } = await supabase
        .from('activities')
        .upsert(activityData, {
          onConflict: 'user_id,provider_activity_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('Error storing activity:', activityId, error.message);
      } else {
        storedCount++;
      }
    } catch (err) {
      console.error('Error processing activity:', err);
    }
  }

  console.log(`✅ Stored ${storedCount}/${activities.length} activities`);
  return storedCount;
}

/**
 * Map Garmin activity type to standard format
 */
function mapGarminActivityType(garminType) {
  const typeMap = {
    'cycling': 'Ride',
    'road_biking': 'Ride',
    'road_cycling': 'Ride',
    'virtual_ride': 'VirtualRide',
    'indoor_cycling': 'VirtualRide',
    'mountain_biking': 'MountainBikeRide',
    'gravel_cycling': 'GravelRide',
    'cyclocross': 'Ride',
    'e_biking': 'EBikeRide',
    'running': 'Run',
    'walking': 'Walk',
    'hiking': 'Hike',
    'swimming': 'Swim'
  };

  const lowerType = (garminType || '').toLowerCase().replace(/ /g, '_');
  return typeMap[lowerType] || 'Ride';
}

/**
 * Generate activity name if not provided
 */
function generateActivityName(activityType, startTimeInSeconds) {
  const date = startTimeInSeconds
    ? new Date(startTimeInSeconds * 1000)
    : new Date();

  const timeOfDay = date.getHours() < 12 ? 'Morning' :
                    date.getHours() < 17 ? 'Afternoon' : 'Evening';

  const typeNames = {
    'cycling': 'Ride',
    'road_biking': 'Road Ride',
    'mountain_biking': 'Mountain Bike Ride',
    'gravel_cycling': 'Gravel Ride',
    'indoor_cycling': 'Indoor Ride',
    'virtual_ride': 'Virtual Ride',
    'running': 'Run',
    'trail_running': 'Trail Run',
    'walking': 'Walk',
    'hiking': 'Hike',
    'swimming': 'Swim'
  };

  const activityName = typeNames[(activityType || '').toLowerCase()] || 'Activity';
  return `${timeOfDay} ${activityName}`;
}
