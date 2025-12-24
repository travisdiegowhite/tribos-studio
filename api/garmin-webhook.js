// Vercel API Route: Garmin Activity Webhook Handler
// Receives push notifications when users sync Garmin devices
// Documentation: https://developer.garmin.com/gc-developer-program/activity-api/
//
// CRITICAL: Garmin requires webhook responses within 5 seconds.
// This handler prioritizes fast response, then processes asynchronously.

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { setupCors } from './utils/cors.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Security Configuration
const WEBHOOK_SECRET = process.env.GARMIN_WEBHOOK_SECRET;
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';

// Rate limiting (in-memory - use Redis for production at scale)
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const rateLimitStore = new Map();

// Track webhook reception for diagnostics
let lastWebhookReceived = null;

export default async function handler(req, res) {
  // CORS - Allow Garmin servers (no origin header) and browser origins
  if (setupCors(req, res, { allowedMethods: ['POST', 'GET', 'OPTIONS'] })) {
    return; // Was an OPTIONS request, already handled
  }

  if (req.method === 'GET') {
    // Health check endpoint - Garmin uses this to verify webhook is alive
    // Also useful for debugging connection issues
    return res.status(200).json({
      status: 'ok',
      service: 'garmin-webhook-handler',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      lastWebhookReceived: lastWebhookReceived,
      endpoints: {
        webhook: 'POST /api/garmin-webhook',
        health: 'GET /api/garmin-webhook',
        status: 'GET /api/garmin-webhook-status'
      },
      note: 'Webhook endpoint is active and ready to receive Garmin activity notifications'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  const now = Date.now();

  let limitData = rateLimitStore.get(clientIP);
  if (!limitData || now - limitData.windowStart > RATE_LIMIT_WINDOW_MS) {
    limitData = { windowStart: now, count: 0 };
  }
  limitData.count++;
  rateLimitStore.set(clientIP, limitData);

  if (limitData.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Webhook signature verification (if configured)
  if (WEBHOOK_SECRET) {
    const signature = req.headers['x-garmin-signature'] || req.headers['x-webhook-signature'];
    if (signature) {
      const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.warn('Invalid webhook signature from:', clientIP);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }
  }

  try {
    // Update last webhook received timestamp for health monitoring
    lastWebhookReceived = new Date().toISOString();

    const webhookData = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';

    // Detect Health API Push notifications (dailies, sleeps, bodyComps, etc.)
    const healthDataTypes = ['dailies', 'epochs', 'sleeps', 'bodyComps', 'stressDetails', 'userMetrics', 'hrv'];
    const detectedHealthType = healthDataTypes.find(type => webhookData[type] && webhookData[type].length > 0);

    if (detectedHealthType) {
      console.log('📥 Garmin Health Push received:', {
        type: detectedHealthType,
        count: webhookData[detectedHealthType].length,
        ip: clientIP,
        timestamp: lastWebhookReceived
      });

      // Process health data synchronously (Vercel terminates after response)
      try {
        await processHealthPushData(detectedHealthType, webhookData[detectedHealthType]);
        console.log('✅ Health data processed successfully');
      } catch (err) {
        console.error('❌ Health data processing error:', err);
      }

      // Respond to Garmin
      return res.status(200).json({
        success: true,
        message: `Health data received and processed: ${detectedHealthType}`,
        count: webhookData[detectedHealthType].length
      });
    }

    // Garmin sends different payload structures for different webhook types
    // Parse the payload to extract activity data from various formats
    let activityData = null;
    let webhookType = 'activity';
    let userId = webhookData.userId;
    let activityId = webhookData.activityId;

    // Handle array-based payloads (Garmin's newer format)
    if (webhookData.activities && webhookData.activities.length > 0) {
      activityData = webhookData.activities[0];
      webhookType = 'CONNECT_ACTIVITY';
      userId = activityData.userId || userId;
      activityId = activityData.activityId?.toString() || activityData.summaryId?.toString();
    } else if (webhookData.activityDetails && webhookData.activityDetails.length > 0) {
      activityData = webhookData.activityDetails[0];
      webhookType = 'ACTIVITY_DETAIL';
      userId = activityData.userId || userId;
      activityId = activityData.activityId?.toString();
    } else if (webhookData.activityFiles && webhookData.activityFiles.length > 0) {
      activityData = webhookData.activityFiles[0];
      webhookType = 'ACTIVITY_FILE_DATA';
      userId = activityData.userId || userId;
      activityId = activityData.activityId?.toString();
    }

    console.log('📥 Garmin webhook received:', {
      webhookType,
      userId,
      activityId,
      hasActivityData: !!activityData,
      ip: clientIP,
      timestamp: lastWebhookReceived
    });

    // Validate we have a user ID
    if (!userId) {
      console.warn('🚫 Missing userId in webhook payload');
      return res.status(400).json({ error: 'Invalid webhook payload - missing userId' });
    }

    // Check for duplicate webhook (do this quickly)
    if (activityId) {
      const { data: existing } = await supabase
        .from('garmin_webhook_events')
        .select('id')
        .eq('activity_id', activityId)
        .eq('garmin_user_id', userId)
        .maybeSingle();

      if (existing) {
        console.log('ℹ️ Duplicate webhook ignored:', activityId);
        return res.status(200).json({ success: true, message: 'Already processed', eventId: existing.id });
      }
    }

    // Determine file URL from various payload formats
    let fileUrl = webhookData.fileUrl || webhookData.activityFileUrl;
    if (!fileUrl && activityData) {
      fileUrl = activityData.callbackURL || activityData.fileUrl;
    }

    // Store webhook event (keep this fast - no complex processing)
    const { data: event, error: eventError } = await supabase
      .from('garmin_webhook_events')
      .insert({
        event_type: webhookType,
        garmin_user_id: userId,
        activity_id: activityId,
        file_url: fileUrl,
        file_type: webhookData.fileType || activityData?.fileType || 'FIT',
        upload_timestamp: webhookData.uploadTimestamp ||
          (activityData?.startTimeInSeconds ? new Date(activityData.startTimeInSeconds * 1000).toISOString() : null) ||
          (webhookData.startTimeInSeconds ? new Date(webhookData.startTimeInSeconds * 1000).toISOString() : null),
        payload: webhookData,
        processed: false
      })
      .select()
      .single();

    if (eventError) {
      console.error('Error storing webhook event:', eventError);
      // Still respond with 200 to prevent Garmin from disabling webhook
      // Log the raw payload for debugging
      console.error('Failed payload:', JSON.stringify(webhookData));
      return res.status(200).json({
        success: false,
        message: 'Event storage failed but acknowledged',
        error: eventError.message
      });
    }

    console.log('✅ Webhook event stored:', event.id);

    // Process the webhook event synchronously
    // Vercel serverless functions terminate after response, so setImmediate doesn't work reliably
    // We process BEFORE responding to ensure the activity is actually imported
    try {
      await processWebhookEvent(event.id);
      console.log('✅ Webhook processed successfully:', event.id);
    } catch (err) {
      console.error('❌ Webhook processing error:', err);
      // Error is already logged in processWebhookEvent, just continue
    }

    // CRITICAL: Respond to Garmin (within 5 seconds)
    // Processing should be fast since we use webhook payload data directly for PUSH notifications
    return res.status(200).json({
      success: true,
      eventId: event.id,
      message: 'Webhook received and processed'
    });

  } catch (error) {
    console.error('Webhook handler error:', error);
    // Still return 200 to prevent Garmin from disabling the webhook
    // Even on errors, we want Garmin to keep sending webhooks
    return res.status(200).json({
      success: false,
      error: 'Webhook processing failed',
      message: 'Event acknowledged but processing failed'
    });
  }
}

async function processWebhookEvent(eventId) {
  try {
    console.log('🔄 Processing webhook event:', eventId);

    const { data: event, error: eventError } = await supabase
      .from('garmin_webhook_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      console.log('Event not found:', eventId);
      return;
    }

    if (event.processed) {
      console.log('Event already processed:', eventId);
      return;
    }

    // Find user by Garmin user ID
    const { data: integration, error: integrationError } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, access_token, refresh_token, token_expires_at, provider_user_id')
      .eq('provider', 'garmin')
      .eq('provider_user_id', event.garmin_user_id)
      .maybeSingle();

    if (integrationError) {
      console.error('Error finding integration:', integrationError);
    }

    if (!integration) {
      console.log('⚠️ No integration found for Garmin user:', event.garmin_user_id);
      console.log('This user may need to reconnect their Garmin account.');
      await markEventProcessed(eventId, `No integration found for Garmin user ID: ${event.garmin_user_id}. User needs to reconnect Garmin.`);
      return;
    }

    // Update event with user info
    await supabase
      .from('garmin_webhook_events')
      .update({ user_id: integration.user_id, integration_id: integration.id })
      .eq('id', eventId);

    // Proactively check and refresh token if needed BEFORE any API calls
    try {
      const validToken = await ensureValidAccessToken(integration);
      if (validToken !== integration.access_token) {
        integration.access_token = validToken;
        console.log('✅ Token refreshed proactively');
      }
    } catch (tokenError) {
      console.error('❌ Token refresh failed:', tokenError.message);
      await markEventProcessed(eventId, `Token refresh failed: ${tokenError.message}. User may need to reconnect Garmin.`);
      return;
    }

    // Check if activity already imported
    if (event.activity_id) {
      const { data: existing } = await supabase
        .from('activities')
        .select('id')
        .eq('provider_activity_id', event.activity_id)
        .eq('user_id', integration.user_id)
        .eq('provider', 'garmin')
        .maybeSingle();

      if (existing) {
        console.log('Activity already imported:', event.activity_id);
        await markEventProcessed(eventId, 'Already imported', existing.id);
        return;
      }
    }

    // Download and process activity
    await downloadAndProcessActivity(event, integration);

    // Update integration last sync timestamp (successful)
    await supabase
      .from('bike_computer_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', integration.id);

  } catch (error) {
    console.error('❌ Processing error for event', eventId, ':', error);
    await markEventProcessed(eventId, error.message);
  }
}

async function downloadAndProcessActivity(event, integration) {
  try {
    // Parse activity data from various webhook payload formats
    const payload = event.payload;
    let webhookInfo = null;
    let isPushNotification = false;

    // Extract webhook info from different Garmin payload structures
    // CONNECT_ACTIVITY and ACTIVITY_DETAIL are PUSH notifications - data is in the payload
    // ACTIVITY_FILE_DATA is a PING notification - needs callback URL to fetch data
    if (payload.activities && payload.activities.length > 0) {
      webhookInfo = payload.activities[0];
      isPushNotification = true; // CONNECT_ACTIVITY - summary data in payload
    } else if (payload.activityDetails && payload.activityDetails.length > 0) {
      webhookInfo = payload.activityDetails[0];
      isPushNotification = true; // ACTIVITY_DETAIL - detailed data in payload
    } else if (payload.activityFiles && payload.activityFiles.length > 0) {
      webhookInfo = payload.activityFiles[0];
      isPushNotification = false; // ACTIVITY_FILE_DATA - needs to fetch from callbackURL
    } else {
      // Fallback to flat payload structure
      webhookInfo = payload;
      isPushNotification = true; // Assume data is in payload
    }

    // Get the summary ID (Garmin uses summaryId for API calls)
    const summaryId = webhookInfo?.summaryId || event.activity_id;

    const activityType = webhookInfo?.activityType;

    console.log('📥 Processing Garmin activity:', {
      activityId: event.activity_id,
      summaryId: summaryId,
      activityType: activityType,
      activityName: webhookInfo?.activityName,
      isPushNotification,
      hasAccessToken: !!integration.access_token,
      duration: webhookInfo?.durationInSeconds || webhookInfo?.movingDurationInSeconds,
      distance: webhookInfo?.distanceInMeters
    });

    // FILTER 1: Check if this is a health/monitoring activity type that should be skipped
    if (shouldFilterActivityType(activityType)) {
      console.log('⏭️ Skipping health/monitoring activity type:', activityType);
      await markEventProcessed(event.id, `Filtered: health/monitoring activity type "${activityType}"`);
      return;
    }

    // FILTER 2: Check if activity has minimum metrics (filters trivial auto-detected movements)
    if (!hasMinimumActivityMetrics(webhookInfo || {})) {
      console.log('⏭️ Skipping activity with insufficient metrics:', {
        type: activityType,
        duration: webhookInfo?.durationInSeconds || webhookInfo?.movingDurationInSeconds || 0,
        distance: webhookInfo?.distanceInMeters || 0
      });
      await markEventProcessed(event.id, `Filtered: insufficient metrics (duration/distance too short)`);
      return;
    }

    // For PUSH notifications (CONNECT_ACTIVITY, ACTIVITY_DETAIL), use payload data directly
    // This is faster and avoids "Invalid download token" errors
    // Only fetch from API for PING notifications or if we're missing critical data
    let activityDetails = null;
    const hasSufficientData = webhookInfo &&
      (webhookInfo.distanceInMeters || webhookInfo.durationInSeconds || webhookInfo.startTimeInSeconds);

    if (!isPushNotification && integration.access_token && webhookInfo?.callbackURL) {
      // PING notification - fetch activity data from callback URL
      console.log('📥 Fetching activity from callback URL (PING)...');
      activityDetails = await fetchFromCallbackURL(webhookInfo.callbackURL, integration.access_token);
    } else if (!hasSufficientData && integration.access_token && summaryId) {
      // Missing data - try to fetch from API as fallback
      console.log('📥 Fetching additional data from Garmin API...');
      activityDetails = await fetchGarminActivityDetails(integration.access_token, summaryId);
    } else {
      console.log('✅ Using webhook payload data directly (PUSH notification)');
    }

    // Build activity data from API response (or fallback to webhook data)
    const activityInfo = activityDetails || webhookInfo || {};

    // Build activity data - ONLY use columns that exist in the schema
    // Based on strava-activities.js which works
    const activityData = {
      user_id: integration.user_id,
      provider: 'garmin',
      provider_activity_id: event.activity_id,
      name: activityInfo.activityName ||
            activityInfo.activityDescription ||
            generateActivityName(activityInfo.activityType, activityInfo.startTimeInSeconds),
      type: mapGarminActivityType(activityInfo.activityType),
      sport_type: activityInfo.activityType,
      start_date: activityInfo.startTimeInSeconds
        ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
        : new Date().toISOString(),
      // Distance (Garmin sends in meters)
      distance: activityInfo.distanceInMeters ?? activityInfo.distance ?? null,
      // Duration (Garmin sends in seconds)
      moving_time: activityInfo.movingDurationInSeconds ?? activityInfo.durationInSeconds ?? activityInfo.duration ?? null,
      elapsed_time: activityInfo.elapsedDurationInSeconds ?? activityInfo.durationInSeconds ?? activityInfo.duration ?? null,
      // Elevation (meters) - only total_elevation_gain exists
      total_elevation_gain: activityInfo.elevationGainInMeters ?? activityInfo.totalElevationGain ?? null,
      // Speed (m/s)
      average_speed: activityInfo.averageSpeedInMetersPerSecond ?? activityInfo.averageSpeed ?? null,
      max_speed: activityInfo.maxSpeedInMetersPerSecond ?? activityInfo.maxSpeed ?? null,
      // Power (watts) - only average_watts exists, not max_watts
      average_watts: activityInfo.averageBikingPowerInWatts ?? activityInfo.averagePower ?? null,
      // Heart rate (bpm)
      average_heartrate: activityInfo.averageHeartRateInBeatsPerMinute ?? activityInfo.averageHeartRate ?? null,
      max_heartrate: activityInfo.maxHeartRateInBeatsPerMinute ?? activityInfo.maxHeartRate ?? null,
      // Calories (convert to kilojoules for storage: 1 kcal = 4.184 kJ)
      kilojoules: activityInfo.activeKilocalories ? activityInfo.activeKilocalories * 4.184 : null,
      // Training metrics
      trainer: activityInfo.isParent === false || activityInfo.deviceName?.toLowerCase().includes('indoor') || false,
      raw_data: { webhook: payload, api: activityDetails },
      updated_at: new Date().toISOString()
    };

    const { data: activity, error: insertError } = await supabase
      .from('activities')
      .insert(activityData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Activity insert error:', insertError);
      throw insertError;
    }

    console.log('✅ Activity imported:', {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      distance: activity.distance ? `${(activity.distance / 1000).toFixed(2)} km` : 'N/A',
      duration: activity.moving_time ? `${Math.round(activity.moving_time / 60)} min` : 'N/A',
      avgHR: activity.average_heartrate || 'N/A',
      avgPower: activity.average_watts || 'N/A',
      dataSource: activityDetails ? 'Garmin API' : 'Webhook only'
    });

    // Mark webhook as processed
    await supabase
      .from('garmin_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        activity_imported_id: activity.id
      })
      .eq('id', event.id);

  } catch (error) {
    console.error('Activity download/process error:', error);
    await markEventProcessed(event.id, error.message);
    throw error;
  }
}

/**
 * Fetch activity details from Garmin Health API
 * The webhook only contains minimal data - we need to call the API to get full details
 */
async function fetchGarminActivityDetails(accessToken, summaryId) {
  try {
    console.log('🔍 Fetching activity details from Garmin API for summaryId:', summaryId);

    // Garmin Health API endpoint for activity summaries
    // Note: This endpoint returns the activity summary data
    const apiUrl = `https://apis.garmin.com/wellness-api/rest/activities?summaryId=${summaryId}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Garmin API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });

      // If unauthorized, the token might need refresh (already handled upstream)
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Garmin API authentication failed: ${response.status}`);
      }

      // For other errors, log but don't fail completely - we can still store webhook data
      console.warn('⚠️ Could not fetch activity details from Garmin API, will use webhook data');
      return null;
    }

    const activities = await response.json();

    // The API returns an array of activities
    if (Array.isArray(activities) && activities.length > 0) {
      const activity = activities[0];
      console.log('✅ Fetched activity details from Garmin API:', {
        activityName: activity.activityName,
        activityType: activity.activityType,
        distance: activity.distanceInMeters ? `${(activity.distanceInMeters / 1000).toFixed(2)} km` : 'N/A',
        duration: activity.durationInSeconds ? `${Math.round(activity.durationInSeconds / 60)} min` : 'N/A',
        avgHR: activity.averageHeartRateInBeatsPerMinute || 'N/A',
        avgPower: activity.averageBikingPowerInWatts || 'N/A',
        elevation: activity.elevationGainInMeters || 'N/A'
      });
      return activity;
    }

    console.warn('⚠️ Garmin API returned empty or unexpected response:', activities);
    return null;

  } catch (error) {
    console.error('❌ Error fetching activity from Garmin API:', error.message);
    return null;
  }
}

/**
 * Fetch activity data from Garmin callback URL (for PING notifications)
 * PING notifications include a callbackURL with an embedded token that's valid for 24 hours
 */
async function fetchFromCallbackURL(callbackURL, accessToken) {
  try {
    console.log('📥 Fetching from callback URL:', callbackURL.substring(0, 50) + '...');

    const response = await fetch(callbackURL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Callback URL fetch error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      return null;
    }

    const data = await response.json();
    console.log('✅ Fetched data from callback URL');
    return data;

  } catch (error) {
    console.error('❌ Error fetching from callback URL:', error.message);
    return null;
  }
}

/**
 * Generate a descriptive activity name if Garmin doesn't provide one
 */
function generateActivityName(activityType, startTimeInSeconds) {
  const date = startTimeInSeconds
    ? new Date(startTimeInSeconds * 1000)
    : new Date();

  const timeOfDay = date.getHours() < 12 ? 'Morning' :
                    date.getHours() < 17 ? 'Afternoon' : 'Evening';

  const typeNames = {
    // Cycling
    'cycling': 'Ride',
    'road_biking': 'Road Ride',
    'road_cycling': 'Road Ride',
    'mountain_biking': 'Mountain Bike Ride',
    'gravel_cycling': 'Gravel Ride',
    'indoor_cycling': 'Indoor Ride',
    'virtual_ride': 'Virtual Ride',
    'e_biking': 'E-Bike Ride',
    'bmx': 'BMX Ride',
    'recumbent_cycling': 'Recumbent Ride',
    'track_cycling': 'Track Ride',
    'cyclocross': 'Cyclocross Ride',

    // Running
    'running': 'Run',
    'trail_running': 'Trail Run',
    'treadmill_running': 'Treadmill Run',
    'indoor_running': 'Indoor Run',
    'track_running': 'Track Run',
    'ultra_run': 'Ultra Run',

    // Walking
    'walking': 'Walk',
    'casual_walking': 'Walk',
    'speed_walking': 'Speed Walk',
    'indoor_walking': 'Indoor Walk',
    'treadmill_walking': 'Treadmill Walk',

    // Other cardio
    'hiking': 'Hike',
    'swimming': 'Swim',
    'lap_swimming': 'Lap Swim',
    'open_water_swimming': 'Open Water Swim',
    'pool_swimming': 'Pool Swim',

    // Gym/fitness
    'strength_training': 'Strength Training',
    'cardio': 'Cardio Workout',
    'elliptical': 'Elliptical',
    'stair_climbing': 'Stair Climbing',
    'rowing': 'Row',
    'indoor_rowing': 'Indoor Row',
    'yoga': 'Yoga',
    'pilates': 'Pilates',
    'fitness_equipment': 'Workout',

    // Winter sports
    'resort_skiing': 'Ski',
    'resort_snowboarding': 'Snowboard',
    'cross_country_skiing': 'Nordic Ski',
    'backcountry_skiing': 'Backcountry Ski',

    // Water sports
    'stand_up_paddleboarding': 'Paddleboard',
    'kayaking': 'Kayak',
    'surfing': 'Surf',

    // Multi-sport
    'multi_sport': 'Workout',
    'triathlon': 'Triathlon',
    'duathlon': 'Duathlon',
    'transition': 'Transition'
  };

  const activityName = typeNames[(activityType || '').toLowerCase()] || 'Workout';
  return `${timeOfDay} ${activityName}`;
}

async function ensureValidAccessToken(integration) {
  // Check if token_expires_at is valid
  if (!integration.token_expires_at) {
    console.log('⚠️ No token expiration date found, assuming token needs refresh');
  } else {
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    // Check if token is still valid (with 5 minute buffer)
    if (expiresAt > fiveMinutesFromNow) {
      console.log('✅ Token still valid, expires:', expiresAt.toISOString());
      return integration.access_token;
    }

    console.log('🔄 Token expired or expiring soon, refreshing...');
    console.log('   Token expires at:', expiresAt.toISOString());
    console.log('   Current time:', now.toISOString());
  }

  // Verify we have required credentials
  if (!process.env.GARMIN_CONSUMER_KEY || !process.env.GARMIN_CONSUMER_SECRET) {
    throw new Error('Missing Garmin API credentials (GARMIN_CONSUMER_KEY or GARMIN_CONSUMER_SECRET)');
  }

  if (!integration.refresh_token) {
    throw new Error('No refresh token available. User needs to reconnect Garmin account.');
  }

  console.log('🔄 Refreshing Garmin access token...');

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
    console.error('❌ Garmin token refresh failed:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText
    });

    // Parse specific error conditions
    if (response.status === 400 || response.status === 401) {
      throw new Error(`Token refresh rejected (${response.status}). Refresh token may be invalid or revoked. User needs to reconnect Garmin.`);
    }

    throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const tokenData = await response.json();

  // Garmin tokens typically expire in 90 days, but use the actual expires_in value
  const expiresInSeconds = tokenData.expires_in || 7776000; // Default 90 days
  const newExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  console.log('✅ Token refreshed successfully');
  console.log('   New expiration:', newExpiresAt);

  // Update tokens in database
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
    console.error('❌ CRITICAL: Failed to update tokens in database:', updateError);
    // Throw error - we can't continue with tokens that aren't persisted
    // Otherwise next webhook will use old expired tokens
    throw new Error(`Failed to persist refreshed tokens: ${updateError.message || updateError}`);
  }

  console.log('✅ Tokens persisted to database');
  return tokenData.access_token;
}

async function markEventProcessed(eventId, error = null, activityId = null) {
  await supabase
    .from('garmin_webhook_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      process_error: error,
      activity_imported_id: activityId
    })
    .eq('id', eventId);
}

/**
 * Check if an activity type should be filtered out (health/monitoring data, not real workouts)
 * Returns true if the activity should be SKIPPED
 */
function shouldFilterActivityType(garminType) {
  const lowerType = (garminType || '').toLowerCase();

  // Activity types that are health monitoring, not actual workouts
  const healthMonitoringTypes = [
    'sedentary',           // Sitting/inactive periods
    'sleep',               // Sleep tracking
    'uncategorized',       // Generic monitoring data
    'generic',             // Non-specific activity
    'all_day_tracking',    // 24/7 monitoring
    'monitoring',          // Device monitoring
    'daily_summary',       // Daily health summary
    'respiration',         // Breathing exercises
    'breathwork',          // Breathing exercises
    'meditation',          // Mental wellness
    'nap',                 // Short sleep
  ];

  return healthMonitoringTypes.includes(lowerType);
}

/**
 * Check if activity has minimum metrics to be considered a real workout
 * Filters out trivial auto-detected movements
 */
function hasMinimumActivityMetrics(activityInfo) {
  const durationSeconds = activityInfo.durationInSeconds ||
                          activityInfo.movingDurationInSeconds ||
                          activityInfo.elapsedDurationInSeconds || 0;
  const distanceMeters = activityInfo.distanceInMeters || activityInfo.distance || 0;

  // Require at least 2 minutes duration OR 100 meters distance
  // This filters out trivial auto-detected movements
  const MIN_DURATION_SECONDS = 120; // 2 minutes
  const MIN_DISTANCE_METERS = 100;  // 100 meters

  return durationSeconds >= MIN_DURATION_SECONDS || distanceMeters >= MIN_DISTANCE_METERS;
}

function mapGarminActivityType(garminType) {
  const typeMap = {
    // Cycling activities
    'cycling': 'Ride',
    'road_biking': 'Ride',
    'road_cycling': 'Ride',
    'virtual_ride': 'VirtualRide',
    'indoor_cycling': 'VirtualRide',
    'mountain_biking': 'MountainBikeRide',
    'gravel_cycling': 'GravelRide',
    'cyclocross': 'Ride',
    'e_biking': 'EBikeRide',
    'bmx': 'Ride',
    'recumbent_cycling': 'Ride',
    'track_cycling': 'Ride',

    // Running activities
    'running': 'Run',
    'trail_running': 'TrailRun',
    'treadmill_running': 'Run',
    'indoor_running': 'Run',
    'track_running': 'Run',
    'ultra_run': 'Run',

    // Walking activities
    'walking': 'Walk',
    'casual_walking': 'Walk',
    'speed_walking': 'Walk',
    'indoor_walking': 'Walk',
    'treadmill_walking': 'Walk',

    // Hiking
    'hiking': 'Hike',

    // Swimming
    'swimming': 'Swim',
    'lap_swimming': 'Swim',
    'open_water_swimming': 'Swim',
    'pool_swimming': 'Swim',

    // Other sports
    'strength_training': 'WeightTraining',
    'cardio': 'Workout',
    'elliptical': 'Elliptical',
    'stair_climbing': 'StairStepper',
    'rowing': 'Rowing',
    'indoor_rowing': 'Rowing',
    'yoga': 'Yoga',
    'pilates': 'Workout',
    'fitness_equipment': 'Workout',

    // Winter sports
    'resort_skiing': 'AlpineSki',
    'resort_snowboarding': 'Snowboard',
    'cross_country_skiing': 'NordicSki',
    'backcountry_skiing': 'BackcountrySki',

    // Water sports
    'stand_up_paddleboarding': 'StandUpPaddling',
    'kayaking': 'Kayaking',
    'surfing': 'Surfing',

    // Multi-sport
    'multi_sport': 'Workout',
    'triathlon': 'Workout',
    'duathlon': 'Workout',
    'transition': 'Workout'
  };

  const lowerType = (garminType || '').toLowerCase();

  // Return mapped type, or 'Workout' as a generic fallback (NOT 'Ride')
  return typeMap[lowerType] || 'Workout';
}

// ============================================================================
// HEALTH DATA PUSH PROCESSING
// Handles Push notifications from Garmin Health API (dailies, sleeps, bodyComps, etc.)
// ============================================================================

async function processHealthPushData(dataType, dataArray) {
  console.log(`🏥 Processing ${dataArray.length} ${dataType} records`);

  for (const record of dataArray) {
    try {
      const garminUserId = record.userId;

      // Find the user by Garmin user ID
      const { data: integration, error: integrationError } = await supabase
        .from('bike_computer_integrations')
        .select('user_id')
        .eq('provider', 'garmin')
        .eq('provider_user_id', garminUserId)
        .maybeSingle();

      if (integrationError || !integration) {
        console.warn(`⚠️ No integration found for Garmin user: ${garminUserId}`);
        continue;
      }

      const userId = integration.user_id;

      // Process based on data type
      switch (dataType) {
        case 'dailies':
          await processDailySummary(userId, record);
          break;
        case 'sleeps':
          await processSleepSummary(userId, record);
          break;
        case 'bodyComps':
          await processBodyCompSummary(userId, record);
          break;
        case 'stressDetails':
          await processStressDetails(userId, record);
          break;
        case 'hrv':
          await processHrvSummary(userId, record);
          break;
        default:
          console.log(`ℹ️ Unhandled health data type: ${dataType}`);
      }

    } catch (err) {
      console.error(`❌ Error processing ${dataType} record:`, {
        garminUserId: record.userId,
        calendarDate: record.calendarDate,
        error: err.message,
        stack: err.stack
      });
      // Continue processing other records - don't let one failure stop the batch
    }
  }
}

async function processDailySummary(userId, data) {
  const metricDate = data.calendarDate;
  if (!metricDate) {
    console.warn('Daily summary missing calendarDate');
    return;
  }

  console.log(`📊 Processing daily summary for ${metricDate}:`, {
    restingHR: data.restingHeartRateInBeatsPerMinute,
    avgStress: data.averageStressLevel,
    steps: data.steps
  });

  // Upsert health metrics - using production column names
  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    resting_hr: data.restingHeartRateInBeatsPerMinute || null,
    stress_level: data.averageStressLevel != null
      ? Math.max(1, Math.min(5, Math.round(data.averageStressLevel / 20)))
      : null,
    body_battery: data.bodyBatteryChargedValue || null,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  // Remove null values to avoid overwriting existing data
  Object.keys(healthData).forEach(key => {
    if (healthData[key] === null && key !== 'user_id' && key !== 'metric_date' && key !== 'source') {
      delete healthData[key];
    }
  });

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving daily summary:', error);
  } else {
    console.log(`✅ Daily summary saved for ${metricDate}`);
  }
}

async function processSleepSummary(userId, data) {
  const metricDate = data.calendarDate;
  if (!metricDate) {
    console.warn('Sleep summary missing calendarDate');
    return;
  }

  // Convert sleep duration from seconds to hours
  const sleepHours = data.durationInSeconds
    ? Math.round((data.durationInSeconds / 3600) * 10) / 10
    : null;

  // Convert sleep score to 1-5 scale if available
  let sleepQuality = null;
  if (data.overallSleepScore?.value != null) {
    sleepQuality = Math.max(1, Math.min(5, Math.round(data.overallSleepScore.value / 20)));
  }

  console.log(`😴 Processing sleep summary for ${metricDate}:`, {
    duration: sleepHours,
    score: data.overallSleepScore?.value,
    quality: sleepQuality
  });

  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    sleep_hours: sleepHours,
    sleep_quality: sleepQuality,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  // Remove null values
  Object.keys(healthData).forEach(key => {
    if (healthData[key] === null && key !== 'user_id' && key !== 'metric_date' && key !== 'source') {
      delete healthData[key];
    }
  });

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving sleep summary:', error);
  } else {
    console.log(`✅ Sleep summary saved for ${metricDate}`);
  }
}

async function processBodyCompSummary(userId, data) {
  // Body comp uses measurementTimeInSeconds, not calendarDate
  const measurementTime = data.measurementTimeInSeconds
    ? new Date(data.measurementTimeInSeconds * 1000)
    : new Date();
  const metricDate = measurementTime.toISOString().split('T')[0];

  const weightKg = data.weightInGrams
    ? Math.round((data.weightInGrams / 1000) * 10) / 10
    : null;

  const bodyFatPercent = data.bodyFatInPercent || null;

  console.log(`⚖️ Processing body comp for ${metricDate}:`, {
    weight: weightKg,
    bodyFat: bodyFatPercent
  });

  if (!weightKg && !bodyFatPercent) {
    console.log('No useful body comp data to save');
    return;
  }

  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    weight_kg: weightKg,
    body_fat_percent: bodyFatPercent,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  // Remove null values
  Object.keys(healthData).forEach(key => {
    if (healthData[key] === null && key !== 'user_id' && key !== 'metric_date' && key !== 'source') {
      delete healthData[key];
    }
  });

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving body comp:', error);
  } else {
    console.log(`✅ Body comp saved for ${metricDate}`);
  }
}

async function processStressDetails(userId, data) {
  const metricDate = data.calendarDate;
  if (!metricDate) return;

  // Extract body battery values if present
  const bodyBatteryValues = data.timeOffsetBodyBatteryValues;
  let latestBodyBattery = null;

  if (bodyBatteryValues && Object.keys(bodyBatteryValues).length > 0) {
    // Get the latest body battery reading
    const sortedOffsets = Object.keys(bodyBatteryValues).map(Number).sort((a, b) => b - a);
    latestBodyBattery = bodyBatteryValues[sortedOffsets[0]];
  }

  console.log(`😰 Processing stress details for ${metricDate}:`, {
    bodyBattery: latestBodyBattery
  });

  if (latestBodyBattery == null) return;

  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    body_battery: latestBodyBattery,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving stress details:', error);
  } else {
    console.log(`✅ Stress details saved for ${metricDate}`);
  }
}

async function processHrvSummary(userId, data) {
  const metricDate = data.calendarDate;
  if (!metricDate) return;

  // HRV is measured in milliseconds
  const hrvMs = data.lastNightAvg || null;

  console.log(`💓 Processing HRV summary for ${metricDate}:`, {
    hrv: hrvMs
  });

  if (hrvMs == null) return;

  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    hrv_ms: hrvMs,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving HRV summary:', error);
  } else {
    console.log(`✅ HRV summary saved for ${metricDate}`);
  }
}
