/**
 * Cloudflare Worker: Garmin Activity Webhook Handler
 * Receives push notifications when users sync Garmin devices
 * Documentation: https://developer.garmin.com/gc-developer-program/activity-api/
 */

import { createClient } from '@supabase/supabase-js';
import FitParser from 'fit-file-parser';

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

  // 1. Rate limiting (using Cloudflare's built-in rate limiting via KV would be better for production)
  // For now, we'll rely on Cloudflare's DDoS protection

  // 2. Payload size check (max 10MB)
  const contentLength = parseInt(request.headers.get('content-length') || '0');
  if (contentLength > 10 * 1024 * 1024) {
    console.warn('🚫 Payload too large:', contentLength);
    return { allowed: false, status: 413, reason: 'Payload too large' };
  }

  // 3. Content-Type validation
  const contentType = request.headers.get('content-type');
  if (request.method === 'POST' && contentType && !contentType.includes('application/json')) {
    console.warn('🚫 Invalid content-type:', contentType);
    return { allowed: false, status: 415, reason: 'Content-Type must be application/json' };
  }

  // 4. Webhook signature verification (if secret is configured)
  if (request.method === 'POST' && env.GARMIN_WEBHOOK_SECRET) {
    const signature = request.headers.get('x-garmin-signature') || request.headers.get('x-webhook-signature');

    if (!signature) {
      console.warn('⚠️ No signature header found');
      return { allowed: false, status: 401, reason: 'Missing signature' };
    }

    // We'll verify signature in handleWebhook after reading body
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
        .single();

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
    // This allows the worker to continue processing after responding to Garmin
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
      .select('id, user_id, access_token, refresh_token, provider_user_id')
      .eq('provider', 'garmin')
      .eq('provider_user_id', event.garmin_user_id)
      .single();

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

    // Check if activity already imported
    if (event.activity_id) {
      const { data: existing } = await supabase
        .from('routes')
        .select('id')
        .eq('external_id', event.activity_id)
        .eq('user_id', integration.user_id)
        .single();

      if (existing) {
        console.log('Activity already imported:', event.activity_id);

        await supabase
          .from('garmin_webhook_events')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            process_error: 'Activity already imported',
            route_id: existing.id
          })
          .eq('id', eventId);

        return;
      }
    }

    // Download and process FIT file
    if (event.file_url) {
      await downloadAndProcessFitFile(event, integration, supabase, env);
    } else if (event.event_type === 'CONNECT_ACTIVITY' && event.activity_id) {
      // CONNECT_ACTIVITY webhooks don't include file URL, so we construct it
      // Garmin Activity API endpoint for downloading FIT files
      console.log('📥 CONNECT_ACTIVITY webhook - constructing FIT file URL from activity ID');

      // Get summaryId from webhook payload
      const summaryId = event.payload?.activities?.[0]?.summaryId || event.activity_id;
      const constructedFileUrl = `https://apis.garmin.com/wellness-api/rest/activityFile?id=${summaryId}`;

      console.log('🔗 Constructed FIT file URL:', constructedFileUrl);

      // Update event with constructed file URL
      await supabase
        .from('garmin_webhook_events')
        .update({ file_url: constructedFileUrl })
        .eq('id', eventId);

      // Create updated event object
      const updatedEvent = { ...event, file_url: constructedFileUrl };

      await downloadAndProcessFitFile(updatedEvent, integration, supabase, env);
    } else if (event.event_type === 'ACTIVITY_DETAIL' && event.payload?.activityDetails?.[0]?.samples) {
      // ACTIVITY_DETAIL webhooks contain GPS data in the samples array
      console.log('📥 ACTIVITY_DETAIL webhook - extracting GPS from samples array');
      await processActivityDetail(event, integration, supabase);
    } else {
      console.log('No file URL in webhook event and cannot construct one');

      await supabase
        .from('garmin_webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          process_error: 'No file URL provided in webhook and cannot construct one'
        })
        .eq('id', eventId);
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

      try {
        accessToken = await refreshAccessToken(integration, supabase, env);

        // Retry download with new token
        response = await fetch(event.file_url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
      } catch (refreshError) {
        throw new Error(`Token refresh failed: ${refreshError.message}`);
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to download FIT file: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    console.log('✅ FIT file downloaded, size:', buffer.length, 'bytes');

    // Parse FIT file
    const fitParser = new FitParser({
      force: true,
      speedUnit: 'km/h',
      lengthUnit: 'km',
      mode: 'cascade'
    });

    const fitData = await new Promise((resolve, reject) => {
      fitParser.parse(buffer, (error, data) => {
        if (error) reject(error);
        else resolve(data);
      });
    });

    console.log('✅ FIT file parsed successfully');
    console.log('🔍 FIT data top-level keys:', Object.keys(fitData));

    // Process activity data
    await processActivityData(event, integration, fitData, supabase);

  } catch (error) {
    console.error('FIT file download/parse error:', error);
    throw error;
  }
}

/**
 * Process ACTIVITY_DETAIL webhook which contains GPS data in samples array
 */
async function processActivityDetail(event, integration, supabase) {
  try {
    const activityDetail = event.payload.activityDetails[0];
    const summary = activityDetail.summary;
    const samples = activityDetail.samples || [];

    console.log('📊 Processing ACTIVITY_DETAIL:', {
      activityType: summary.activityType,
      distance: summary.distanceInMeters,
      duration: summary.durationInSeconds,
      samples: samples.length
    });

    // Check if cycling activity
    const activityType = summary.activityType?.toLowerCase() || '';
    const isCycling = activityType.includes('cycling') || activityType.includes('biking');

    if (!isCycling) {
      console.log('Skipping non-cycling activity:', summary.activityType);
      await supabase
        .from('garmin_webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          process_error: `Non-cycling activity: ${summary.activityType}`
        })
        .eq('id', event.id);
      return;
    }

    // Extract GPS points from samples
    const gpsPoints = samples.filter(s => s.latitudeInDegree && s.longitudeInDegree);

    console.log('📍 GPS data from samples:', {
      totalSamples: samples.length,
      gpsPointsFound: gpsPoints.length
    });

    // Create route
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .insert({
        user_id: integration.user_id,
        name: `Garmin ${summary.activityName || 'Cycling'} - ${new Date().toLocaleDateString()}`,
        description: `Imported from Garmin Connect`,
        imported_from: 'file_upload',
        distance_km: summary.distanceInMeters ? summary.distanceInMeters / 1000 : null,
        elevation_gain_m: summary.totalElevationGainInMeters,
        elevation_loss_m: summary.totalElevationLossInMeters,
        duration_seconds: summary.durationInSeconds,
        average_speed: summary.averageSpeedInMetersPerSecond,
        max_speed: summary.maxSpeedInMetersPerSecond,
        average_heartrate: summary.averageHeartRateInBeatsPerMinute,
        max_heartrate: summary.maxHeartRateInBeatsPerMinute,
        kilojoules: summary.activeKilocalories,
        has_gps_data: gpsPoints.length > 0,
        has_heart_rate_data: samples.some(s => s.heartRate),
        has_cadence_data: false,
        has_power_data: false,
        activity_type: 'road_biking',
        external_id: event.activity_id,
        strava_url: event.activity_id ? `https://connect.garmin.com/modern/activity/${event.activity_id}` : null,
        recorded_at: summary.startTimeInSeconds ? new Date(summary.startTimeInSeconds * 1000).toISOString() : new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (routeError) throw routeError;

    console.log('✅ Route created from ACTIVITY_DETAIL:', route.id);

    // Store track points from samples
    if (gpsPoints.length > 0) {
      const startTime = summary.startTimeInSeconds;
      const trackPoints = gpsPoints.map((sample, index) => ({
        route_id: route.id,
        time_seconds: sample.startTimeInSeconds - startTime,
        latitude: sample.latitudeInDegree,
        longitude: sample.longitudeInDegree,
        elevation: sample.elevationInMeters,
        heartrate: sample.heartRate,
        speed: sample.speedMetersPerSecond,
        temperature: sample.airTemperatureCelcius,
        distance_m: sample.totalDistanceInMeters,
        point_index: index
      }));

      // Insert in batches of 1000
      for (let i = 0; i < trackPoints.length; i += 1000) {
        const batch = trackPoints.slice(i, i + 1000);
        await supabase.from('track_points').insert(batch);
      }

      console.log('✅ Track points stored from ACTIVITY_DETAIL:', trackPoints.length);
    }

    // Mark webhook as processed
    await supabase
      .from('garmin_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        route_id: route.id
      })
      .eq('id', event.id);

    console.log('🎉 Activity imported successfully from ACTIVITY_DETAIL:', route.id);

  } catch (error) {
    console.error('ACTIVITY_DETAIL processing error:', error);
    throw error;
  }
}

/**
 * Process parsed FIT data and store in database
 */
async function processActivityData(event, integration, fitData, supabase) {
  try {
    const activity = fitData.activity;
    const session = activity.sessions?.[0];
    const records = activity.records || [];

    // Debug: Log the full FIT data structure to see where GPS data is
    console.log('🔍 FIT data structure:', {
      hasActivity: !!activity,
      hasSession: !!session,
      recordsLength: records.length,
      activityKeys: activity ? Object.keys(activity) : [],
      sessionKeys: session ? Object.keys(session) : [],
      sampleRecordKeys: records[0] ? Object.keys(records[0]) : []
    });

    if (!session) {
      throw new Error('No session data in FIT file');
    }

    console.log('📊 Processing activity:', {
      sport: session.sport,
      distance: session.total_distance,
      duration: session.total_elapsed_time,
      points: records.length
    });

    // Check if cycling activity with expanded detection for indoor rides
    const sport = session.sport?.toLowerCase() || '';
    const subSport = session.sub_sport?.toLowerCase() || '';

    // Comprehensive cycling detection including indoor/virtual variants
    // Prioritize sub_sport checks to catch Zwift rides that may have sport='generic'
    const isCycling =
      // Explicit cycling sport
      sport.includes('cycling') || sport.includes('biking') || sport.includes('bike') ||
      // OR explicit cycling sub-sport
      subSport.includes('cycling') ||
      // OR virtual/indoor activities (even with generic sport) - KEY FOR ZWIFT
      subSport.includes('virtual') || subSport.includes('indoor') ||
      subSport === 'virtual_activity' ||
      // OR generic/training sport with cycling-like sub_sport
      ((sport === 'generic' || sport === 'training') &&
       (subSport.includes('cycling') || subSport.includes('bike') ||
        subSport.includes('virtual') || subSport.includes('indoor')));

    if (!isCycling) {
      console.log('⚠️ Skipping non-cycling activity:', {
        activityId: event.activity_id,
        sport: session.sport,
        subSport: session.sub_sport
      });

      await supabase
        .from('garmin_webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          process_error: `Non-cycling activity. Sport: ${session.sport}, SubSport: ${session.sub_sport}`
        })
        .eq('id', event.id);

      return;
    }

    // Determine activity type with better indoor/virtual detection
    let activityType = 'road_biking';

    // Check indoor/virtual first (most specific)
    if (sport.includes('indoor') || subSport.includes('indoor') ||
        sport.includes('virtual') || subSport.includes('virtual') ||
        subSport === 'indoor_cycling' || subSport === 'virtual_ride') {
      activityType = 'indoor_cycling';
    }
    // Then check terrain types
    else if (sport.includes('mountain') || subSport.includes('mountain')) {
      activityType = 'mountain_biking';
    }
    else if (sport.includes('gravel') || subSport.includes('gravel')) {
      activityType = 'gravel_cycling';
    }

    // Get GPS data points
    const gpsPoints = records.filter(r => r.position_lat && r.position_long);

    console.log('📍 GPS data check:', {
      totalRecords: records.length,
      gpsPointsFound: gpsPoints.length,
      sampleRecord: records[0] ? {
        hasPositionLat: !!records[0].position_lat,
        hasPositionLong: !!records[0].position_long,
        lat: records[0].position_lat,
        lng: records[0].position_long,
        allKeys: Object.keys(records[0])
      } : 'No records'
    });

    // Create route - using correct schema column names
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .insert({
        user_id: integration.user_id,
        name: `Garmin ${activityType.replace('_', ' ')} - ${new Date().toLocaleDateString()}`,
        description: `Imported from Garmin Connect`,
        imported_from: 'file_upload',
        distance_km: session.total_distance ? session.total_distance / 1000 : null,
        elevation_gain_m: session.total_ascent,
        elevation_loss_m: session.total_descent,
        duration_seconds: session.total_elapsed_time,
        average_speed: session.avg_speed,
        max_speed: session.max_speed,
        average_heartrate: session.avg_heart_rate,
        max_heartrate: session.max_heart_rate,
        average_watts: session.avg_power,
        max_watts: session.max_power,
        kilojoules: session.total_calories,
        has_gps_data: gpsPoints.length > 0,
        has_heart_rate_data: records.some(r => r.heart_rate),
        has_power_data: records.some(r => r.power),
        has_cadence_data: records.some(r => r.cadence),
        activity_type: activityType,
        external_id: event.activity_id,
        strava_url: event.activity_id ? `https://connect.garmin.com/modern/activity/${event.activity_id}` : null,
        recorded_at: session.start_time || new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (routeError) throw routeError;

    console.log('✅ Route created:', route.id);

    // Store track points (GPS data) - using correct schema column names
    if (gpsPoints.length > 0) {
      const trackPoints = gpsPoints.map((r, index) => ({
        route_id: route.id,
        time_seconds: r.timestamp ? (new Date(r.timestamp).getTime() - new Date(session.start_time).getTime()) / 1000 : index,
        latitude: r.position_lat,
        longitude: r.position_long,
        elevation: r.altitude,
        heartrate: r.heart_rate,
        power_watts: r.power,
        cadence: r.cadence,
        speed: r.speed,
        temperature: r.temperature,
        distance_m: r.distance,
        point_index: index
      }));

      // Insert in batches of 1000
      for (let i = 0; i < trackPoints.length; i += 1000) {
        const batch = trackPoints.slice(i, i + 1000);
        await supabase.from('track_points').insert(batch);
      }

      console.log('✅ Track points stored:', trackPoints.length);
    }

    // Record sync history
    await supabase
      .from('bike_computer_sync_history')
      .insert({
        integration_id: integration.id,
        user_id: integration.user_id,
        provider: 'garmin',
        activity_id: event.activity_id,
        route_id: route.id,
        synced_at: new Date().toISOString(),
        sync_status: 'success',
        activity_data: session
      });

    // Mark webhook as processed
    await supabase
      .from('garmin_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        route_id: route.id
      })
      .eq('id', event.id);

    console.log('🎉 Activity imported successfully:', route.id);

  } catch (error) {
    console.error('Activity processing error:', error);
    throw error;
  }
}

/**
 * Encode GPS points to polyline
 */
function encodePolyline(points) {
  if (!points || points.length === 0) return null;

  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.position_lat * 1e5);
    const lng = Math.round(point.position_long * 1e5);

    encoded += encodeNumber(lat - prevLat);
    encoded += encodeNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeNumber(num) {
  let encoded = '';
  let value = num < 0 ? ~(num << 1) : num << 1;

  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }

  encoded += String.fromCharCode(value + 63);
  return encoded;
}
