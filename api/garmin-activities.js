// Vercel API Route: Garmin Activities
// Fetches/backfills activities from Garmin Health API and stores them in Supabase
// Similar to strava-activities.js but for Garmin

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';
import { downloadAndParseFitFile } from './utils/fitParser.js';

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

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return; // Was an OPTIONS request, already handled
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

      case 'backfill_gps':
        return await backfillGpsData(req, res, userId);

      default:
        return res.status(400).json({ error: 'Invalid action. Use: sync_activities, backfill_activities, get_activity, reprocess_failed, diagnose, backfill_gps' });
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
        kilojoules: activity.activeKilocalories ? activity.activeKilocalories * 4.184 : null,
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

      // Build activity data using only columns known to exist in the schema
      const activityData = buildActivityData(userId, activityId, a, 'garmin_sync');

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
 * Build activity data object with only columns that exist in the schema
 * This prevents insert failures due to unknown columns
 */
function buildActivityData(userId, activityId, activityInfo, source = 'webhook') {
  // These are the ONLY columns that exist in the activities table
  // Based on the actual schema - if a column doesn't exist, don't include it

  // Garmin uses different field names in different contexts:
  // - Webhook PUSH: elevationGainInMeters, averageBikingPowerInWatts
  // - API response: totalElevationGainInMeters, avgPower
  // - Various: totalElevationGain, averagePower

  const safeData = {
    user_id: userId,
    provider: 'garmin',
    provider_activity_id: activityId,
    name: activityInfo.activityName || generateActivityName(activityInfo.activityType, activityInfo.startTimeInSeconds),
    type: mapGarminActivityType(activityInfo.activityType),
    sport_type: activityInfo.activityType || null,
    start_date: activityInfo.startTimeInSeconds
      ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
      : new Date().toISOString(),
    start_date_local: activityInfo.startTimeInSeconds
      ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
      : new Date().toISOString(),
    // Distance (Garmin sends in meters)
    distance: activityInfo.distanceInMeters ?? activityInfo.distance ?? null,
    // Duration (Garmin sends in seconds)
    moving_time: activityInfo.movingDurationInSeconds ?? activityInfo.durationInSeconds ?? activityInfo.duration ?? null,
    elapsed_time: activityInfo.elapsedDurationInSeconds ?? activityInfo.durationInSeconds ?? activityInfo.duration ?? null,
    // Elevation (multiple possible field names from Garmin)
    total_elevation_gain: activityInfo.elevationGainInMeters
      ?? activityInfo.totalElevationGainInMeters
      ?? activityInfo.totalElevationGain
      ?? activityInfo.total_ascent
      ?? null,
    // Speed (m/s)
    average_speed: activityInfo.averageSpeedInMetersPerSecond ?? activityInfo.averageSpeed ?? activityInfo.avg_speed ?? null,
    max_speed: activityInfo.maxSpeedInMetersPerSecond ?? activityInfo.maxSpeed ?? activityInfo.max_speed ?? null,
    // Power (multiple possible field names from Garmin)
    average_watts: activityInfo.averageBikingPowerInWatts
      ?? activityInfo.averagePower
      ?? activityInfo.avgPower
      ?? activityInfo.avg_power
      ?? null,
    // Calories -> kilojoules (1 kcal = 4.184 kJ)
    kilojoules: activityInfo.activeKilocalories
      ? activityInfo.activeKilocalories * 4.184
      : (activityInfo.calories ? activityInfo.calories * 4.184 : null),
    // Heart rate (bpm)
    average_heartrate: activityInfo.averageHeartRateInBeatsPerMinute
      ?? activityInfo.averageHeartRate
      ?? activityInfo.avgHeartRate
      ?? activityInfo.avg_heart_rate
      ?? null,
    max_heartrate: activityInfo.maxHeartRateInBeatsPerMinute
      ?? activityInfo.maxHeartRate
      ?? activityInfo.max_heart_rate
      ?? null,
    // Cadence
    average_cadence: activityInfo.averageBikingCadenceInRPM
      ?? activityInfo.averageRunningCadenceInStepsPerMinute
      ?? activityInfo.avgCadence
      ?? activityInfo.avg_cadence
      ?? null,
    // Training flags
    trainer: activityInfo.isParent === false || (activityInfo.deviceName || '').toLowerCase().includes('indoor') || false,
    // Store ALL original data in raw_data so nothing is lost
    raw_data: activityInfo,
    imported_from: source,
    updated_at: new Date().toISOString()
  };

  return safeData;
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
 * This is for events that failed due to "Invalid download token" or schema errors
 * by extracting activity data directly from the stored webhook payloads
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

    // Find failed webhook events for this user
    // Include events with errors OR events that have no imported activity
    const { data: failedEvents, error: eventsError } = await supabase
      .from('garmin_webhook_events')
      .select('*')
      .eq('garmin_user_id', integration.provider_user_id)
      .or('process_error.not.is.null,activity_imported_id.is.null')
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

    console.log(`📥 Found ${failedEvents.length} events to check for reprocessing`);

    let reprocessed = 0;
    let skipped = 0;
    let alreadyImported = 0;
    let errors = [];
    let details = [];

    for (const event of failedEvents) {
      try {
        // Extract activity data from payload
        const payload = event.payload;
        if (!payload) {
          details.push({ id: event.id, status: 'skipped', reason: 'No payload' });
          skipped++;
          continue;
        }

        // Get activity info from various payload structures
        let activityInfo = null;
        let dataSource = 'unknown';

        if (payload.activities && payload.activities.length > 0) {
          activityInfo = payload.activities[0];
          dataSource = 'activities';
        } else if (payload.activityDetails && payload.activityDetails.length > 0) {
          activityInfo = payload.activityDetails[0];
          dataSource = 'activityDetails';
        } else if (payload.activityFiles && payload.activityFiles.length > 0) {
          // For file notifications, we can't reprocess without the callback URL token
          details.push({ id: event.id, status: 'skipped', reason: 'PING notification - needs callback URL' });
          skipped++;
          continue;
        }

        if (!activityInfo) {
          details.push({ id: event.id, status: 'skipped', reason: 'No activity data in payload' });
          skipped++;
          continue;
        }

        // Get activity ID
        const activityId = event.activity_id || activityInfo.summaryId?.toString() || activityInfo.activityId?.toString();

        // Check if activity already exists in database
        if (activityId) {
          const { data: existing } = await supabase
            .from('activities')
            .select('id')
            .eq('provider_activity_id', activityId)
            .eq('user_id', userId)
            .eq('provider', 'garmin')
            .maybeSingle();

          if (existing) {
            // Activity already imported - just update the webhook event
            await supabase
              .from('garmin_webhook_events')
              .update({
                processed: true,
                processed_at: new Date().toISOString(),
                activity_imported_id: existing.id,
                process_error: null
              })
              .eq('id', event.id);

            details.push({ id: event.id, activityId, status: 'already_imported', activityDbId: existing.id });
            alreadyImported++;
            continue;
          }
        }

        // Build activity data using centralized helper - ONLY uses columns that exist in the schema
        const activityData = buildActivityData(userId, activityId, activityInfo, `reprocessed_${dataSource}`);
        // Override raw_data to include reprocessing metadata
        activityData.raw_data = { payload: payload, reprocessed: true, dataSource };

        console.log(`📥 Importing activity: ${activityData.name} (${activityId}) from ${dataSource}`);

        // Insert activity
        const { data: activity, error: insertError } = await supabase
          .from('activities')
          .insert(activityData)
          .select()
          .single();

        if (insertError) {
          console.error(`❌ Failed to insert activity for event ${event.id}:`, insertError);
          errors.push({ eventId: event.id, activityId, error: insertError.message });

          // Update the webhook event with the new error
          await supabase
            .from('garmin_webhook_events')
            .update({
              process_error: `Reprocess failed: ${insertError.message}`
            })
            .eq('id', event.id);
          continue;
        }

        // Update webhook event to mark success
        await supabase
          .from('garmin_webhook_events')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            activity_imported_id: activity.id,
            process_error: null
          })
          .eq('id', event.id);

        console.log(`✅ Imported activity ${activity.id}: ${activity.name}`);
        details.push({ id: event.id, activityId, status: 'imported', activityDbId: activity.id, name: activity.name });
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
      alreadyImported,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      details: details.slice(0, 10) // Return first 10 details for debugging
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

/**
 * Backfill GPS data for existing Garmin activities
 * Finds activities without map_summary_polyline and attempts to fetch GPS data
 *
 * Strategy:
 * 1. Find activities missing GPS polyline
 * 2. Look for FIT file URL in webhook events or raw_data
 * 3. Download and parse FIT file to extract GPS track
 * 4. Update activity with encoded polyline
 *
 * Note: FIT file URLs from webhooks expire after 24 hours.
 * For older activities, this triggers a backfill request to Garmin
 * which will send new webhooks with fresh FIT file URLs.
 */
async function backfillGpsData(req, res, userId) {
  try {
    const { limit = 50 } = req.body;

    console.log(`🗺️ Starting GPS backfill for user ${userId}`);

    // Get valid access token
    const { accessToken, integration } = await getValidAccessToken(userId);

    // Find Garmin activities without GPS polyline
    const { data: activitiesWithoutGps, error: queryError } = await supabase
      .from('activities')
      .select('id, provider_activity_id, name, type, start_date, distance, moving_time, raw_data, trainer')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .is('map_summary_polyline', null)
      .eq('trainer', false)  // Skip indoor activities - they won't have GPS
      .order('start_date', { ascending: false })
      .limit(limit);

    if (queryError) {
      console.error('Error querying activities:', queryError);
      return res.status(500).json({ error: 'Failed to query activities' });
    }

    if (!activitiesWithoutGps || activitiesWithoutGps.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All outdoor Garmin activities already have GPS data',
        processed: 0,
        total: 0
      });
    }

    console.log(`📍 Found ${activitiesWithoutGps.length} activities without GPS data`);

    let processed = 0;
    let success = 0;
    let failed = 0;
    let noFitUrl = 0;
    let triggeredBackfill = false;
    const results = [];
    const dateRangesToBackfill = new Set();

    for (const activity of activitiesWithoutGps) {
      try {
        // Try to find a FIT file URL for this activity
        let fitFileUrl = null;

        // Check if raw_data has webhook info with file URL
        const rawData = activity.raw_data || {};
        if (rawData.webhook?.activityFiles?.[0]?.callbackURL) {
          fitFileUrl = rawData.webhook.activityFiles[0].callbackURL;
        } else if (rawData.webhook?.activities?.[0]?.callbackURL) {
          fitFileUrl = rawData.webhook.activities[0].callbackURL;
        }

        // Check webhook events table for this activity
        if (!fitFileUrl && activity.provider_activity_id) {
          const { data: webhookEvent } = await supabase
            .from('garmin_webhook_events')
            .select('file_url, payload')
            .eq('activity_id', activity.provider_activity_id)
            .eq('garmin_user_id', integration.provider_user_id)
            .maybeSingle();

          if (webhookEvent) {
            fitFileUrl = webhookEvent.file_url ||
                         webhookEvent.payload?.activityFiles?.[0]?.callbackURL ||
                         webhookEvent.payload?.activities?.[0]?.callbackURL;
          }
        }

        if (!fitFileUrl) {
          // No FIT URL available - add date to backfill list
          const activityDate = activity.start_date ? new Date(activity.start_date) : null;
          if (activityDate) {
            // Round to day for backfill
            const dateKey = activityDate.toISOString().split('T')[0];
            dateRangesToBackfill.add(dateKey);
          }
          noFitUrl++;
          results.push({
            id: activity.id,
            name: activity.name,
            status: 'no_fit_url',
            message: 'No FIT file URL available, will request backfill'
          });
          continue;
        }

        // Try to download and parse FIT file
        console.log(`📥 Processing ${activity.name} (${activity.id})...`);

        const fitResult = await downloadAndParseFitFile(fitFileUrl, accessToken);

        if (fitResult.error) {
          // URL likely expired (24 hour limit)
          const activityDate = activity.start_date ? new Date(activity.start_date) : null;
          if (activityDate) {
            const dateKey = activityDate.toISOString().split('T')[0];
            dateRangesToBackfill.add(dateKey);
          }
          failed++;
          results.push({
            id: activity.id,
            name: activity.name,
            status: 'failed',
            error: fitResult.error
          });
          continue;
        }

        if (!fitResult.polyline) {
          results.push({
            id: activity.id,
            name: activity.name,
            status: 'no_gps',
            message: 'FIT file has no GPS data (indoor activity?)'
          });
          processed++;
          continue;
        }

        // Update activity with GPS polyline
        const { error: updateError } = await supabase
          .from('activities')
          .update({
            map_summary_polyline: fitResult.polyline,
            updated_at: new Date().toISOString()
          })
          .eq('id', activity.id);

        if (updateError) {
          console.error(`❌ Failed to update activity ${activity.id}:`, updateError);
          failed++;
          results.push({
            id: activity.id,
            name: activity.name,
            status: 'update_failed',
            error: updateError.message
          });
          continue;
        }

        console.log(`✅ GPS saved for: ${activity.name} (${fitResult.simplifiedCount} points)`);
        success++;
        results.push({
          id: activity.id,
          name: activity.name,
          status: 'success',
          points: fitResult.simplifiedCount
        });
        processed++;

      } catch (err) {
        console.error(`❌ Error processing activity ${activity.id}:`, err);
        failed++;
        results.push({
          id: activity.id,
          name: activity.name,
          status: 'error',
          error: err.message
        });
      }
    }

    // If we have dates that need backfill, request it from Garmin
    if (dateRangesToBackfill.size > 0) {
      const sortedDates = Array.from(dateRangesToBackfill).sort();
      const oldestDate = new Date(sortedDates[0]);
      const newestDate = new Date(sortedDates[sortedDates.length - 1]);

      // Add 1 day buffer
      oldestDate.setDate(oldestDate.getDate() - 1);
      newestDate.setDate(newestDate.getDate() + 1);

      const startTimestamp = Math.floor(oldestDate.getTime() / 1000);
      const endTimestamp = Math.floor(newestDate.getTime() / 1000);

      console.log(`📤 Requesting backfill for dates: ${oldestDate.toISOString()} to ${newestDate.toISOString()}`);

      // Request activity files backfill from Garmin
      try {
        const backfillUrl = `${GARMIN_API_BASE}/backfill/activityDetails?summaryStartTimeInSeconds=${startTimestamp}&summaryEndTimeInSeconds=${endTimestamp}`;

        const backfillResponse = await fetch(backfillUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });

        if (backfillResponse.status === 202 || backfillResponse.ok) {
          console.log('✅ Backfill request accepted by Garmin');
          triggeredBackfill = true;
        } else {
          console.warn('⚠️ Backfill request failed:', backfillResponse.status);
        }
      } catch (backfillErr) {
        console.error('❌ Backfill request error:', backfillErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: `GPS backfill complete. ${success} activities updated.`,
      stats: {
        total: activitiesWithoutGps.length,
        processed,
        success,
        failed,
        noFitUrl,
        triggeredBackfill: triggeredBackfill ? dateRangesToBackfill.size : 0
      },
      note: triggeredBackfill
        ? 'Backfill requested from Garmin. New GPS data will arrive via webhooks. Run this again in a few minutes to process the new data.'
        : noFitUrl > 0
          ? 'Some activities have no FIT file URL. The webhook may have been processed before GPS extraction was added.'
          : undefined,
      results: results.slice(0, 20) // Return first 20 results
    });

  } catch (error) {
    console.error('GPS backfill error:', error);
    return res.status(500).json({ error: error.message });
  }
}
