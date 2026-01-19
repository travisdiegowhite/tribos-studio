// Vercel API Route: Strava Webhook Handler
// Receives push notifications when users create/update/delete activities on Strava
// Enables real-time import of cycling activities (including Zwift rides)
// Documentation: https://developers.strava.com/docs/webhooks/
//
// IMPORTANT: This handler processes synchronously before responding
// to ensure activities are saved (Vercel terminates after response)

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';
import { checkForDuplicate, takeoverActivity, mergeActivityData } from './utils/activityDedup.js';
import { updateSnapshotForActivity } from './utils/fitnessSnapshots.js';

// Initialize Supabase (server-side with service key for webhook processing)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Configuration
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;

// Rate limiting
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const rateLimitStore = new Map();

// Cycling activity types we want to import
const CYCLING_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];

// Track last webhook for diagnostics
let lastWebhookReceived = null;

export default async function handler(req, res) {
  // Handle CORS - Allow Strava servers (no origin header) and browser origins
  if (setupCors(req, res, { allowedMethods: ['POST', 'GET', 'OPTIONS'] })) {
    return;
  }

  // Health check endpoint
  if (req.method === 'GET' && !req.query['hub.mode']) {
    return res.status(200).json({
      status: 'ok',
      service: 'strava-webhook-handler',
      timestamp: new Date().toISOString(),
      lastWebhookReceived,
      verifyTokenConfigured: !!VERIFY_TOKEN,
      note: 'Webhook endpoint is active and ready to receive Strava notifications'
    });
  }

  // Handle GET request - Webhook validation (subscription verification)
  if (req.method === 'GET') {
    return handleValidation(req, res);
  }

  // Rate limiting for POST requests
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

  console.log('🔐 Strava webhook validation request:', {
    mode,
    hasToken: !!token,
    hasChallenge: !!challenge,
    tokenMatch: token === VERIFY_TOKEN
  });

  // Verify the mode and token
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook validation successful');
    // Must return the challenge as JSON
    return res.status(200).json({ 'hub.challenge': challenge });
  }

  console.warn('❌ Webhook validation failed - token mismatch or missing');
  return res.status(403).json({ error: 'Verification failed' });
}

/**
 * Handle incoming webhook event from Strava
 */
async function handleWebhook(req, res) {
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';

  try {
    lastWebhookReceived = new Date().toISOString();
    const webhookData = req.body;

    console.log('📥 Strava webhook received:', {
      object_type: webhookData.object_type,
      aspect_type: webhookData.aspect_type,
      object_id: webhookData.object_id,
      owner_id: webhookData.owner_id,
      ip: clientIP,
      timestamp: lastWebhookReceived
    });

    // Validate required fields
    if (!webhookData.object_type || !webhookData.aspect_type ||
        !webhookData.object_id || !webhookData.owner_id) {
      console.warn('🚫 Invalid webhook payload - missing required fields');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Only process activity events
    if (webhookData.object_type !== 'activity') {
      console.log('ℹ️ Ignoring non-activity webhook:', webhookData.object_type);
      return res.status(200).json({ message: 'Ignored non-activity event' });
    }

    // Check for duplicate webhook (idempotency)
    const { data: existingEvent } = await supabase
      .from('strava_webhook_events')
      .select('id')
      .eq('object_id', webhookData.object_id)
      .eq('aspect_type', webhookData.aspect_type)
      .maybeSingle();

    if (existingEvent) {
      console.log('ℹ️ Duplicate webhook ignored:', webhookData.object_id);
      return res.status(200).json({
        success: true,
        message: 'Webhook already processed',
        eventId: existingEvent.id
      });
    }

    // Store webhook event for tracking
    const { data: event, error: eventError } = await supabase
      .from('strava_webhook_events')
      .insert({
        event_type: webhookData.object_type,
        aspect_type: webhookData.aspect_type,
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
      // Continue processing even if storage fails
    }

    console.log('✅ Webhook event stored:', event?.id);

    // Process the webhook event SYNCHRONOUSLY before responding
    // Vercel terminates the function after response is sent
    try {
      await processWebhookEvent(event?.id, webhookData);
      console.log('✅ Webhook processed successfully');
    } catch (err) {
      console.error('❌ Webhook processing error:', err);
      // Update event with error
      if (event?.id) {
        await markEventProcessed(event.id, err.message);
      }
    }

    // Respond to Strava
    return res.status(200).json({
      success: true,
      eventId: event?.id,
      message: 'Webhook received and processed'
    });

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    // Still return 200 to prevent Strava from disabling the webhook
    return res.status(200).json({
      success: false,
      error: 'Webhook processing failed',
      message: 'Event acknowledged but processing failed'
    });
  }
}

/**
 * Process webhook event
 */
async function processWebhookEvent(eventId, webhookData) {
  console.log('🔄 Processing webhook event:', eventId);

  // Find user by Strava athlete ID (owner_id) in bike_computer_integrations
  const { data: integration, error: integrationError } = await supabase
    .from('bike_computer_integrations')
    .select('id, user_id, access_token, refresh_token, token_expires_at, provider_user_id')
    .eq('provider', 'strava')
    .eq('provider_user_id', webhookData.owner_id.toString())
    .maybeSingle();

  if (integrationError) {
    console.error('❌ Error finding integration:', integrationError);
  }

  if (!integration) {
    console.log('⚠️ No integration found for Strava athlete:', webhookData.owner_id);
    if (eventId) {
      await markEventProcessed(eventId, `No integration found for Strava athlete ID: ${webhookData.owner_id}`);
    }
    return;
  }

  // Update event with user info
  if (eventId) {
    await supabase
      .from('strava_webhook_events')
      .update({ user_id: integration.user_id })
      .eq('id', eventId);
  }

  // Handle different event types
  switch (webhookData.aspect_type) {
    case 'create':
      await handleActivityCreate(eventId, webhookData, integration);
      break;
    case 'update':
      await handleActivityUpdate(eventId, webhookData, integration);
      break;
    case 'delete':
      await handleActivityDelete(eventId, webhookData, integration);
      break;
    default:
      console.log('⚠️ Unknown aspect_type:', webhookData.aspect_type);
      if (eventId) {
        await markEventProcessed(eventId, 'Unknown aspect_type: ' + webhookData.aspect_type);
      }
  }
}

/**
 * Handle activity create event - import new activity
 */
async function handleActivityCreate(eventId, webhookData, integration) {
  console.log('📥 Processing activity create:', webhookData.object_id);

  try {
    // Get valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(integration);

    // Fetch activity details from Strava
    const activity = await fetchStravaActivity(webhookData.object_id, accessToken);

    if (!activity) {
      await markEventProcessed(eventId, 'Failed to fetch activity from Strava');
      return;
    }

    // Check if it's a cycling activity
    if (!CYCLING_TYPES.includes(activity.type)) {
      console.log('⚠️ Skipping non-cycling activity:', activity.type);
      await markEventProcessed(eventId, `Non-cycling activity type: ${activity.type}`);
      return;
    }

    // Check for existing activity (duplicate prevention)
    const { data: existing } = await supabase
      .from('activities')
      .select('id')
      .eq('provider', 'strava')
      .eq('provider_activity_id', activity.id.toString())
      .eq('user_id', integration.user_id)
      .maybeSingle();

    if (existing) {
      console.log('⏭️ Activity already imported:', activity.id);
      await markEventProcessed(eventId, 'Activity already exists', existing.id);
      return;
    }

    // Cross-provider duplicate check (e.g., Garmin synced to Strava)
    const dupCheck = await checkForDuplicate(
      integration.user_id,
      activity.start_date,
      activity.distance,
      'strava',
      activity.id.toString()
    );

    if (dupCheck.isDuplicate) {
      if (dupCheck.shouldTakeover) {
        // Strava has higher priority than existing (e.g., manual upload)
        // Take over the activity - Strava becomes the source of truth
        console.log('🔄 Cross-provider duplicate: Strava taking over from', dupCheck.existingActivity.provider);

        const activityData = buildActivityData(integration.user_id, activity);
        const result = await takeoverActivity(
          dupCheck.existingActivity.id,
          activityData,
          'strava',
          activity.id.toString()
        );

        if (result.success) {
          // Update fitness snapshot
          try {
            await updateSnapshotForActivity(supabase, integration.user_id, activity.start_date);
          } catch (snapshotError) {
            console.error('⚠️ Snapshot update failed (non-critical):', snapshotError.message);
          }
          await markEventProcessed(eventId, `Strava took over from ${dupCheck.existingActivity.provider}`, dupCheck.existingActivity.id);
        } else {
          await markEventProcessed(eventId, `Takeover failed: ${result.error}`, dupCheck.existingActivity.id);
        }
        return;
      } else {
        // Strava has lower/equal priority (e.g., Garmin activity already exists)
        // Just merge any additional data from Strava
        console.log('🔄 Cross-provider duplicate: merging Strava data into existing', dupCheck.existingActivity.provider, 'activity');
        const stravaData = {
          map_summary_polyline: activity.map?.summary_polyline || null,
          average_watts: activity.average_watts || null,
          average_heartrate: activity.average_heartrate || null,
          max_heartrate: activity.max_heartrate || null,
          average_cadence: activity.average_cadence || null,
          kilojoules: activity.kilojoules || null,
          raw_data: activity
        };
        await mergeActivityData(dupCheck.existingActivity.id, stravaData, 'strava');
        await markEventProcessed(eventId, dupCheck.reason, dupCheck.existingActivity.id);
        return;
      }
    }

    // Import the activity
    const activityData = buildActivityData(integration.user_id, activity);

    const { data: savedActivity, error: insertError } = await supabase
      .from('activities')
      .insert(activityData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error saving activity:', insertError);
      await markEventProcessed(eventId, insertError.message);
      return;
    }

    console.log('✅ Activity imported:', {
      id: savedActivity.id,
      name: savedActivity.name,
      type: savedActivity.type,
      distance: savedActivity.distance ? `${(savedActivity.distance / 1000).toFixed(2)} km` : 'N/A',
      hasGPS: !!savedActivity.map_summary_polyline
    });

    // Update fitness snapshot for the week of this activity
    try {
      await updateSnapshotForActivity(supabase, integration.user_id, savedActivity.start_date);
      console.log('📊 Fitness snapshot updated for activity');
    } catch (snapshotError) {
      // Don't fail the webhook for snapshot errors
      console.error('⚠️ Snapshot update failed (non-critical):', snapshotError.message);
    }

    // Update webhook event
    await supabase
      .from('strava_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        activity_id: savedActivity.id
      })
      .eq('id', eventId);

    // Update integration last sync
    await supabase
      .from('bike_computer_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: null
      })
      .eq('id', integration.id);

  } catch (error) {
    console.error('❌ Error processing activity create:', error);
    await markEventProcessed(eventId, error.message);
  }
}

/**
 * Handle activity update event
 */
async function handleActivityUpdate(eventId, webhookData, integration) {
  console.log('📝 Processing activity update:', webhookData.object_id, 'Updates:', webhookData.updates);

  try {
    // Find the existing activity
    const { data: existingActivity } = await supabase
      .from('activities')
      .select('id')
      .eq('provider', 'strava')
      .eq('provider_activity_id', webhookData.object_id.toString())
      .eq('user_id', integration.user_id)
      .maybeSingle();

    if (!existingActivity) {
      // Activity doesn't exist yet - treat as create
      console.log('📥 Activity not found, treating as create');
      return await handleActivityCreate(eventId, webhookData, integration);
    }

    // Fetch updated activity from Strava
    const accessToken = await getValidAccessToken(integration);
    const activity = await fetchStravaActivity(webhookData.object_id, accessToken);

    if (!activity) {
      await markEventProcessed(eventId, 'Failed to fetch updated activity');
      return;
    }

    // Update the activity
    const updateData = {
      name: activity.name,
      type: activity.type,
      sport_type: activity.sport_type || activity.type,
      distance: activity.distance,
      moving_time: activity.moving_time,
      elapsed_time: activity.elapsed_time,
      total_elevation_gain: activity.total_elevation_gain,
      average_speed: activity.average_speed,
      max_speed: activity.max_speed,
      average_watts: activity.average_watts || null,
      average_heartrate: activity.average_heartrate || null,
      max_heartrate: activity.max_heartrate || null,
      map_summary_polyline: activity.map?.summary_polyline || null,
      raw_data: activity,
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('activities')
      .update(updateData)
      .eq('id', existingActivity.id);

    console.log('✅ Activity updated:', existingActivity.id);
    await markEventProcessed(eventId, null, existingActivity.id);

  } catch (error) {
    console.error('❌ Error processing activity update:', error);
    await markEventProcessed(eventId, error.message);
  }
}

/**
 * Handle activity delete event
 */
async function handleActivityDelete(eventId, webhookData, integration) {
  console.log('🗑️ Processing activity delete:', webhookData.object_id);

  try {
    // Find and delete the activity
    const { data: existingActivity } = await supabase
      .from('activities')
      .select('id')
      .eq('provider', 'strava')
      .eq('provider_activity_id', webhookData.object_id.toString())
      .eq('user_id', integration.user_id)
      .maybeSingle();

    if (existingActivity) {
      await supabase
        .from('activities')
        .delete()
        .eq('id', existingActivity.id);

      console.log('✅ Activity deleted:', existingActivity.id);
    } else {
      console.log('ℹ️ Activity not found for deletion');
    }

    await markEventProcessed(eventId, null);

  } catch (error) {
    console.error('❌ Error processing activity delete:', error);
    await markEventProcessed(eventId, error.message);
  }
}

/**
 * Build activity data for insertion
 */
function buildActivityData(userId, activity) {
  return {
    user_id: userId,
    provider: 'strava',
    provider_activity_id: activity.id.toString(),
    name: activity.name,
    type: activity.type,
    sport_type: activity.sport_type || activity.type,
    start_date: activity.start_date,
    start_date_local: activity.start_date_local,
    distance: activity.distance, // meters
    moving_time: activity.moving_time, // seconds
    elapsed_time: activity.elapsed_time, // seconds
    total_elevation_gain: activity.total_elevation_gain, // meters
    average_speed: activity.average_speed, // m/s
    max_speed: activity.max_speed, // m/s
    average_watts: activity.average_watts || null,
    kilojoules: activity.kilojoules || null,
    average_heartrate: activity.average_heartrate || null,
    max_heartrate: activity.max_heartrate || null,
    average_cadence: activity.average_cadence || null,
    suffer_score: activity.suffer_score || null,
    workout_type: activity.workout_type || null,
    trainer: activity.trainer || false,
    commute: activity.commute || false,
    gear_id: activity.gear_id || null,
    map_summary_polyline: activity.map?.summary_polyline || null,
    raw_data: activity,
    imported_from: 'strava_webhook',
    updated_at: new Date().toISOString()
  };
}

/**
 * Fetch activity details from Strava API
 */
async function fetchStravaActivity(activityId, accessToken) {
  try {
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
  } catch (error) {
    console.error('❌ Error fetching activity:', error);
    return null;
  }
}

/**
 * Get valid Strava access token, refresh if expired
 */
async function getValidAccessToken(integration) {
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  // If token is still valid, use it
  if (expiresAt > fiveMinutesFromNow) {
    return integration.access_token;
  }

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
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const tokenData = await response.json();
  const newExpiresAt = new Date(tokenData.expires_at * 1000).toISOString();

  // Update tokens in database
  await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', integration.id);

  console.log('✅ Token refreshed successfully');
  return tokenData.access_token;
}

/**
 * Mark webhook event as processed
 */
async function markEventProcessed(eventId, error = null, activityId = null) {
  if (!eventId) return;

  await supabase
    .from('strava_webhook_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      process_error: error,
      activity_id: activityId
    })
    .eq('id', eventId);
}
