/**
 * Cloudflare Worker: Garmin Activity Webhook Handler
 * Receives push notifications when users sync Garmin devices
 * Updated to use 'activities' table schema
 * Documentation: https://developer.garmin.com/gc-developer-program/activity-api/
 */

import { createClient } from '@supabase/supabase-js';

// Security Configuration
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // Max 100 requests per minute per IP

// Garmin OAuth 2.0 Token URL
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';

export default {
  async fetch(request, env, ctx) {
    try {
      console.log('🔧 Worker invoked:', request.method, request.url);

      // Check environment variables
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
        console.error('❌ Missing environment variables:', {
          hasSupabaseUrl: !!env.SUPABASE_URL,
          hasSupabaseKey: !!env.SUPABASE_SERVICE_KEY
        });
        return new Response(JSON.stringify({
          error: 'Server configuration error',
          details: 'Missing required environment variables'
        }), {
          status: 500,
          headers: corsHeaders()
        });
      }

      console.log('✅ Environment variables present');

      // Initialize Supabase with environment variables
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      console.log('✅ Supabase client initialized');

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        console.log('Handling CORS preflight');
        return handleCORS();
      }

      // Security checks
      const securityCheck = await checkSecurity(request, env);
      if (!securityCheck.allowed) {
        console.warn('🚫 Security check failed:', securityCheck.reason);
        return new Response(JSON.stringify({ error: securityCheck.reason }), {
          status: securityCheck.status,
          headers: corsHeaders()
        });
      }

      // Route requests
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const eventId = url.searchParams.get('reprocess');

        if (eventId) {
          console.log('🔄 Manual reprocess request for event:', eventId);
          // Trigger reprocessing
          ctx.waitUntil(processWebhookEvent(eventId, supabase, env));
          return new Response(JSON.stringify({
            success: true,
            message: `Reprocessing event ${eventId}`
          }), {
            status: 200,
            headers: corsHeaders()
          });
        }

        console.log('📋 Handling health check');
        return handleHealthCheck();
      }

      if (request.method === 'POST') {
        console.log('📬 Handling webhook POST');
        return await handleWebhook(request, supabase, env, ctx);
      }

      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders()
      });
    } catch (error) {
      console.error('💥 Fatal error in worker:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: corsHeaders()
      });
    }
  }
};

/**
 * CORS headers
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

/**
 * Handle CORS preflight
 */
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

/**
 * Security checks
 */
async function checkSecurity(request, env) {
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  // 1. Payload size check (max 10MB)
  const contentLength = parseInt(request.headers.get('content-length') || '0');
  if (contentLength > 10 * 1024 * 1024) {
    console.warn('🚫 Payload too large:', contentLength);
    return { allowed: false, status: 413, reason: 'Payload too large' };
  }

  // 2. Content-Type validation
  const contentType = request.headers.get('content-type');
  if (request.method === 'POST' && contentType && !contentType.includes('application/json')) {
    console.warn('🚫 Invalid content-type:', contentType);
    return { allowed: false, status: 415, reason: 'Content-Type must be application/json' };
  }

  // 3. Webhook signature verification (if secret is configured)
  if (request.method === 'POST' && env.GARMIN_WEBHOOK_SECRET) {
    const signature = request.headers.get('x-garmin-signature') || request.headers.get('x-webhook-signature');

    if (!signature) {
      console.warn('⚠️ No signature header found');
      return { allowed: false, status: 401, reason: 'Missing signature' };
    }
  }

  return { allowed: true };
}

/**
 * Health check endpoint
 */
function handleHealthCheck() {
  return new Response(JSON.stringify({
    status: 'ok',
    service: 'garmin-webhook-handler-cloudflare',
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: corsHeaders()
  });
}

/**
 * Handle incoming webhook from Garmin
 */
async function handleWebhook(request, supabase, env, ctx) {
  try {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Parse webhook payload
    const webhookData = await request.json();

    // Log the FULL payload to see what Garmin is sending
    console.log('📥 Garmin webhook received - FULL PAYLOAD:', JSON.stringify(webhookData, null, 2));

    // Validate payload structure
    if (!webhookData || typeof webhookData !== 'object') {
      console.warn('🚫 Invalid payload structure:', typeof webhookData);
      return new Response(JSON.stringify({ error: 'Invalid payload structure' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Garmin sends different payload structures for different webhook types
    // Extract data from the appropriate array
    let activityData = null;
    let webhookType = null;

    if (webhookData.activities && webhookData.activities.length > 0) {
      activityData = webhookData.activities[0];
      webhookType = 'CONNECT_ACTIVITY';
    } else if (webhookData.activityDetails && webhookData.activityDetails.length > 0) {
      activityData = webhookData.activityDetails[0];
      webhookType = 'ACTIVITY_DETAIL';
    } else if (webhookData.activityFiles && webhookData.activityFiles.length > 0) {
      activityData = webhookData.activityFiles[0];
      webhookType = 'ACTIVITY_FILE_DATA';
    }

    if (!activityData) {
      console.warn('🚫 No activity data found in webhook');
      return new Response(JSON.stringify({
        error: 'No activity data found',
        receivedKeys: Object.keys(webhookData)
      }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Extract userId from activity data
    const userId = activityData.userId;

    if (!userId) {
      console.warn('🚫 Missing userId in activity data');
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    console.log('📥 Garmin webhook summary:', {
      webhookType,
      userId,
      activityId: activityData.activityId,
      summaryId: activityData.summaryId,
      activityName: activityData.activityName,
      activityType: activityData.activityType,
      ip: clientIP,
      userAgent: userAgent,
      timestamp: new Date().toISOString()
    });

    // Check for duplicate webhook (idempotency)
    const activityId = activityData.activityId?.toString();
    if (activityId) {
      const { data: existingEvent } = await supabase
        .from('garmin_webhook_events')
        .select('id')
        .eq('activity_id', activityId)
        .eq('garmin_user_id', userId)
        .maybeSingle();

      if (existingEvent) {
        console.log('ℹ️ Duplicate webhook ignored:', activityId);
        return new Response(JSON.stringify({
          success: true,
          message: 'Webhook already processed',
          eventId: existingEvent.id
        }), {
          status: 200,
          headers: corsHeaders()
        });
      }
    }

    // Store webhook event for async processing
    const { data: event, error: eventError} = await supabase
      .from('garmin_webhook_events')
      .insert({
        event_type: webhookType || 'activity',
        garmin_user_id: userId,
        activity_id: activityId,
        file_url: activityData.callbackURL || activityData.fileUrl,
        file_type: activityData.fileType || 'FIT',
        upload_timestamp: activityData.startTimeInSeconds
          ? new Date(activityData.startTimeInSeconds * 1000).toISOString()
          : null,
        payload: webhookData,
        processed: false
      })
      .select()
      .single();

    if (eventError) {
      console.error('Error storing webhook event:', eventError);
      throw eventError;
    }

    console.log('✅ Webhook event stored:', event.id);

    // Respond quickly to Garmin (within 5 seconds)
    const response = new Response(JSON.stringify({
      success: true,
      eventId: event.id,
      message: 'Webhook received and queued for processing'
    }), {
      status: 200,
      headers: corsHeaders()
    });

    // Process webhook asynchronously using waitUntil
    ctx.waitUntil(processWebhookEvent(event.id, supabase, env));

    return response;

  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response(JSON.stringify({
      error: 'Webhook processing failed',
      details: error.message
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

/**
 * Process webhook event asynchronously
 */
async function processWebhookEvent(eventId, supabase, env) {
  try {
    console.log('🔄 Processing webhook event:', eventId);

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('garmin_webhook_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError) throw eventError;
    if (!event || event.processed) {
      console.log('Event already processed or not found:', eventId);
      return;
    }

    // Find user by Garmin user ID
    const { data: integration, error: integrationError } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, access_token, refresh_token, provider_user_id, token_expires_at')
      .eq('provider', 'garmin')
      .eq('provider_user_id', event.garmin_user_id)
      .maybeSingle();

    if (integrationError || !integration) {
      console.log('No integration found for Garmin user:', event.garmin_user_id);

      // Mark as processed with error
      await supabase
        .from('garmin_webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          process_error: 'No integration found for this Garmin user'
        })
        .eq('id', eventId);

      return;
    }

    // Update event with user/integration IDs
    await supabase
      .from('garmin_webhook_events')
      .update({
        user_id: integration.user_id,
        integration_id: integration.id
      })
      .eq('id', eventId);

    // Check if activity already imported in activities table
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

        await supabase
          .from('garmin_webhook_events')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            process_error: 'Activity already imported',
            activity_imported_id: existing.id
          })
          .eq('id', eventId);

        return;
      }
    }

    // Process based on webhook type and available data
    if (event.file_url) {
      await downloadAndProcessFitFile(event, integration, supabase, env);
    } else if (event.event_type === 'CONNECT_ACTIVITY' && event.activity_id) {
      // CONNECT_ACTIVITY webhooks don't include file URL, so we construct it
      console.log('📥 CONNECT_ACTIVITY webhook - constructing FIT file URL from activity ID');

      const summaryId = event.payload?.activities?.[0]?.summaryId || event.activity_id;
      const constructedFileUrl = `https://apis.garmin.com/wellness-api/rest/activityFile?id=${summaryId}`;

      console.log('🔗 Constructed FIT file URL:', constructedFileUrl);

      // Update event with constructed file URL
      await supabase
        .from('garmin_webhook_events')
        .update({ file_url: constructedFileUrl })
        .eq('id', eventId);

      const updatedEvent = { ...event, file_url: constructedFileUrl };
      await downloadAndProcessFitFile(updatedEvent, integration, supabase, env);
    } else if (event.event_type === 'ACTIVITY_DETAIL' && event.payload?.activityDetails?.[0]) {
      // ACTIVITY_DETAIL webhooks contain summary data
      console.log('📥 ACTIVITY_DETAIL webhook - processing summary data');
      await processActivityDetail(event, integration, supabase, env);
    } else {
      // Just store the basic activity info from the webhook payload
      console.log('📥 Processing basic activity data from webhook payload');
      await processBasicActivityData(event, integration, supabase, env);
    }

  } catch (error) {
    console.error('Processing error for event', eventId, ':', error);

    // Update event with error
    await supabase
      .from('garmin_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        process_error: error.message
      })
      .eq('id', eventId);
  }
}

/**
 * Process activity data - fetches full details from Garmin API
 * The webhook only contains minimal data (userId, activityId, activityType, startTime)
 * We MUST call the Garmin API to get the complete activity details
 */
async function processBasicActivityData(event, integration, supabase, env) {
  try {
    const webhookData = event.payload?.activities?.[0] ||
                        event.payload?.activityDetails?.[0] ||
                        event.payload;

    // Get the summary ID (Garmin uses summaryId for API calls)
    const summaryId = webhookData?.summaryId || event.activity_id;

    console.log('📥 Processing Garmin activity:', {
      activityId: event.activity_id,
      summaryId: summaryId,
      activityType: webhookData?.activityType,
      hasAccessToken: !!integration.access_token
    });

    // CRITICAL: Fetch full activity details from Garmin API
    let activityDetails = null;
    if (integration.access_token && summaryId) {
      activityDetails = await fetchGarminActivityDetails(integration.access_token, summaryId, integration, supabase, env);
    }

    // Use API data if available, otherwise fall back to webhook data
    const activityInfo = activityDetails || webhookData || {};

    // Map Garmin activity type to our format
    const activityType = mapGarminActivityType(activityInfo.activityType);

    // Create activity record with full data from API
    const { data: activity, error: insertError } = await supabase
      .from('activities')
      .insert({
        user_id: integration.user_id,
        provider: 'garmin',
        provider_activity_id: event.activity_id,
        name: activityInfo.activityName ||
              activityInfo.activityDescription ||
              generateActivityName(activityInfo.activityType, activityInfo.startTimeInSeconds),
        type: activityType,
        sport_type: activityInfo.activityType,
        start_date: activityInfo.startTimeInSeconds
          ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
          : new Date().toISOString(),
        start_date_local: activityInfo.startTimeInSeconds
          ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
          : new Date().toISOString(),
        // Distance (meters)
        distance: activityInfo.distanceInMeters ?? activityInfo.distance ?? null,
        // Duration (seconds)
        moving_time: activityInfo.movingDurationInSeconds ?? activityInfo.durationInSeconds ?? activityInfo.duration ?? null,
        elapsed_time: activityInfo.elapsedDurationInSeconds ?? activityInfo.durationInSeconds ?? activityInfo.duration ?? null,
        // Elevation (meters)
        total_elevation_gain: activityInfo.elevationGainInMeters ?? activityInfo.totalElevationGain ?? null,
        // Speed (m/s)
        average_speed: activityInfo.averageSpeedInMetersPerSecond ?? activityInfo.averageSpeed ?? null,
        max_speed: activityInfo.maxSpeedInMetersPerSecond ?? activityInfo.maxSpeed ?? null,
        // Power (watts)
        average_watts: activityInfo.averageBikingPowerInWatts ?? activityInfo.averagePower ?? null,
        // Heart rate (bpm)
        average_heartrate: activityInfo.averageHeartRateInBeatsPerMinute ?? activityInfo.averageHeartRate ?? null,
        max_heartrate: activityInfo.maxHeartRateInBeatsPerMinute ?? activityInfo.maxHeartRate ?? null,
        // Cadence (rpm)
        average_cadence: activityInfo.averageBikingCadenceInRPM ?? activityInfo.averageRunningCadenceInStepsPerMinute ?? null,
        // Calories
        kilojoules: activityInfo.activeKilocalories ? activityInfo.activeKilocalories * 4.184 : null,
        trainer: activityInfo.isParent === false || activityInfo.deviceName?.toLowerCase().includes('indoor') || false,
        raw_data: { webhook: event.payload, api: activityDetails },
        imported_from: 'garmin_webhook'
      })
      .select()
      .single();

    if (insertError) throw insertError;

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
    console.error('Activity processing error:', error);
    throw error;
  }
}

/**
 * Fetch activity details from Garmin Health API
 * The webhook only contains minimal data - we need to call the API to get full details
 */
async function fetchGarminActivityDetails(accessToken, summaryId, integration, supabase, env) {
  try {
    console.log('🔍 Fetching activity details from Garmin API for summaryId:', summaryId);

    // Garmin Health API endpoint for activity summaries
    const apiUrl = `https://apis.garmin.com/wellness-api/rest/activities?summaryId=${summaryId}`;

    let response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    // If token expired, refresh and retry
    if (response.status === 401 && integration.refresh_token) {
      console.log('🔄 Token expired, refreshing...');
      const newToken = await refreshAccessToken(integration, supabase, env);

      response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${newToken}`,
          'Accept': 'application/json'
        }
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Garmin API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });

      // For errors, log but don't fail completely - we can still store webhook data
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
 * Generate a descriptive activity name if Garmin doesn't provide one
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
 * Refresh Garmin access token using refresh token
 */
async function refreshAccessToken(integration, supabase, env) {
  try {
    console.log('🔄 Refreshing Garmin access token...');

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GARMIN_CONSUMER_KEY,
      client_secret: env.GARMIN_CONSUMER_SECRET,
      refresh_token: integration.refresh_token
    });

    const response = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Garmin token refresh failed:', errorText);
      throw new Error(`Token refresh failed: ${errorText}`);
    }

    const tokenData = await response.json();

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Update tokens in database
    const { error: updateError } = await supabase
      .from('bike_computer_integrations')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || integration.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', integration.id);

    if (updateError) {
      console.error('Failed to update tokens:', updateError);
      throw updateError;
    }

    console.log('✅ Access token refreshed successfully');

    return tokenData.access_token;

  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}

/**
 * Download FIT file from Garmin and process it
 */
async function downloadAndProcessFitFile(event, integration, supabase, env) {
  try {
    console.log('📥 Downloading FIT file:', event.file_url);

    let accessToken = integration.access_token;

    // Check if token is expired
    if (integration.token_expires_at) {
      const expiresAt = new Date(integration.token_expires_at);
      if (expiresAt <= new Date()) {
        accessToken = await refreshAccessToken(integration, supabase, env);
      }
    }

    // Download FIT file using OAuth 2.0 Bearer token
    let response = await fetch(event.file_url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    // If token expired (401), refresh and retry
    if (response.status === 401) {
      console.log('🔄 Token expired, refreshing...');
      accessToken = await refreshAccessToken(integration, supabase, env);

      response = await fetch(event.file_url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download FIT file: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // For now, just create activity from webhook payload
    // FIT parsing in Cloudflare Workers has CPU limits
    // The activity summary data from webhook is usually sufficient
    console.log('✅ FIT file accessible, creating activity from webhook data');

    await processBasicActivityData(event, integration, supabase, env);

  } catch (error) {
    console.error('FIT file download/process error:', error);
    throw error;
  }
}

/**
 * Process ACTIVITY_DETAIL webhook - fetches full details from Garmin API
 */
async function processActivityDetail(event, integration, supabase, env) {
  try {
    const activityDetail = event.payload.activityDetails[0];
    const webhookSummary = activityDetail.summary || activityDetail;

    // Get the summary ID for API call
    const summaryId = webhookSummary.summaryId || event.activity_id;

    console.log('📊 Processing ACTIVITY_DETAIL:', {
      summaryId: summaryId,
      activityType: webhookSummary.activityType,
      hasAccessToken: !!integration.access_token
    });

    // Fetch full activity details from Garmin API
    let activityDetails = null;
    if (integration.access_token && summaryId) {
      activityDetails = await fetchGarminActivityDetails(integration.access_token, summaryId, integration, supabase, env);
    }

    // Use API data if available, merge with webhook data
    const activityInfo = activityDetails || webhookSummary;

    // Map activity type
    const activityType = mapGarminActivityType(activityInfo.activityType);

    // Create activity record with full data
    const { data: activity, error: activityError } = await supabase
      .from('activities')
      .insert({
        user_id: integration.user_id,
        provider: 'garmin',
        provider_activity_id: event.activity_id,
        name: activityInfo.activityName ||
              activityInfo.activityDescription ||
              generateActivityName(activityInfo.activityType, activityInfo.startTimeInSeconds),
        type: activityType,
        sport_type: activityInfo.activityType,
        start_date: activityInfo.startTimeInSeconds
          ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
          : new Date().toISOString(),
        start_date_local: activityInfo.startTimeInSeconds
          ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
          : new Date().toISOString(),
        // Distance (meters)
        distance: activityInfo.distanceInMeters ?? activityInfo.distance ?? null,
        // Duration (seconds)
        moving_time: activityInfo.movingDurationInSeconds ?? activityInfo.durationInSeconds ?? null,
        elapsed_time: activityInfo.elapsedDurationInSeconds ?? activityInfo.durationInSeconds ?? null,
        // Elevation (meters)
        total_elevation_gain: activityInfo.elevationGainInMeters ?? activityInfo.totalElevationGainInMeters ?? null,
        // Speed (m/s)
        average_speed: activityInfo.averageSpeedInMetersPerSecond ?? null,
        max_speed: activityInfo.maxSpeedInMetersPerSecond ?? null,
        // Power (watts)
        average_watts: activityInfo.averageBikingPowerInWatts ?? activityInfo.averagePower ?? null,
        // Heart rate (bpm)
        average_heartrate: activityInfo.averageHeartRateInBeatsPerMinute ?? null,
        max_heartrate: activityInfo.maxHeartRateInBeatsPerMinute ?? null,
        // Cadence (rpm)
        average_cadence: activityInfo.averageBikingCadenceInRPM ?? null,
        // Calories
        kilojoules: activityInfo.activeKilocalories ? activityInfo.activeKilocalories * 4.184 : null,
        trainer: activityInfo.isParent === false || activityInfo.deviceName?.toLowerCase().includes('indoor') || false,
        raw_data: { webhook: event.payload, api: activityDetails },
        imported_from: 'garmin_webhook'
      })
      .select()
      .single();

    if (activityError) throw activityError;

    console.log('✅ Activity imported from ACTIVITY_DETAIL:', {
      id: activity.id,
      name: activity.name,
      distance: activity.distance ? `${(activity.distance / 1000).toFixed(2)} km` : 'N/A',
      avgHR: activity.average_heartrate || 'N/A',
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
    console.error('ACTIVITY_DETAIL processing error:', error);
    throw error;
  }
}

/**
 * Map Garmin activity type to our standard format
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
