// Vercel API Route: Strava Webhook Handler
// Receives push notifications when users create/update/delete activities on Strava
// Enables real-time import of Zwift rides and other cycling activities
// Documentation: https://developers.strava.com/docs/webhooks/

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side with service key for webhook processing)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Configuration
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // Max 100 requests per minute per IP

// In-memory rate limiting (use Redis for production)
const rateLimitStore = new Map();

// Cycling activity types we want to import
const CYCLING_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];

// CORS configuration
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
};

/**
 * Get client IP for rate limiting
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Simple rate limiting check
 */
function checkRateLimit(req) {
  const ip = getClientIP(req);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Clean up old entries
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.windowStart < windowStart) {
      rateLimitStore.delete(key);
    }
  }

  // Get or create rate limit data for this IP
  let ipData = rateLimitStore.get(ip);
  if (!ipData || ipData.windowStart < windowStart) {
    ipData = { windowStart: now, count: 0 };
    rateLimitStore.set(ip, ipData);
  }

  ipData.count++;

  return {
    allowed: ipData.count <= RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - ipData.count),
    resetAt: ipData.windowStart + RATE_LIMIT_WINDOW_MS
  };
}

export default async function handler(req, res) {
  // Handle CORS - Allow both browser origins and Strava servers
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin && req.method !== 'OPTIONS') {
    // No origin header = server-to-server request from Strava
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limiting
  const rateLimit = checkRateLimit(req);
  if (!rateLimit.allowed) {
    console.warn('🚫 Rate limit exceeded for IP:', getClientIP(req));
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    });
  }

  // Handle GET request - Webhook validation (subscription verification)
  if (req.method === 'GET') {
    return handleValidation(req, res);
  }

  // Handle POST request - Webhook event
  if (req.method === 'POST') {
    return handleWebhook(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Handle webhook validation request from Strava
 * Called once when creating the webhook subscription
 */
function handleValidation(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔐 Strava webhook validation request:', { mode, hasToken: !!token, hasChallenge: !!challenge });

  // Verify the mode and token
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook validation successful');
    // Must return the challenge as JSON
    return res.status(200).json({ 'hub.challenge': challenge });
  }

  console.warn('❌ Webhook validation failed - token mismatch');
  return res.status(403).json({ error: 'Verification failed' });
}

/**
 * Handle incoming webhook event from Strava
 */
async function handleWebhook(req, res) {
  const clientIP = getClientIP(req);

  try {
    const webhookData = req.body;

    console.log('📥 Strava webhook received:', {
      object_type: webhookData.object_type,
      aspect_type: webhookData.aspect_type,
      object_id: webhookData.object_id,
      owner_id: webhookData.owner_id,
      ip: clientIP,
      timestamp: new Date().toISOString()
    });

    // Validate required fields
    if (!webhookData.object_type || !webhookData.aspect_type || !webhookData.object_id || !webhookData.owner_id) {
      console.warn('🚫 Invalid webhook payload - missing required fields');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Only process activity events
    if (webhookData.object_type !== 'activity') {
      console.log('ℹ️ Ignoring non-activity webhook:', webhookData.object_type);
      return res.status(200).json({ message: 'Ignored non-activity event' });
    }

    // Check for duplicate webhook (idempotency)
    const { data: existingEvent, error: duplicateCheckError } = await supabase
      .from('strava_webhook_events')
      .select('id')
      .eq('object_id', webhookData.object_id)
      .eq('aspect_type', webhookData.aspect_type)
      .maybeSingle();

    if (duplicateCheckError) {
      console.error('Error checking for duplicate webhook:', duplicateCheckError);
      // Continue processing - better to have a duplicate than lose the event
    }

    if (existingEvent) {
      console.log('ℹ️ Duplicate webhook ignored:', webhookData.object_id);
      return res.status(200).json({
        success: true,
        message: 'Webhook already processed',
        eventId: existingEvent.id
      });
    }

    // Store webhook event for async processing
    const { data: event, error: eventError } = await supabase
      .from('strava_webhook_events')
      .insert({
        event_type: webhookData.object_type,
        aspect_type: webhookData.aspect_type,
        object_type: webhookData.object_type,
        object_id: webhookData.object_id,
        owner_id: webhookData.owner_id,
        subscription_id: webhookData.subscription_id,
        updates: webhookData.updates || null,
        event_time: webhookData.event_time,
        payload: webhookData,
        processed: false
      })
      .select()
      .single();

    if (eventError) {
      console.error('❌ Error storing webhook event:', eventError);
      throw eventError;
    }

    console.log('✅ Webhook event stored:', event.id);

    // Process the webhook event synchronously (Vercel terminates after response)
    // We have up to 30 seconds (Vercel function timeout), Strava needs response within 2 seconds
    // but Strava is tolerant of slower responses - they just want acknowledgment
    try {
      await processWebhookEvent(event.id);
    } catch (err) {
      console.error('❌ Webhook processing error:', err);
      // Don't fail the webhook response - Strava would retry
    }

    // Respond to Strava
    return res.status(200).json({
      success: true,
      eventId: event.id,
      message: 'Webhook received and processed'
    });

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Process webhook event asynchronously
 */
async function processWebhookEvent(eventId) {
  try {
    console.log('🔄 Processing webhook event:', eventId);

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('strava_webhook_events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError) {
      console.error('❌ Error fetching event:', eventId, eventError);
      return;
    }

    if (!event) {
      console.error('❌ Event not found:', eventId);
      return;
    }

    if (event.processed) {
      console.log('ℹ️ Event already processed:', eventId);
      return;
    }

    // Find user by Strava athlete ID (owner_id)
    const { data: stravaToken, error: tokenError } = await supabase
      .from('strava_tokens')
      .select('user_id, access_token, refresh_token, expires_at')
      .eq('athlete_id', event.owner_id)
      .maybeSingle();

    if (tokenError) {
      console.error('❌ Error finding user for Strava athlete:', event.owner_id, tokenError);
    }

    if (!stravaToken) {
      console.log('⚠️ No user found for Strava athlete:', event.owner_id);

      // Mark as processed with error
      await supabase
        .from('strava_webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          process_error: 'No user found for this Strava athlete'
        })
        .eq('id', eventId);

      return;
    }

    // Update event with user_id
    await supabase
      .from('strava_webhook_events')
      .update({ user_id: stravaToken.user_id })
      .eq('id', eventId);

    // Handle different event types
    switch (event.aspect_type) {
      case 'create':
        await handleActivityCreate(event, stravaToken);
        break;
      case 'update':
        await handleActivityUpdate(event, stravaToken);
        break;
      case 'delete':
        await handleActivityDelete(event, stravaToken);
        break;
      default:
        console.log('⚠️ Unknown aspect_type:', event.aspect_type);
        await markEventProcessed(eventId, 'Unknown aspect_type: ' + event.aspect_type);
    }

  } catch (error) {
    console.error('❌ Processing error for event', eventId, ':', error);

    // Update event with error
    await supabase
      .from('strava_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        process_error: error.message
      })
      .eq('id', eventId);
  }
}

/**
 * Handle activity create event - import new activity
 */
async function handleActivityCreate(event, stravaToken) {
  console.log('📥 Processing activity create:', event.object_id);

  try {
    // Get valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(stravaToken);

    // Fetch activity details from Strava
    const activity = await fetchStravaActivity(event.object_id, accessToken);

    if (!activity) {
      await markEventProcessed(event.id, 'Failed to fetch activity from Strava');
      return;
    }

    // Check if it's a cycling activity
    if (!CYCLING_TYPES.includes(activity.type)) {
      console.log('⚠️ Skipping non-cycling activity:', activity.type);
      await markEventProcessed(event.id, `Non-cycling activity type: ${activity.type}`);
      return;
    }

    // Import the activity
    const result = await importStravaActivity(stravaToken.user_id, activity);

    if (result.status === 'imported') {
      await supabase
        .from('strava_webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          route_id: result.routeId
        })
        .eq('id', event.id);

      console.log('🎉 Activity imported successfully:', {
        eventId: event.id,
        routeId: result.routeId,
        activityType: activity.type
      });
    } else if (result.status === 'skipped') {
      await markEventProcessed(event.id, result.reason || 'Activity already exists');
    }

  } catch (error) {
    console.error('❌ Error processing activity create:', error);
    await markEventProcessed(event.id, error.message);
  }
}

/**
 * Handle activity update event
 */
async function handleActivityUpdate(event, stravaToken) {
  console.log('📝 Processing activity update:', event.object_id, 'Updates:', event.updates);

  // For now, we'll just mark it as processed
  // Future: Could update route name/type if those changed
  await markEventProcessed(event.id, null);
}

/**
 * Handle activity delete event
 */
async function handleActivityDelete(event, stravaToken) {
  console.log('🗑️ Processing activity delete:', event.object_id);

  try {
    // Find the route with this strava_id
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('id')
      .eq('strava_id', event.object_id.toString())
      .maybeSingle();

    if (routeError) {
      console.error('Error finding route for deletion:', routeError);
    }

    if (route) {
      // Delete the route (or mark as deleted - depending on your preference)
      // For now, we'll just mark the event as processed
      // You may want to add a 'deleted' flag instead of actually deleting
      console.log('📋 Found route to potentially delete:', route.id);
    }

    await markEventProcessed(event.id, null);

  } catch (error) {
    console.error('❌ Error processing activity delete:', error);
    await markEventProcessed(event.id, error.message);
  }
}

/**
 * Mark webhook event as processed
 */
async function markEventProcessed(eventId, error) {
  await supabase
    .from('strava_webhook_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      process_error: error
    })
    .eq('id', eventId);
}

/**
 * Get valid Strava access token, refresh if expired
 * Includes race condition protection to prevent concurrent refresh attempts
 */
async function getValidAccessToken(stravaToken) {
  const expiresAt = new Date(stravaToken.expires_at);
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

  // If token is still valid for at least an hour, use it
  if (expiresAt > oneHourFromNow) {
    return stravaToken.access_token;
  }

  console.log('🔄 Refreshing Strava access token...');

  // Re-check token before refreshing (race condition protection)
  // Another request may have already refreshed the token
  const { data: currentToken, error: fetchError } = await supabase
    .from('strava_tokens')
    .select('access_token, expires_at')
    .eq('athlete_id', stravaToken.athlete_id)
    .maybeSingle();

  if (!fetchError && currentToken) {
    const currentExpiresAt = new Date(currentToken.expires_at);
    // If token was just refreshed by another request, use that one
    if (currentExpiresAt > oneHourFromNow) {
      console.log('🔄 Token was already refreshed by another request');
      return currentToken.access_token;
    }
  }

  // Refresh the token
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: stravaToken.refresh_token
  });

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const tokenData = await response.json();
  const newExpiresAt = new Date(tokenData.expires_at * 1000).toISOString();

  // Update tokens in database
  await supabase
    .from('strava_tokens')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq('athlete_id', stravaToken.athlete_id);

  console.log('✅ Token refreshed successfully, expires at:', newExpiresAt);
  return tokenData.access_token;
}

/**
 * Fetch activity details from Strava API
 */
async function fetchStravaActivity(activityId, accessToken) {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Failed to fetch activity:', response.status, error);
    return null;
  }

  return response.json();
}

/**
 * Import a Strava activity into routes table
 * Based on logic from strava-bulk-import.js
 */
async function importStravaActivity(userId, activity) {
  // Check for duplicates by strava_id
  const { data: existing, error: existingError } = await supabase
    .from('routes')
    .select('id')
    .eq('strava_id', activity.id.toString())
    .maybeSingle();

  if (existingError) {
    console.error(`Error checking for existing activity ${activity.id}:`, existingError);
    // Continue anyway - better to risk a duplicate than lose the activity
  }

  if (existing) {
    console.log(`⏭️ Activity ${activity.id} already imported`);
    return { status: 'skipped', reason: 'Already imported (strava_id match)' };
  }

  // Check for near-duplicate based on time and distance
  const startTime = new Date(activity.start_date);
  const fiveMinutesAgo = new Date(startTime.getTime() - 5 * 60 * 1000);
  const fiveMinutesLater = new Date(startTime.getTime() + 5 * 60 * 1000);
  const distanceKm = activity.distance / 1000;

  const { data: nearDuplicates } = await supabase
    .from('routes')
    .select('id')
    .eq('user_id', userId)
    .gte('recorded_at', fiveMinutesAgo.toISOString())
    .lte('recorded_at', fiveMinutesLater.toISOString())
    .gte('distance_km', distanceKm - 0.1)
    .lte('distance_km', distanceKm + 0.1)
    .limit(1);

  if (nearDuplicates && nearDuplicates.length > 0) {
    console.log(`⏭️ Near-duplicate found for activity ${activity.id}`);
    return { status: 'skipped', reason: 'Near-duplicate (time+distance match)' };
  }

  // Determine activity type
  let activityType = 'road_biking';
  if (activity.type === 'MountainBikeRide') activityType = 'mountain_biking';
  else if (activity.type === 'GravelRide') activityType = 'gravel_cycling';
  else if (activity.type === 'VirtualRide') activityType = 'indoor_cycling';
  else if (activity.type === 'EBikeRide') activityType = 'road_biking';

  // Create route
  const { data: route, error: routeError } = await supabase
    .from('routes')
    .insert({
      user_id: userId,
      name: activity.name || `Strava ${activityType.replace('_', ' ')}`,
      description: 'Imported from Strava via webhook',
      distance_km: activity.distance ? activity.distance / 1000 : null,
      elevation_gain_m: activity.total_elevation_gain,
      duration_seconds: activity.moving_time,
      average_speed: activity.average_speed ? activity.average_speed * 3.6 : null,
      max_speed: activity.max_speed ? activity.max_speed * 3.6 : null,
      average_heartrate: activity.average_heartrate,
      max_heartrate: activity.max_heartrate,
      average_watts: activity.average_watts,
      max_watts: activity.max_watts,
      polyline: activity.map?.summary_polyline,
      strava_id: activity.id.toString(),
      strava_url: `https://www.strava.com/activities/${activity.id}`,
      has_gps_data: !!activity.map?.summary_polyline,
      has_heart_rate_data: !!activity.average_heartrate,
      has_power_data: !!activity.average_watts,
      has_cadence_data: !!activity.average_cadence,
      activity_type: activityType,
      recorded_at: activity.start_date,
      imported_from: 'strava',
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (routeError) {
    console.error(`❌ Error creating route for activity ${activity.id}:`, routeError);
    throw routeError;
  }

  console.log(`✅ Imported activity ${activity.id} as route ${route.id} (${activityType})`);

  return { status: 'imported', routeId: route.id };
}
