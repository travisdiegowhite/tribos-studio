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

      case 'reprocess_failed':
        return await reprocessFailedEvents(req, res, userId);

      case 'diagnose':
        return await diagnoseActivities(req, res, userId);

      default:
        return res.status(400).json({ error: 'Invalid action. Use: sync_activities, backfill_activities, get_activity, reprocess_failed, diagnose' });
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
 * Sync activities from Garmin using the backfill endpoint
 *
 * Per Garmin Activity API docs: The Activity API is push-based only.
 * Direct queries require a "pull token" which is only provided in Ping notifications.
 * The only way to request historical activities is via the backfill endpoint,
 * which triggers Garmin to send activities via Push/Ping webhooks.
 */
async function syncActivities(req, res, userId, startDate, endDate, days) {
  // Delegate to backfillActivities since direct queries are not supported
  return await backfillActivities(req, res, userId, days);
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

/**
 * Reprocess failed webhook events using payload data
 * This is for events that failed with "Invalid download token" errors
 * because the old code tried to download FIT files instead of using payload data
 */
async function reprocessFailedEvents(req, res, userId) {
  try {
    // Get the user's Garmin integration
    const { data: integration, error: integrationError } = await supabase
      .from('bike_computer_integrations')
      .select('id, provider_user_id')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single();

    if (integrationError || !integration) {
      return res.status(404).json({ error: 'Garmin integration not found' });
    }

    // Find failed webhook events for this user that have payload data
    const { data: failedEvents, error: eventsError } = await supabase
      .from('garmin_webhook_events')
      .select('*')
      .eq('garmin_user_id', integration.provider_user_id)
      .not('process_error', 'is', null)
      .is('activity_imported_id', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (eventsError) {
      console.error('Error fetching failed events:', eventsError);
      return res.status(500).json({ error: 'Failed to fetch events' });
    }

    if (!failedEvents || failedEvents.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No failed events to reprocess',
        reprocessed: 0
      });
    }

    console.log(`📥 Found ${failedEvents.length} failed events to reprocess`);

    let reprocessed = 0;
    let skipped = 0;
    let errors = [];

    for (const event of failedEvents) {
      try {
        // Extract activity data from payload
        const payload = event.payload;
        if (!payload) {
          console.log(`⚠️ No payload for event ${event.id}`);
          skipped++;
          continue;
        }

        // Get activity info from various payload structures
        let activityInfo = null;
        if (payload.activities && payload.activities.length > 0) {
          activityInfo = payload.activities[0];
        } else if (payload.activityDetails && payload.activityDetails.length > 0) {
          activityInfo = payload.activityDetails[0];
        } else if (payload.activityFiles && payload.activityFiles.length > 0) {
          // For file notifications, we can't reprocess without the callback URL token
          console.log(`⚠️ Event ${event.id} is a file notification - cannot reprocess`);
          skipped++;
          continue;
        }

        if (!activityInfo) {
          console.log(`⚠️ No activity info in payload for event ${event.id}`);
          skipped++;
          continue;
        }

        // Check if activity already exists
        const activityId = event.activity_id || activityInfo.summaryId?.toString() || activityInfo.activityId?.toString();
        if (activityId) {
          const { data: existing } = await supabase
            .from('activities')
            .select('id')
            .eq('provider_activity_id', activityId)
            .eq('user_id', userId)
            .eq('provider', 'garmin')
            .maybeSingle();

          if (existing) {
            console.log(`⚠️ Activity ${activityId} already exists`);
            // Update event to mark it processed
            await supabase
              .from('garmin_webhook_events')
              .update({
                processed: true,
                processed_at: new Date().toISOString(),
                activity_imported_id: existing.id,
                process_error: null
              })
              .eq('id', event.id);
            skipped++;
            continue;
          }
        }

        // Build activity data from payload
        const activityData = {
          user_id: userId,
          provider: 'garmin',
          provider_activity_id: activityId,
          name: activityInfo.activityName || generateActivityName(activityInfo.activityType, activityInfo.startTimeInSeconds),
          type: mapGarminActivityType(activityInfo.activityType),
          sport_type: activityInfo.activityType,
          start_date: activityInfo.startTimeInSeconds
            ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
            : new Date().toISOString(),
          distance: activityInfo.distanceInMeters ?? null,
          moving_time: activityInfo.movingDurationInSeconds ?? activityInfo.durationInSeconds ?? null,
          elapsed_time: activityInfo.elapsedDurationInSeconds ?? activityInfo.durationInSeconds ?? null,
          total_elevation_gain: activityInfo.elevationGainInMeters ?? null,
          total_elevation_loss: activityInfo.elevationLossInMeters ?? null,
          average_speed: activityInfo.averageSpeedInMetersPerSecond ?? null,
          max_speed: activityInfo.maxSpeedInMetersPerSecond ?? null,
          average_watts: activityInfo.averageBikingPowerInWatts ?? null,
          max_watts: activityInfo.maxBikingPowerInWatts ?? null,
          average_heartrate: activityInfo.averageHeartRateInBeatsPerMinute ?? null,
          max_heartrate: activityInfo.maxHeartRateInBeatsPerMinute ?? null,
          average_cadence: activityInfo.averageBikingCadenceInRPM ?? null,
          calories: activityInfo.activeKilocalories ?? null,
          garmin_activity_url: activityId ? `https://connect.garmin.com/modern/activity/${activityId}` : null,
          raw_data: { payload: payload, reprocessed: true }
        };

        // Insert activity
        const { data: activity, error: insertError } = await supabase
          .from('activities')
          .insert(activityData)
          .select()
          .single();

        if (insertError) {
          console.error(`❌ Failed to insert activity for event ${event.id}:`, insertError);
          errors.push({ eventId: event.id, error: insertError.message });
          continue;
        }

        // Update webhook event
        await supabase
          .from('garmin_webhook_events')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            activity_imported_id: activity.id,
            process_error: null
          })
          .eq('id', event.id);

        console.log(`✅ Reprocessed event ${event.id} -> activity ${activity.id}`);
        reprocessed++;

      } catch (err) {
        console.error(`❌ Error reprocessing event ${event.id}:`, err);
        errors.push({ eventId: event.id, error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Reprocessed ${reprocessed} events`,
      total: failedEvents.length,
      reprocessed,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Reprocess failed events error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Diagnose Garmin sync issues
 * Returns detailed info about activities and webhook events
 */
async function diagnoseActivities(req, res, userId) {
  try {
    // Get the user's Garmin integration
    const { data: integration, error: integrationError } = await supabase
      .from('bike_computer_integrations')
      .select('id, provider_user_id, last_sync_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single();

    if (integrationError || !integration) {
      return res.status(404).json({ error: 'Garmin integration not found' });
    }

    // Get all Garmin activities for this user
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('id, provider_activity_id, name, type, start_date, distance, moving_time, created_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .order('start_date', { ascending: false })
      .limit(20);

    // Get all webhook events for this user
    const { data: webhookEvents, error: webhookError } = await supabase
      .from('garmin_webhook_events')
      .select('id, event_type, activity_id, processed, process_error, activity_imported_id, created_at, payload')
      .eq('garmin_user_id', integration.provider_user_id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Analyze webhook events
    const eventAnalysis = (webhookEvents || []).map(event => {
      const payload = event.payload || {};
      let activityInfo = null;
      let dataSource = 'unknown';

      if (payload.activities && payload.activities.length > 0) {
        activityInfo = payload.activities[0];
        dataSource = 'activities (PUSH)';
      } else if (payload.activityDetails && payload.activityDetails.length > 0) {
        activityInfo = payload.activityDetails[0];
        dataSource = 'activityDetails (PUSH)';
      } else if (payload.activityFiles && payload.activityFiles.length > 0) {
        activityInfo = payload.activityFiles[0];
        dataSource = 'activityFiles (PING - needs callback)';
      }

      return {
        id: event.id,
        event_type: event.event_type,
        activity_id: event.activity_id,
        processed: event.processed,
        error: event.process_error,
        imported_id: event.activity_imported_id,
        created_at: event.created_at,
        dataSource,
        hasActivityData: !!activityInfo,
        activityName: activityInfo?.activityName || null,
        activityType: activityInfo?.activityType || null,
        distance: activityInfo?.distanceInMeters ? `${(activityInfo.distanceInMeters / 1000).toFixed(1)} km` : null,
        startTime: activityInfo?.startTimeInSeconds ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString() : null
      };
    });

    return res.status(200).json({
      success: true,
      integration: {
        id: integration.id,
        garminUserId: integration.provider_user_id,
        lastSyncAt: integration.last_sync_at
      },
      activities: {
        count: activities?.length || 0,
        list: activities || []
      },
      webhookEvents: {
        count: webhookEvents?.length || 0,
        analysis: eventAnalysis
      },
      summary: {
        totalWebhooks: webhookEvents?.length || 0,
        withActivityData: eventAnalysis.filter(e => e.hasActivityData).length,
        processed: eventAnalysis.filter(e => e.processed).length,
        withErrors: eventAnalysis.filter(e => e.error).length,
        imported: eventAnalysis.filter(e => e.imported_id).length,
        pushEvents: eventAnalysis.filter(e => e.dataSource.includes('PUSH')).length,
        pingEvents: eventAnalysis.filter(e => e.dataSource.includes('PING')).length
      }
    });

  } catch (error) {
    console.error('Diagnose error:', error);
    return res.status(500).json({ error: error.message });
  }
}
