// Vercel API Route: Garmin Activity Webhook Handler
// Receives push notifications when users sync Garmin devices
// Documentation: https://developer.garmin.com/gc-developer-program/activity-api/
//
// CRITICAL: Garmin requires webhook responses within 5 seconds.
// This handler prioritizes fast response, then processes asynchronously.

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { setupCors } from './utils/cors.js';
import { downloadAndParseFitFile } from './utils/fitParser.js';
import { checkForDuplicate, takeoverActivity, mergeActivityData } from './utils/activityDedup.js';
import { updateBackfillChunkIfApplicable } from './utils/garminBackfill.js';
import { extractAndStoreActivitySegments } from './utils/roadSegmentExtractor.js';

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

    // Determine file URL from various payload formats
    // IMPORTANT: Extract this BEFORE the duplicate check so we can use it
    let fileUrl = webhookData.fileUrl || webhookData.activityFileUrl;
    if (!fileUrl && activityData) {
      fileUrl = activityData.callbackURL || activityData.fileUrl;
    }

    console.log('📥 Garmin webhook received:', {
      webhookType,
      userId,
      activityId,
      hasActivityData: !!activityData,
      hasFileUrl: !!fileUrl,
      ip: clientIP,
      timestamp: lastWebhookReceived
    });

    // Validate we have a user ID
    if (!userId) {
      console.warn('🚫 Missing userId in webhook payload');
      return res.status(400).json({ error: 'Invalid webhook payload - missing userId' });
    }

    // Check for duplicate webhook (do this quickly)
    // IMPORTANT: Allow ACTIVITY_FILE_DATA webhooks through even if we've seen this activity
    // because they contain the FIT file URL needed for GPS data
    if (activityId) {
      const { data: existingEvent } = await supabase
        .from('garmin_webhook_events')
        .select('id, file_url')
        .eq('activity_id', activityId)
        .eq('garmin_user_id', userId)
        .maybeSingle();

      if (existingEvent) {
        // If this is an ACTIVITY_FILE_DATA webhook with a new file URL,
        // we should process it to get GPS data
        const hasNewFileUrl = fileUrl && !existingEvent.file_url;
        const isFileDataWebhook = webhookType === 'ACTIVITY_FILE_DATA';

        if (isFileDataWebhook && hasNewFileUrl) {
          // Update the existing event with the file URL and reprocess
          console.log('📍 ACTIVITY_FILE_DATA received for existing activity, updating with FIT URL:', activityId);
          await supabase
            .from('garmin_webhook_events')
            .update({
              file_url: fileUrl,
              processed: false,  // Mark for reprocessing
              process_error: null
            })
            .eq('id', existingEvent.id);

          // Process immediately to get GPS data
          try {
            await processWebhookEvent(existingEvent.id);
            console.log('✅ GPS data processed from ACTIVITY_FILE_DATA webhook');
          } catch (err) {
            console.error('❌ GPS processing error:', err.message);
          }

          return res.status(200).json({
            success: true,
            message: 'File URL added and GPS processed',
            eventId: existingEvent.id
          });
        }

        console.log('ℹ️ Duplicate webhook ignored:', activityId);
        return res.status(200).json({ success: true, message: 'Already processed', eventId: existingEvent.id });
      }
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
        .select('id, map_summary_polyline, average_watts, normalized_power, power_curve_summary')
        .eq('provider_activity_id', event.activity_id)
        .eq('user_id', integration.user_id)
        .eq('provider', 'garmin')
        .maybeSingle();

      if (existing) {
        // Activity exists - check if we need to update GPS or power data
        const fitFileUrl = event.file_url;
        const needsGps = !existing.map_summary_polyline;
        // Check if missing average_watts (the main power metric users see)
        const needsAvgPower = !existing.average_watts;
        const needsPowerMetrics = !existing.normalized_power && !existing.power_curve_summary;
        const needsFitData = (needsGps || needsPowerMetrics || needsAvgPower) && fitFileUrl;

        if (needsFitData) {
          // Activity exists but missing GPS or power data - try to extract from FIT file
          console.log('📍 Activity exists but missing data, attempting FIT file download:', event.activity_id);
          try {
            const fitResult = await downloadAndParseFitFile(fitFileUrl, integration.access_token);

            // Build update object
            const activityUpdate = { updated_at: new Date().toISOString() };
            const updates = [];

            if (needsGps && fitResult.polyline) {
              activityUpdate.map_summary_polyline = fitResult.polyline;
              updates.push(`GPS: ${fitResult.simplifiedCount} points`);
            }

            // Always try to update power if available from FIT and missing in activity
            if (fitResult.powerMetrics) {
              const pm = fitResult.powerMetrics;
              // CRITICAL: Save average_watts - this is what shows in the UI
              if (needsAvgPower && pm.avgPower) {
                activityUpdate.average_watts = pm.avgPower;
                updates.push(`Avg: ${pm.avgPower}W`);
              }
              if (needsPowerMetrics) {
                if (pm.normalizedPower) activityUpdate.normalized_power = pm.normalizedPower;
                if (pm.maxPower) activityUpdate.max_watts = pm.maxPower;
                if (pm.trainingStressScore) activityUpdate.tss = pm.trainingStressScore;
                if (pm.intensityFactor) activityUpdate.intensity_factor = pm.intensityFactor;
                if (pm.powerCurveSummary) activityUpdate.power_curve_summary = pm.powerCurveSummary;
                if (pm.normalizedPower) updates.push(`NP: ${pm.normalizedPower}W`);
              }
              if (pm.avgPower || pm.normalizedPower) {
                activityUpdate.device_watts = true;
              }
            }

            if (updates.length > 0) {
              const { error: updateError } = await supabase
                .from('activities')
                .update(activityUpdate)
                .eq('id', existing.id);

              if (updateError) {
                console.error('❌ Failed to update activity:', updateError);
                await markEventProcessed(eventId, `Update failed: ${updateError.message}`, existing.id);
              } else {
                console.log(`✅ Data added to existing activity: ${updates.join(', ')}`);
                await markEventProcessed(eventId, `Data added: ${updates.join(', ')}`, existing.id);
              }
            } else {
              console.log('ℹ️ No new data in FIT file');
              await markEventProcessed(eventId, 'Already imported, no new data in FIT file', existing.id);
            }
          } catch (fitError) {
            console.error('⚠️ FIT file processing failed:', fitError.message);
            await markEventProcessed(eventId, `Already imported, FIT error: ${fitError.message}`, existing.id);
          }
        } else {
          console.log('Activity already imported:', event.activity_id);
          await markEventProcessed(eventId, 'Already imported', existing.id);
        }
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

    // FILTER 1: Check if this is a health/monitoring activity type
    // These shouldn't be imported as activities, but we DO want to extract health metrics
    if (shouldFilterActivityType(activityType)) {
      console.log('💚 Health/monitoring activity detected:', activityType);

      // Extract and save any health metrics to Body Check-in before skipping
      const savedHealthData = await extractAndSaveHealthMetrics(integration.user_id, webhookInfo || {});

      const message = savedHealthData
        ? `Health activity "${activityType}" - metrics saved to Body Check-in`
        : `Health activity "${activityType}" - no metrics to extract`;

      console.log('⏭️ Skipping activity import (health data handled separately)');
      await markEventProcessed(event.id, message);
      return;
    }

    // FILTER 2: Check if activity has minimum metrics (filters trivial auto-detected movements)
    if (!hasMinimumActivityMetrics(webhookInfo || {})) {
      console.log('⏭️ Activity too short for import:', {
        type: activityType,
        duration: webhookInfo?.durationInSeconds || webhookInfo?.movingDurationInSeconds || 0,
        distance: webhookInfo?.distanceInMeters || 0
      });

      // Still try to extract any health data from short activities
      await extractAndSaveHealthMetrics(integration.user_id, webhookInfo || {});

      await markEventProcessed(event.id, `Filtered: activity too short, any health data saved`);
      return;
    }

    // For PUSH notifications (CONNECT_ACTIVITY, ACTIVITY_DETAIL), use payload data directly
    // This is faster and avoids "Invalid download token" errors
    // For ACTIVITY_FILE_DATA (PING), the callbackURL returns binary FIT file, NOT JSON activity data
    // So we need to fetch activity details from the API using summaryId
    let activityDetails = null;
    const hasSufficientData = webhookInfo &&
      (webhookInfo.distanceInMeters || webhookInfo.durationInSeconds || webhookInfo.startTimeInSeconds);

    if (!isPushNotification && integration.access_token && summaryId) {
      // ACTIVITY_FILE_DATA (PING notification) - fetch activity details from API
      // NOTE: callbackURL is for FIT file download, NOT activity JSON data
      console.log('📥 Fetching activity details from API for ACTIVITY_FILE_DATA...');
      activityDetails = await fetchGarminActivityDetails(integration.access_token, summaryId);
    } else if (!hasSufficientData && integration.access_token && summaryId) {
      // Missing data - try to fetch from API as fallback
      console.log('📥 Fetching additional data from Garmin API...');
      activityDetails = await fetchGarminActivityDetails(integration.access_token, summaryId);
    } else {
      console.log('✅ Using webhook payload data directly (PUSH notification)');
    }

    // Build activity data from API response (or fallback to webhook data)
    const activityInfo = activityDetails || webhookInfo || {};

    // Debug: Log available fields from Garmin to help diagnose missing data
    console.log('📊 Garmin activity data fields:', {
      // All field variations for elevation
      elevation: {
        elevationGainInMeters: activityInfo.elevationGainInMeters,
        totalElevationGainInMeters: activityInfo.totalElevationGainInMeters,
        totalElevationGain: activityInfo.totalElevationGain,
        total_ascent: activityInfo.total_ascent,
      },
      // All field variations for power
      power: {
        averageBikingPowerInWatts: activityInfo.averageBikingPowerInWatts,
        averagePower: activityInfo.averagePower,
        avgPower: activityInfo.avgPower,
        avg_power: activityInfo.avg_power,
      },
      // Other key fields
      distance: activityInfo.distanceInMeters ?? activityInfo.distance,
      duration: activityInfo.movingDurationInSeconds ?? activityInfo.durationInSeconds,
      heartRate: activityInfo.averageHeartRateInBeatsPerMinute ?? activityInfo.averageHeartRate,
      calories: activityInfo.activeKilocalories ?? activityInfo.calories,
      // Show all keys for debugging
      allKeys: Object.keys(activityInfo).filter(k => k !== 'samples' && k !== 'laps').join(', ')
    });

    // Build activity data using centralized helper - ONLY uses columns that exist in the schema
    const source = activityDetails ? 'webhook_with_api' : 'webhook_push';
    const activityData = buildActivityData(integration.user_id, event.activity_id, activityInfo, source);
    // Override raw_data to include both webhook and API data
    activityData.raw_data = { webhook: payload, api: activityDetails };

    // Cross-provider duplicate check (e.g., Garmin activity already synced via Strava)
    const dupCheck = await checkForDuplicate(
      integration.user_id,
      activityData.start_date,
      activityData.distance,
      'garmin',
      event.activity_id
    );

    if (dupCheck.isDuplicate) {
      if (dupCheck.shouldTakeover) {
        // Garmin has higher priority than existing provider (e.g., Strava)
        // Take over the activity completely - Garmin becomes the source of truth
        console.log('🔄 Cross-provider duplicate: Garmin taking over from', dupCheck.existingActivity.provider);

        const result = await takeoverActivity(
          dupCheck.existingActivity.id,
          activityData,
          'garmin',
          event.activity_id
        );

        if (result.success) {
          // Try to get FIT data for the taken-over activity
          const fitFileUrl = event.file_url || webhookInfo?.callbackURL;
          if (fitFileUrl && integration.access_token) {
            try {
              const fitResult = await downloadAndParseFitFile(fitFileUrl, integration.access_token);
              if (fitResult.powerMetrics || fitResult.polyline) {
                const fitUpdate = { updated_at: new Date().toISOString() };
                if (fitResult.polyline) fitUpdate.map_summary_polyline = fitResult.polyline;
                if (fitResult.powerMetrics?.avgPower) fitUpdate.average_watts = fitResult.powerMetrics.avgPower;
                if (fitResult.powerMetrics?.normalizedPower) fitUpdate.normalized_power = fitResult.powerMetrics.normalizedPower;
                if (fitResult.powerMetrics?.maxPower) fitUpdate.max_watts = fitResult.powerMetrics.maxPower;
                if (fitResult.powerMetrics?.powerCurveSummary) fitUpdate.power_curve_summary = fitResult.powerMetrics.powerCurveSummary;
                fitUpdate.device_watts = true;

                await supabase
                  .from('activities')
                  .update(fitUpdate)
                  .eq('id', dupCheck.existingActivity.id);

                console.log('✅ FIT data added to taken-over activity');
              }
            } catch (fitError) {
              console.warn('⚠️ Could not add FIT data to taken-over activity:', fitError.message);
            }
          }

          // Track backfill chunk even for takeovers
          if (activityInfo.startTimeInSeconds) {
            await updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
          }
          await markEventProcessed(event.id, `Garmin took over from ${dupCheck.existingActivity.provider}`, dupCheck.existingActivity.id);
        } else {
          await markEventProcessed(event.id, `Takeover failed: ${result.error}`, dupCheck.existingActivity.id);
        }
        return;
      } else {
        // Garmin has lower/equal priority - just merge any additional data
        console.log('🔄 Cross-provider duplicate detected, merging Garmin data into existing');
        const garminData = {
          total_elevation_gain: activityData.total_elevation_gain || null,
          average_watts: activityData.average_watts || null,
          average_heartrate: activityData.average_heartrate || null,
          max_heartrate: activityData.max_heartrate || null,
          average_cadence: activityData.average_cadence || null,
          kilojoules: activityData.kilojoules || null,
          raw_data: activityData.raw_data
        };
        await mergeActivityData(dupCheck.existingActivity.id, garminData, 'garmin');
        // Track backfill chunk even for merges
        if (activityInfo.startTimeInSeconds) {
          await updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
        }
        await markEventProcessed(event.id, dupCheck.reason, dupCheck.existingActivity.id);
        return;
      }
    }

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
      elevation: activity.total_elevation_gain ? `${Math.round(activity.total_elevation_gain)}m` : 'N/A',
      avgHR: activity.average_heartrate || 'N/A',
      avgPower: activity.average_watts ? `${Math.round(activity.average_watts)}W` : 'N/A',
      avgCadence: activity.average_cadence || 'N/A',
      kilojoules: activity.kilojoules ? `${Math.round(activity.kilojoules)} kJ` : 'N/A',
      dataSource: activityDetails ? 'Garmin API' : 'Webhook only'
    });

    // Update backfill chunk tracking if this activity came from a historical backfill
    if (activityInfo.startTimeInSeconds) {
      await updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
    }

    // Try to download and parse FIT file for GPS data
    // The FIT file contains the full GPS track that we can encode as a polyline
    const fitFileUrl = event.file_url || webhookInfo?.callbackURL;

    if (fitFileUrl && integration.access_token) {
      console.log('🗺️ Attempting to extract GPS data from FIT file...');

      try {
        const fitResult = await downloadAndParseFitFile(fitFileUrl, integration.access_token);

        // Build update object with GPS and power metrics
        const activityUpdate = {
          updated_at: new Date().toISOString()
        };

        if (fitResult.polyline) {
          activityUpdate.map_summary_polyline = fitResult.polyline;
        }

        // Add power metrics if available from FIT file
        if (fitResult.powerMetrics) {
          const pm = fitResult.powerMetrics;
          // CRITICAL: Save average_watts from FIT file - this is the key fix!
          // Garmin PUSH webhooks don't include power data, only FIT files do
          if (pm.avgPower) activityUpdate.average_watts = pm.avgPower;
          if (pm.normalizedPower) activityUpdate.normalized_power = pm.normalizedPower;
          if (pm.maxPower) activityUpdate.max_watts = pm.maxPower;
          if (pm.trainingStressScore) activityUpdate.tss = pm.trainingStressScore;
          if (pm.intensityFactor) activityUpdate.intensity_factor = pm.intensityFactor;
          if (pm.powerCurveSummary) activityUpdate.power_curve_summary = pm.powerCurveSummary;
          activityUpdate.device_watts = true; // Power meter data from FIT file

          console.log(`⚡ Power metrics from FIT: Avg=${pm.avgPower}W, NP=${pm.normalizedPower}W, Max=${pm.maxPower}W, TSS=${pm.trainingStressScore || 'N/A'}`);
        }

        // Update activity if we have any data to add
        if (Object.keys(activityUpdate).length > 1) { // More than just updated_at
          const { error: updateError } = await supabase
            .from('activities')
            .update(activityUpdate)
            .eq('id', activity.id);

          if (updateError) {
            console.error('❌ Failed to save FIT data:', updateError);
          } else {
            const updates = [];
            if (fitResult.polyline) updates.push(`GPS: ${fitResult.simplifiedCount} points`);
            if (fitResult.powerMetrics?.normalizedPower) updates.push(`NP: ${fitResult.powerMetrics.normalizedPower}W`);
            if (fitResult.powerMetrics?.powerCurveSummary) updates.push(`Power curve: ${Object.keys(fitResult.powerMetrics.powerCurveSummary).length} points`);
            console.log(`✅ FIT data saved: ${updates.join(', ')}`);

            // Extract road segments for preference-based routing (async, don't block)
            if (fitResult.polyline) {
              extractAndStoreActivitySegments(activity.id, integration.user_id).catch(err => {
                console.warn(`⚠️ Segment extraction failed for activity ${activity.id}:`, err.message);
              });
            }
          }
        } else if (fitResult.error) {
          console.log('⚠️ Could not extract data from FIT:', fitResult.error);
        } else {
          console.log('ℹ️ No GPS or power data in FIT file (indoor activity without power?)');
        }
      } catch (fitError) {
        // Don't fail the whole import if FIT parsing fails
        console.error('⚠️ FIT file processing failed (activity still saved):', fitError.message);
      }
    } else {
      console.log('ℹ️ No FIT file URL available for GPS extraction');

      // For PUSH webhooks without FIT URL, request activity details backfill
      // This will trigger Garmin to send a PING notification with the FIT file URL
      // The GPS data will be extracted when that webhook arrives
      const isIndoorActivity = activityData.trainer === true ||
        (activityInfo.activityType || '').toLowerCase().includes('indoor') ||
        (activityInfo.activityType || '').toLowerCase().includes('virtual');

      if (!isIndoorActivity && activityInfo.startTimeInSeconds) {
        // Request backfill - await to ensure it completes before Vercel terminates
        // The function has its own try/catch so it won't throw
        await requestActivityDetailsBackfill(integration.access_token, activityInfo.startTimeInSeconds);
      }
    }

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
    // Use 6-hour buffer since Garmin tokens only last ~24 hours
    // This ensures we refresh proactively before the token expires
    const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    // Check if token is still valid (with 6 hour buffer)
    if (expiresAt > sixHoursFromNow) {
      console.log('✅ Token still valid, expires:', expiresAt.toISOString());
      return integration.access_token;
    }

    console.log('🔄 Token expired or expiring within 6 hours, refreshing...');
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

  // === MUTEX: Try to acquire lock before refreshing ===
  // This prevents race conditions when multiple webhooks try to refresh simultaneously
  const lockDurationMs = 30000; // 30 second lock
  const lockUntil = new Date(Date.now() + lockDurationMs).toISOString();

  // Attempt to acquire lock using atomic update
  // Only succeeds if no lock exists or existing lock has expired
  const { data: lockResult, error: lockError } = await supabase
    .from('bike_computer_integrations')
    .update({ refresh_lock_until: lockUntil })
    .eq('id', integration.id)
    .or(`refresh_lock_until.is.null,refresh_lock_until.lt.${new Date().toISOString()}`)
    .select('id')
    .maybeSingle();

  if (lockError) {
    console.warn('⚠️ Lock acquisition query error:', lockError.message);
    // Continue without lock - better than failing entirely
  }

  if (!lockResult) {
    // Lock is held by another process - wait briefly and check if token was refreshed
    console.log('🔒 Token refresh lock held by another process, waiting...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    // Re-fetch the integration to see if token was refreshed
    const { data: refreshedIntegration } = await supabase
      .from('bike_computer_integrations')
      .select('access_token, token_expires_at')
      .eq('id', integration.id)
      .single();

    if (refreshedIntegration) {
      const newExpiresAt = new Date(refreshedIntegration.token_expires_at);
      if (newExpiresAt > new Date(Date.now() + 60000)) { // Valid for at least 1 more minute
        console.log('✅ Token was refreshed by another process');
        return refreshedIntegration.access_token;
      }
    }

    // Token still not refreshed - try to acquire lock again or proceed anyway
    console.log('⚠️ Proceeding with refresh despite lock (may cause race condition)');
  } else {
    console.log('🔒 Acquired token refresh lock');
  }

  // === Perform the actual token refresh ===
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
      // Mark refresh token as invalid so the status endpoint can show the right message
      // This prevents repeated failed refresh attempts
      console.log('🚫 Marking refresh token as invalid for integration:', integration.id);
      await supabase
        .from('bike_computer_integrations')
        .update({
          refresh_lock_until: null,
          refresh_token_invalid: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', integration.id);

      throw new Error(`Token refresh rejected (${response.status}). Refresh token may be invalid or revoked. User needs to reconnect Garmin.`);
    }

    // Release lock on failure (other errors)
    await supabase
      .from('bike_computer_integrations')
      .update({ refresh_lock_until: null })
      .eq('id', integration.id);

    throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const tokenData = await response.json();

  // Garmin tokens expire in ~24 hours, use the actual expires_in value from response
  const expiresInSeconds = tokenData.expires_in || 86400; // Default 24 hours
  const newExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  // Calculate refresh token expiration (~90 days)
  const refreshTokenExpiresInSeconds = tokenData.refresh_token_expires_in || 7776000; // Default 90 days
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenExpiresInSeconds * 1000).toISOString();

  console.log('✅ Token refreshed successfully');
  console.log('   New access token expiration:', newExpiresAt);
  console.log('   Refresh token expiration:', refreshTokenExpiresAt);

  // Update tokens in database and release lock
  const { error: updateError } = await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || integration.refresh_token,
      token_expires_at: newExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      refresh_lock_until: null, // Release lock
      refresh_token_invalid: false, // Clear invalid flag on successful refresh
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

/**
 * Mark a webhook event as processed
 * @param {string} eventId - The webhook event ID
 * @param {Object} options - Processing result options
 * @param {string} [options.error] - Error message if processing failed (actual errors only)
 * @param {string} [options.notes] - Informational notes (success messages, filtering reasons, etc.)
 * @param {string} [options.activityId] - The imported/matched activity ID
 */
async function markEventProcessed(eventId, options = {}) {
  // Support legacy call signature: markEventProcessed(eventId, errorOrNotes, activityId)
  if (typeof options === 'string' || options === null) {
    const legacyMessage = options;
    const legacyActivityId = arguments[2] || null;

    // Determine if this is an error or a note based on the message content
    const isError = legacyMessage && (
      legacyMessage.includes('failed') ||
      legacyMessage.includes('Failed') ||
      legacyMessage.includes('error') ||
      legacyMessage.includes('Error') ||
      legacyMessage.includes('Token refresh') ||
      legacyMessage.includes('No integration found') ||
      legacyMessage.includes('reconnect')
    ) && !legacyMessage.includes('Data added') && !legacyMessage.includes('took over');

    options = {
      error: isError ? legacyMessage : null,
      notes: isError ? null : legacyMessage,
      activityId: legacyActivityId
    };
  }

  const { error = null, notes = null, activityId = null } = options;

  await supabase
    .from('garmin_webhook_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      process_error: error,
      process_notes: notes,
      activity_imported_id: activityId
    })
    .eq('id', eventId);
}

/**
 * Request activity backfill from Garmin for a specific activity
 * This triggers Garmin to send PING notifications including activityFiles with FIT file callbackURL
 *
 * Called when we receive a PUSH notification without GPS data.
 *
 * IMPORTANT from Garmin API docs (Section 8 - Summary Backfill):
 * - There is NO /backfill/activityFiles endpoint (returns 404)
 * - /backfill/activities handles BOTH activity summaries AND activity files
 * - Quote: "Resource URL for activity summaries and activity files"
 * - Garmin sends activityFiles PING notification with callbackURL for FIT download
 * - The callbackURL is valid for 24 hours only
 * - Duplicate downloads are rejected with HTTP 410
 *
 * @param {string} accessToken - Valid Garmin access token
 * @param {number} startTimeInSeconds - Activity start time (epoch seconds)
 * @returns {Promise<boolean>} - true if backfill was requested successfully
 */
async function requestActivityDetailsBackfill(accessToken, startTimeInSeconds) {
  try {
    if (!startTimeInSeconds || !accessToken) {
      console.log('ℹ️ Cannot request backfill: missing startTime or accessToken');
      return false;
    }

    // Request a small time window around the activity (±1 hour)
    // This minimizes the backfill scope while ensuring we get the activity
    const startTimestamp = startTimeInSeconds - 3600; // 1 hour before
    const endTimestamp = startTimeInSeconds + 7200;   // 2 hours after (covers long activities)

    // Use /backfill/activities - this is the ONLY backfill endpoint for activity files
    // Per Garmin docs Section 8: "Resource URL for activity summaries and activity files"
    // This will trigger activityFiles PING notifications with callbackURL for FIT download
    const backfillUrl = `https://apis.garmin.com/wellness-api/rest/backfill/activities?summaryStartTimeInSeconds=${startTimestamp}&summaryEndTimeInSeconds=${endTimestamp}`;

    console.log('📤 Requesting activity backfill (includes FIT files via PING)...');
    console.log(`   Time range: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`);

    const response = await fetch(backfillUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    // 202 = Accepted, backfill will be sent via webhook (PING for files)
    // 409 = Already requested (duplicate request for same time range)
    if (response.status === 202 || response.status === 409 || response.ok) {
      console.log('✅ Activity backfill requested - activityFiles PING will arrive with FIT callbackURL');
      return true;
    }

    // Log but don't throw - this is a best-effort enhancement
    const errorText = await response.text();
    console.warn('⚠️ Activity backfill request failed:', response.status, errorText.substring(0, 100));
    return false;

  } catch (error) {
    // Never throw - this is optional functionality
    console.warn('⚠️ Could not request activity backfill:', error.message);
    return false;
  }
}

/**
 * Check if an activity type should be filtered out (health/monitoring data, not real workouts)
 * Returns true if the activity should be SKIPPED as an activity import
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
 * Extract health metrics from activity data and save to health_metrics table
 * This captures useful data from health/monitoring activities for Body Check-in
 */
async function extractAndSaveHealthMetrics(userId, activityInfo) {
  try {
    // Extract the date from the activity
    const activityDate = activityInfo.startTimeInSeconds
      ? new Date(activityInfo.startTimeInSeconds * 1000)
      : new Date();
    const metricDate = activityDate.toISOString().split('T')[0];

    // Extract any health-relevant metrics from the activity data
    const healthData = {
      user_id: userId,
      metric_date: metricDate,
      source: 'garmin',
      updated_at: new Date().toISOString()
    };

    let hasData = false;

    // Heart rate data
    if (activityInfo.averageHeartRateInBeatsPerMinute || activityInfo.averageHeartRate) {
      // Could be used for resting HR estimate from sedentary periods
      const avgHR = activityInfo.averageHeartRateInBeatsPerMinute || activityInfo.averageHeartRate;
      // Only use as resting HR if it's from a sedentary/monitoring activity
      const activityType = (activityInfo.activityType || '').toLowerCase();
      if (['sedentary', 'monitoring', 'all_day_tracking'].includes(activityType) && avgHR < 100) {
        healthData.resting_hr = avgHR;
        hasData = true;
      }
    }

    // Stress data (if available in activity)
    if (activityInfo.averageStressLevel != null) {
      // Convert to 1-5 scale (Garmin uses 0-100)
      healthData.stress_level = Math.max(1, Math.min(5, Math.round(activityInfo.averageStressLevel / 20)));
      hasData = true;
    }

    // Body battery (if available)
    if (activityInfo.bodyBatteryChargedValue != null) {
      healthData.body_battery = activityInfo.bodyBatteryChargedValue;
      hasData = true;
    }

    // Calories burned (could contribute to daily energy expenditure)
    if (activityInfo.activeKilocalories) {
      // Store as additional data - might be useful for energy tracking
      console.log(`📊 Health activity calories: ${activityInfo.activeKilocalories} kcal`);
    }

    // Only save if we have meaningful health data
    if (!hasData) {
      console.log('ℹ️ No health metrics to extract from activity');
      return false;
    }

    console.log(`💚 Extracting health metrics for ${metricDate}:`, {
      resting_hr: healthData.resting_hr,
      stress_level: healthData.stress_level,
      body_battery: healthData.body_battery
    });

    // Upsert to health_metrics table
    const { error } = await supabase
      .from('health_metrics')
      .upsert(healthData, { onConflict: 'user_id,metric_date' });

    if (error) {
      console.error('❌ Error saving health metrics from activity:', error);
      return false;
    }

    console.log(`✅ Health metrics saved to Body Check-in for ${metricDate}`);
    return true;

  } catch (err) {
    console.error('❌ Error extracting health metrics:', err);
    return false;
  }
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

  // Normalize: lowercase and replace spaces with underscores for matching
  const lowerType = (garminType || '').toLowerCase().replace(/ /g, '_');

  // Return mapped type, or 'Workout' as a generic fallback (NOT 'Ride')
  return typeMap[lowerType] || 'Workout';
}

/**
 * Build activity data object with only columns that exist in the schema
 * This prevents insert failures due to unknown columns
 * Centralized here to ensure all activity inserts use the same safe column list
 */
function buildActivityData(userId, activityId, activityInfo, source = 'webhook') {
  // These are the ONLY columns that exist in the activities table
  // If a column doesn't exist in the schema, don't include it here

  // Garmin uses different field names in different contexts:
  // - Webhook PUSH: elevationGainInMeters, averageBikingPowerInWatts
  // - API response: totalElevationGainInMeters, avgPower
  // - Various: totalElevationGain, averagePower

  const safeData = {
    user_id: userId,
    provider: 'garmin',
    provider_activity_id: activityId,
    name: activityInfo.activityName ||
          activityInfo.activityDescription ||
          generateActivityName(activityInfo.activityType, activityInfo.startTimeInSeconds),
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
