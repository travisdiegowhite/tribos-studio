// Vercel API Route: Garmin Activity Webhook Handler
// Receives push notifications when users sync Garmin devices
// Documentation: https://developer.garmin.com/gc-developer-program/activity-api/
//
// CRITICAL: Garmin requires webhook responses within 5 seconds.
// This handler prioritizes fast response, then processes asynchronously.

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
  const origin = req.headers.origin;
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://www.tribos.studio', 'https://tribos-studio.vercel.app']
    : ['http://localhost:3000', 'http://localhost:5173'];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin && req.method !== 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    // CRITICAL: Respond immediately to Garmin (within 5 seconds)
    // Garmin will disable webhooks that don't respond quickly
    res.status(200).json({
      success: true,
      eventId: event.id,
      message: 'Webhook received and queued for processing'
    });

    // Process asynchronously - but note Vercel may kill this after response
    // For more reliable processing, consider using Vercel Background Functions
    // or a separate processing queue (e.g., Supabase Edge Functions, Cloudflare Workers)
    setImmediate(() => {
      processWebhookEvent(event.id).catch(err => {
        console.error('❌ Async webhook processing error:', err);
        // Update event with error
        supabase
          .from('garmin_webhook_events')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            process_error: `Async processing failed: ${err.message}`
          })
          .eq('id', event.id)
          .then(() => {})
          .catch(() => {});
      });
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
      // Mark the integration as having sync issues
      await supabase
        .from('bike_computer_integrations')
        .update({
          sync_error: `Token refresh failed at ${new Date().toISOString()}: ${tokenError.message}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', integration.id);
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
        sync_error: null,
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
    let activityInfo = null;

    // Extract activity info from different Garmin payload structures
    if (payload.activities && payload.activities.length > 0) {
      activityInfo = payload.activities[0];
    } else if (payload.activityDetails && payload.activityDetails.length > 0) {
      activityInfo = payload.activityDetails[0];
    } else if (payload.activityFiles && payload.activityFiles.length > 0) {
      activityInfo = payload.activityFiles[0];
    } else {
      // Fallback to flat payload structure
      activityInfo = payload;
    }

    // Construct file URL if not provided
    let fileUrl = event.file_url;
    if (!fileUrl && event.activity_id) {
      const summaryId = activityInfo?.summaryId || event.activity_id;
      fileUrl = `https://apis.garmin.com/wellness-api/rest/activityFile?id=${summaryId}`;
      console.log('📎 Constructed FIT file URL:', fileUrl);
    }

    console.log('📥 Processing Garmin activity:', {
      activityId: event.activity_id,
      activityType: activityInfo?.activityType,
      activityName: activityInfo?.activityName,
      hasFileUrl: !!fileUrl
    });

    // Extract activity data from webhook payload (summary data)
    // Note: Full FIT file processing would require downloading and parsing
    const activityData = {
      user_id: integration.user_id,
      provider: 'garmin',
      provider_activity_id: event.activity_id,
      name: activityInfo?.activityName || `Garmin Activity - ${new Date().toLocaleDateString()}`,
      type: mapGarminActivityType(activityInfo?.activityType),
      sport_type: activityInfo?.activityType,
      start_date: activityInfo?.startTimeInSeconds
        ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
        : new Date().toISOString(),
      distance: activityInfo?.distanceInMeters || activityInfo?.distance,
      moving_time: activityInfo?.durationInSeconds || activityInfo?.duration || activityInfo?.movingDurationInSeconds,
      elapsed_time: activityInfo?.durationInSeconds || activityInfo?.duration || activityInfo?.elapsedDurationInSeconds,
      total_elevation_gain: activityInfo?.totalElevationGain || activityInfo?.elevationGainInMeters,
      total_elevation_loss: activityInfo?.totalElevationLoss || activityInfo?.elevationLossInMeters,
      average_speed: activityInfo?.averageSpeedInMetersPerSecond || activityInfo?.averageSpeed,
      max_speed: activityInfo?.maxSpeedInMetersPerSecond || activityInfo?.maxSpeed,
      average_watts: activityInfo?.averagePower || activityInfo?.averageBikingPowerInWatts,
      max_watts: activityInfo?.maxPower || activityInfo?.maxBikingPowerInWatts,
      average_heartrate: activityInfo?.averageHeartRate || activityInfo?.averageHeartRateInBeatsPerMinute,
      max_heartrate: activityInfo?.maxHeartRate || activityInfo?.maxHeartRateInBeatsPerMinute,
      average_cadence: activityInfo?.averageBikingCadenceInRPM,
      calories: activityInfo?.activeKilocalories || activityInfo?.caloriesBurned,
      trainer: activityInfo?.indoor || false,
      garmin_activity_url: event.activity_id
        ? `https://connect.garmin.com/modern/activity/${event.activity_id}`
        : null,
      raw_data: payload
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
      duration: activity.moving_time ? `${Math.round(activity.moving_time / 60)} min` : 'N/A'
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
      sync_error: null, // Clear any previous sync errors
      updated_at: new Date().toISOString()
    })
    .eq('id', integration.id);

  if (updateError) {
    console.error('⚠️ Failed to update tokens in database:', updateError);
    // Don't throw - we still have a valid token to return
  }

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

function mapGarminActivityType(garminType) {
  const typeMap = {
    'cycling': 'Ride',
    'road_biking': 'Ride',
    'virtual_ride': 'VirtualRide',
    'indoor_cycling': 'VirtualRide',
    'mountain_biking': 'MountainBikeRide',
    'gravel_cycling': 'GravelRide',
    'cyclocross': 'Ride',
    'e_biking': 'EBikeRide'
  };

  const lowerType = (garminType || '').toLowerCase();
  return typeMap[lowerType] || 'Ride';
}
