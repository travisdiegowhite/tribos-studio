// Vercel API Route: Wahoo Fitness Webhook Handler
// Receives push notifications when users sync Wahoo devices
// Documentation: https://developers.wahooligan.com/

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { setupCors } from './utils/cors.js';
import { downloadAndParseFitFile } from './utils/fitParser.js';
import { checkForDuplicate, mergeActivityData } from './utils/activityDedup.js';
import { completeActivationStep, enqueueProactiveInsight } from './utils/activation.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Wahoo API Configuration
const WAHOO_API_BASE = 'https://api.wahooligan.com/v1';
const WAHOO_OAUTH_BASE = 'https://api.wahooligan.com/oauth';

// Security: Webhook token for URL-based verification
// NOTE: Wahoo doesn't support signature verification like Garmin/Stripe.
// As a workaround, add ?token=YOUR_SECRET to your webhook URL when registering with Wahoo.
// Set WAHOO_WEBHOOK_TOKEN in your environment variables.
const WEBHOOK_TOKEN = process.env.WAHOO_WEBHOOK_TOKEN;

// Rate limiting
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const rateLimitStore = new Map();

export default async function handler(req, res) {
  // CORS - Allow Wahoo servers (no origin header) and browser origins
  if (setupCors(req, res, { allowedMethods: ['POST', 'GET', 'OPTIONS'] })) {
    return; // Was an OPTIONS request, already handled
  }

  // Health check for webhook verification
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'wahoo-webhook-handler',
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

  // Webhook token verification (if configured)
  // Since Wahoo doesn't support signature verification, we use a URL token as a workaround
  if (WEBHOOK_TOKEN) {
    const providedToken = req.query.token;
    if (!providedToken) {
      console.warn('⚠️ Wahoo webhook request missing token from:', clientIP);
      return res.status(401).json({ error: 'Missing webhook token' });
    }
    // Use timing-safe comparison to prevent timing attacks
    const tokenBuffer = Buffer.from(providedToken);
    const expectedBuffer = Buffer.from(WEBHOOK_TOKEN);
    if (tokenBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
      console.warn('🚨 Invalid Wahoo webhook token from:', clientIP);
      return res.status(401).json({ error: 'Invalid webhook token' });
    }
  } else {
    // In production, reject requests when no token is configured
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      console.error('⚠️ WAHOO_WEBHOOK_TOKEN not configured in production — rejecting request');
      return res.status(401).json({ error: 'Webhook token not configured' });
    }
    console.warn('⚠️ WAHOO_WEBHOOK_TOKEN not configured — skipping verification (non-production)');
  }

  try {
    const webhookData = req.body;

    // Validate payload structure
    if (!webhookData || typeof webhookData !== 'object') {
      console.warn('⚠️ Invalid Wahoo webhook payload (not an object) from:', clientIP);
      return res.status(400).json({ error: 'Invalid payload format' });
    }

    console.log('📥 Wahoo webhook received:', {
      eventType: webhookData.event_type,
      userId: webhookData.user?.id,
      workoutId: webhookData.workout?.id,
      hasWorkoutSummary: !!webhookData.workout_summary,
      summaryFields: webhookData.workout_summary ? Object.keys(webhookData.workout_summary) : [],
      timestamp: new Date().toISOString()
    });

    // Wahoo sends different event types
    // workout.created, workout.updated, workout.deleted, workout_summary
    const eventType = webhookData.event_type;
    const wahooUser = webhookData.user;
    const workout = webhookData.workout;
    // Wahoo sends workout metrics in a separate workout_summary object
    const webhookSummary = webhookData.workout_summary;

    // Validate required fields
    if (!eventType || typeof eventType !== 'string') {
      console.warn('⚠️ Missing or invalid event_type in Wahoo webhook from:', clientIP);
      return res.status(400).json({ error: 'Missing event_type' });
    }

    if (!wahooUser || typeof wahooUser !== 'object' || !wahooUser.id) {
      console.warn('⚠️ Missing or invalid user data in Wahoo webhook from:', clientIP);
      return res.status(400).json({ error: 'Invalid webhook payload - missing user' });
    }

    // Process workout creation, update, and summary events
    const SUPPORTED_EVENTS = ['workout.created', 'workout.updated', 'workout_summary'];
    if (!SUPPORTED_EVENTS.includes(eventType)) {
      console.log('Ignoring unsupported event:', eventType);
      return res.status(200).json({ success: true, message: 'Event ignored' });
    }

    // Find user by Wahoo user ID
    const { data: integration } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, access_token, refresh_token, token_expires_at')
      .eq('provider', 'wahoo')
      .eq('provider_user_id', wahooUser.id.toString())
      .single();

    if (!integration) {
      console.log('No integration found for Wahoo user:', wahooUser.id);
      return res.status(200).json({ success: true, message: 'User not linked' });
    }

    // Check for existing activity from same workout
    let existingActivity = null;
    if (workout?.id) {
      const { data: existing } = await supabase
        .from('activities')
        .select('id, distance, moving_time, average_watts')
        .eq('provider_activity_id', workout.id.toString())
        .eq('user_id', integration.user_id)
        .eq('provider', 'wahoo')
        .maybeSingle();

      existingActivity = existing;

      // If activity exists and this is a workout_summary or workout.updated event,
      // update it with the new summary data instead of skipping
      if (existing && (eventType === 'workout_summary' || eventType === 'workout.updated')) {
        console.log('📊 Updating existing activity with summary data:', workout.id);
      } else if (existing) {
        console.log('Workout already imported:', workout.id);
        return res.status(200).json({ success: true, message: 'Already imported' });
      }
    }

    // Process SYNCHRONOUSLY before responding
    // IMPORTANT: Vercel terminates the function after response is sent,
    // so async processing after response will NOT complete!
    try {
      const result = await processWahooWorkout(integration, workout, webhookData, webhookSummary, existingActivity);
      console.log('✅ Wahoo webhook processed successfully');
      return res.status(200).json({
        success: true,
        message: existingActivity ? 'Workout updated' : 'Workout imported',
        activityId: result?.activityId
      });
    } catch (processingError) {
      console.error('❌ Wahoo processing error:', {
        error: processingError.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: processingError.stack }),
        userId: integration.user_id,
        workoutId: workout?.id,
        timestamp: new Date().toISOString()
      });
      // Still return 200 to prevent Wahoo from disabling webhook
      return res.status(200).json({
        success: false,
        message: 'Processing failed but acknowledged'
      });
    }

  } catch (error) {
    console.error('❌ Wahoo webhook handler error:', {
      error: error.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

async function processWahooWorkout(integration, workout, webhookData, webhookSummary, existingActivity) {
  if (!workout) {
    console.log('No workout data in webhook');
    return { activityId: null };
  }

  // Get valid access token for fetching full workout data
  const accessToken = await ensureValidAccessToken(integration);

  // Fetch full workout details from API to get file URL and nested workout_summary
  let workoutDetails = workout;
  let apiSummary = null;
  if (workout.id) {
    try {
      const response = await fetch(`${WAHOO_API_BASE}/workouts/${workout.id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        const data = await response.json();
        workoutDetails = data.workout || workout;
        // API response nests summary under workout.workout_summary
        apiSummary = workoutDetails.workout_summary || null;
      }
    } catch (err) {
      console.warn('Could not fetch full workout details:', err);
    }
  }

  // Resolve workout summary: prefer webhook payload, fall back to API response
  // Wahoo sends metrics in workout_summary (distance, speed, power, HR, etc.)
  // NOT on the workout object itself
  const summary = webhookSummary || apiSummary || {};

  console.log('📊 Wahoo workout summary resolved:', {
    source: webhookSummary ? 'webhook_payload' : apiSummary ? 'api_response' : 'none',
    hasDistance: summary.distance_accum != null,
    hasPower: summary.power_avg != null,
    hasHR: summary.heart_rate_avg != null,
    hasCadence: summary.cadence_avg != null,
    fields: Object.keys(summary).length
  });

  // Map Wahoo workout type to activity type (cycling + running)
  const activityType = mapWahooWorkoutType(workoutDetails.workout_type);

  // Only import supported activity types
  if (!activityType) {
    console.log('Skipping unsupported workout type:', workoutDetails.workout_type);
    return { activityId: null, skipped: true, reason: 'Unsupported workout type' };
  }

  // Try to get GPS data (polyline) from workout file or route
  let mapPolyline = null;
  if (workoutDetails.file?.url) {
    try {
      mapPolyline = await extractGPSFromWahooFile(workoutDetails.file.url, accessToken);
    } catch (err) {
      console.warn('Could not extract GPS from Wahoo file:', err.message);
    }
  }

  // Build activity data — read metrics from the summary object, not the workout object
  const activityData = {
    user_id: integration.user_id,
    provider: 'wahoo',
    provider_activity_id: workout.id.toString(),
    name: workoutDetails.name || `Wahoo ${['Run', 'VirtualRun', 'TrailRun'].includes(activityType) ? 'Run' : 'Ride'} - ${new Date().toLocaleDateString()}`,
    type: activityType,
    sport_type: workoutDetails.workout_type,
    start_date: workoutDetails.starts || workoutDetails.created_at || new Date().toISOString(),
    distance: summary.distance_accum ?? null, // meters
    moving_time: summary.duration_active_accum ?? null, // seconds
    elapsed_time: summary.duration_total_accum ?? null, // seconds
    total_elevation_gain: summary.ascent_accum ?? null,
    average_speed: summary.speed_avg ?? null, // m/s
    max_speed: summary.speed_max ?? null,
    average_watts: summary.power_avg ?? null,
    average_heartrate: summary.heart_rate_avg ?? null,
    max_heartrate: summary.heart_rate_max ?? null,
    average_cadence: summary.cadence_avg ?? null,
    kilojoules: summary.work_accum ? summary.work_accum / 1000 : null,
    calories: summary.calories_accum ?? null,
    trainer: workoutDetails.workout_type === 'indoor_cycling' || workoutDetails.workout_type === 'treadmill_running',
    map_summary_polyline: mapPolyline,
    raw_data: webhookData,
    imported_from: 'wahoo_webhook'
  };

  // If this is an update to an existing activity (workout_summary or workout.updated event),
  // update it with the new data instead of inserting
  if (existingActivity) {
    return await updateExistingActivity(existingActivity.id, activityData, integration);
  }

  // Cross-provider duplicate check (e.g., Wahoo activity already synced via Strava/Garmin)
  const dupCheck = await checkForDuplicate(
    integration.user_id,
    activityData.start_date,
    activityData.distance,
    'wahoo',
    workout.id.toString()
  );

  if (dupCheck.isDuplicate) {
    console.log('🔄 Cross-provider duplicate detected, merging data instead');
    // Merge Wahoo data into existing activity from another provider
    const wahooData = {
      map_summary_polyline: mapPolyline || null,
      average_watts: activityData.average_watts || null,
      average_heartrate: activityData.average_heartrate || null,
      max_heartrate: activityData.max_heartrate || null,
      average_cadence: activityData.average_cadence || null,
      kilojoules: activityData.kilojoules || null,
      raw_data: activityData.raw_data
    };
    await mergeActivityData(dupCheck.existingActivity.id, wahooData, 'wahoo');

    // Update integration last sync (even for merged data)
    await supabase
      .from('bike_computer_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: null
      })
      .eq('id', integration.id);

    return { activityId: dupCheck.existingActivity.id, merged: true };
  }

  const { data: activity, error: insertError } = await supabase
    .from('activities')
    .insert(activityData)
    .select()
    .single();

  if (insertError) {
    console.error('Error inserting Wahoo activity:', insertError);
    // Update sync error on the integration
    await supabase
      .from('bike_computer_integrations')
      .update({
        sync_error: insertError.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', integration.id);
    throw insertError;
  }

  console.log('✅ Wahoo activity imported:', {
    id: activity.id,
    name: activity.name,
    type: activity.type,
    distance: activity.distance ? `${(activity.distance / 1000).toFixed(2)} km` : 'N/A',
    hasGPS: !!mapPolyline
  });

  // Auto-assign gear to activity
  try {
    const { assignGearToActivity } = await import('./utils/gearAssignment.js');
    await assignGearToActivity(supabase, {
      activityId: activity.id,
      userId: integration.user_id,
      activityType: activity.type,
      distance: activity.distance,
      stravaGearId: null,
    });
  } catch (gearError) {
    console.error('⚠️ Gear assignment failed (non-critical):', gearError.message);
  }

  // Track activation progress and enqueue insight
  try {
    await completeActivationStep(supabase, integration.user_id, 'first_sync');
    await enqueueProactiveInsight(supabase, integration.user_id, activity.id);
  } catch (activationError) {
    console.error('⚠️ Activation tracking failed (non-critical):', activationError.message);
  }

  // Update integration last sync
  await supabase
    .from('bike_computer_integrations')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_error: null
    })
    .eq('id', integration.id);

  return { activityId: activity.id };
}

/**
 * Update an existing Wahoo activity with summary data
 * Called when a workout_summary or workout.updated event arrives for an already-imported workout
 */
async function updateExistingActivity(activityId, activityData, integration) {
  // Only update fields that have actual values (don't overwrite good data with null)
  const updates = {};
  const fieldsToUpdate = [
    'distance', 'moving_time', 'elapsed_time', 'total_elevation_gain',
    'average_speed', 'max_speed', 'average_watts', 'average_heartrate',
    'max_heartrate', 'average_cadence', 'kilojoules', 'calories',
    'map_summary_polyline', 'trainer'
  ];

  for (const field of fieldsToUpdate) {
    if (activityData[field] != null) {
      updates[field] = activityData[field];
    }
  }

  // Always update raw_data and name if available
  updates.raw_data = activityData.raw_data;
  updates.updated_at = new Date().toISOString();
  if (activityData.name) {
    updates.name = activityData.name;
  }

  const { error: updateError } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', activityId);

  if (updateError) {
    console.error('Error updating Wahoo activity:', updateError);
    throw updateError;
  }

  console.log('✅ Wahoo activity updated with summary data:', {
    id: activityId,
    updatedFields: Object.keys(updates).filter(k => k !== 'raw_data' && k !== 'updated_at'),
    distance: updates.distance ? `${(updates.distance / 1000).toFixed(2)} km` : 'N/A',
    hasGPS: !!updates.map_summary_polyline
  });

  // Update integration last sync
  await supabase
    .from('bike_computer_integrations')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_error: null
    })
    .eq('id', integration.id);

  return { activityId, updated: true };
}

async function ensureValidAccessToken(integration) {
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();

  if (expiresAt.getTime() - 300000 > now.getTime()) {
    return integration.access_token;
  }

  console.log('🔄 Refreshing Wahoo access token...');

  const response = await fetch(`${WAHOO_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.WAHOO_CLIENT_ID,
      client_secret: process.env.WAHOO_CLIENT_SECRET,
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token'
    }).toString()
  });

  if (!response.ok) {
    throw new Error('Wahoo token refresh failed');
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

function mapWahooWorkoutType(wahooType) {
  const cyclingTypes = {
    'cycling': 'Ride',
    'indoor_cycling': 'VirtualRide',
    'mountain_biking': 'MountainBikeRide',
    'gravel_cycling': 'GravelRide'
  };

  const runningTypes = {
    'running': 'Run',
    'treadmill_running': 'Run',
    'indoor_running': 'Run',
    'trail_running': 'TrailRun'
  };

  const lowerType = (wahooType || '').toLowerCase();

  // Check if it's a cycling type
  if (cyclingTypes[lowerType]) {
    return cyclingTypes[lowerType];
  }

  // Check if it's a running type
  if (runningTypes[lowerType]) {
    return runningTypes[lowerType];
  }

  // Check if it contains 'bike' or 'cycling'
  if (lowerType.includes('bike') || lowerType.includes('cycling')) {
    return 'Ride';
  }

  // Check if it contains 'run'
  if (lowerType.includes('run')) {
    return 'Run';
  }

  // Unsupported activity type
  return null;
}

/**
 * Extract GPS data from Wahoo workout file
 * @param {string} fileUrl - URL to the workout file (FIT format)
 * @param {string} accessToken - Wahoo access token for authentication
 * @returns {Promise<string|null>} Encoded polyline or null
 */
async function extractGPSFromWahooFile(fileUrl, accessToken) {
  if (!fileUrl) {
    return null;
  }

  console.log('🗺️ Extracting GPS data from Wahoo FIT file...');

  try {
    const result = await downloadAndParseFitFile(fileUrl, accessToken);

    if (result.error) {
      console.warn('⚠️ GPS extraction warning:', result.error);
      return null;
    }

    if (result.polyline) {
      console.log(`✅ GPS extracted: ${result.simplifiedCount} points encoded`);
      return result.polyline;
    }

    console.log('ℹ️ No GPS data in workout file (indoor ride?)');
    return null;

  } catch (error) {
    console.error('❌ GPS extraction failed:', error.message);
    return null;
  }
}
