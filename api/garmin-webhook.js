// Vercel API Route: Garmin Activity Webhook Handler
// Receives push notifications when users sync Garmin devices
// Documentation: https://developer.garmin.com/gc-developer-program/activity-api/

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
    return res.status(200).json({
      status: 'ok',
      service: 'garmin-webhook-handler',
      timestamp: new Date().toISOString()
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
    const webhookData = req.body;

    console.log('📥 Garmin webhook received:', {
      eventType: webhookData.eventType,
      userId: webhookData.userId,
      activityId: webhookData.activityId,
      timestamp: new Date().toISOString()
    });

    if (!webhookData || !webhookData.userId) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Check for duplicate webhook
    if (webhookData.activityId) {
      const { data: existing } = await supabase
        .from('garmin_webhook_events')
        .select('id')
        .eq('activity_id', webhookData.activityId)
        .eq('garmin_user_id', webhookData.userId)
        .maybeSingle();

      if (existing) {
        console.log('Duplicate webhook ignored:', webhookData.activityId);
        return res.status(200).json({ success: true, message: 'Already processed' });
      }
    }

    // Store webhook event
    const { data: event, error: eventError } = await supabase
      .from('garmin_webhook_events')
      .insert({
        event_type: webhookData.eventType || 'activity',
        garmin_user_id: webhookData.userId,
        activity_id: webhookData.activityId,
        file_url: webhookData.fileUrl || webhookData.activityFileUrl,
        file_type: webhookData.fileType || 'FIT',
        upload_timestamp: webhookData.uploadTimestamp ||
          (webhookData.startTimeInSeconds ? new Date(webhookData.startTimeInSeconds * 1000).toISOString() : null),
        payload: webhookData,
        processed: false
      })
      .select()
      .single();

    if (eventError) {
      console.error('Error storing webhook event:', eventError);
      throw eventError;
    }

    // Respond quickly to Garmin
    res.status(200).json({
      success: true,
      eventId: event.id,
      message: 'Webhook received and queued'
    });

    // Process asynchronously
    processWebhookEvent(event.id).catch(err => {
      console.error('Webhook processing error:', err);
    });

  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
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

    if (eventError || !event || event.processed) {
      return;
    }

    // Find user by Garmin user ID
    const { data: integration } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, access_token, refresh_token, token_expires_at')
      .eq('provider', 'garmin')
      .eq('provider_user_id', event.garmin_user_id)
      .single();

    if (!integration) {
      console.log('No integration found for Garmin user:', event.garmin_user_id);
      await markEventProcessed(eventId, 'No integration found');
      return;
    }

    // Update event with user info
    await supabase
      .from('garmin_webhook_events')
      .update({ user_id: integration.user_id, integration_id: integration.id })
      .eq('id', eventId);

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

  } catch (error) {
    console.error('Processing error:', error);
    await markEventProcessed(eventId, error.message);
  }
}

async function downloadAndProcessActivity(event, integration) {
  try {
    // Construct file URL if not provided
    let fileUrl = event.file_url;
    if (!fileUrl && event.activity_id) {
      const summaryId = event.payload?.summaryId || event.activity_id;
      fileUrl = `https://apis.garmin.com/wellness-api/rest/activityFile?id=${summaryId}`;
    }

    if (!fileUrl) {
      throw new Error('No file URL available');
    }

    // Get valid access token
    const accessToken = await ensureValidAccessToken(integration);

    console.log('📥 Downloading activity from Garmin:', event.activity_id);

    // For now, store basic activity data from webhook payload
    // Full FIT parsing requires fit-file-parser which adds bundle size
    const payload = event.payload;

    // Extract activity data from webhook payload
    const activityData = {
      user_id: integration.user_id,
      provider: 'garmin',
      provider_activity_id: event.activity_id,
      name: payload.activityName || `Garmin Activity - ${new Date().toLocaleDateString()}`,
      type: mapGarminActivityType(payload.activityType),
      sport_type: payload.activityType,
      start_date: payload.startTimeInSeconds
        ? new Date(payload.startTimeInSeconds * 1000).toISOString()
        : new Date().toISOString(),
      distance: payload.distanceInMeters || payload.distance,
      moving_time: payload.durationInSeconds || payload.duration,
      elapsed_time: payload.durationInSeconds || payload.duration,
      total_elevation_gain: payload.totalElevationGain,
      average_speed: payload.averageSpeedInMetersPerSecond,
      max_speed: payload.maxSpeedInMetersPerSecond,
      average_watts: payload.averagePower,
      average_heartrate: payload.averageHeartRate,
      max_heartrate: payload.maxHeartRate,
      trainer: payload.indoor || false,
      raw_data: payload
    };

    const { data: activity, error: insertError } = await supabase
      .from('activities')
      .insert(activityData)
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log('✅ Activity imported:', activity.id);

    // Mark webhook as processed
    await supabase
      .from('garmin_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        activity_imported_id: activity.id
      })
      .eq('id', event.id);

    // Update integration last sync
    await supabase
      .from('bike_computer_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: null
      })
      .eq('id', integration.id);

  } catch (error) {
    console.error('Activity download/process error:', error);
    await markEventProcessed(event.id, error.message);
    throw error;
  }
}

async function ensureValidAccessToken(integration) {
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();

  // Check if token expires in next 5 minutes
  if (expiresAt.getTime() - 300000 > now.getTime()) {
    return integration.access_token;
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
    throw new Error('Token refresh failed');
  }

  const tokenData = await response.json();
  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || integration.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', integration.id);

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
