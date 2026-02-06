// Vercel API Route: Garmin Activity Webhook Handler
// Receives push notifications when users sync Garmin devices
// Documentation: https://developer.garmin.com/gc-developer-program/activity-api/
//
// CRITICAL: Garmin requires webhook responses within 5 seconds.
// This handler prioritizes fast response, then processes asynchronously.

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';
import { downloadAndParseFitFile } from './utils/fitParser.js';
import { checkForDuplicate, takeoverActivity, mergeActivityData } from './utils/activityDedup.js';
import { updateBackfillChunkIfApplicable } from './utils/garminBackfill.js';
import { extractAndStoreActivitySegments } from './utils/roadSegmentExtractor.js';

// Extracted modules
import { verifySignature, getSignatureFromHeaders } from './utils/garmin/signatureVerifier.js';
import { parseWebhookPayload, extractActivityFields } from './utils/garmin/webhookPayloadParser.js';
import { shouldFilterActivityType, hasMinimumActivityMetrics } from './utils/garmin/activityFilters.js';
import { buildActivityData } from './utils/garmin/activityBuilder.js';
import { fetchGarminActivityDetails, requestActivityDetailsBackfill } from './utils/garmin/garminApiClient.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';
import { processHealthPushData, extractAndSaveHealthMetrics } from './utils/garmin/healthDataProcessor.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Security Configuration
const WEBHOOK_SECRET = process.env.GARMIN_WEBHOOK_SECRET;

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
    return res.status(200).json({
      status: 'ok',
      service: 'garmin-webhook-handler',
      version: '2.1.0',
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

  // Webhook signature verification
  const sigResult = verifySignature(
    WEBHOOK_SECRET,
    getSignatureFromHeaders(req.headers),
    JSON.stringify(req.body)
  );
  if (!sigResult.valid) {
    console.warn(`${sigResult.error} from:`, clientIP);
    return res.status(401).json({ error: sigResult.error });
  }

  try {
    lastWebhookReceived = new Date().toISOString();

    const webhookData = req.body;
    const parsed = parseWebhookPayload(webhookData);

    // Health data push notifications
    if (parsed.type === 'HEALTH') {
      console.log('📥 Garmin Health Push received:', {
        type: parsed.healthType,
        count: parsed.items.length,
        ip: clientIP,
        timestamp: lastWebhookReceived
      });

      try {
        await processHealthPushData(parsed.healthType, parsed.items, supabase);
        console.log('✅ Health data processed successfully');
      } catch (err) {
        console.error('❌ Health data processing error:', err);
      }

      return res.status(200).json({
        success: true,
        message: `Health data received and processed: ${parsed.healthType}`,
        count: parsed.items.length
      });
    }

    // Activity webhooks - process each item in the batch
    const eventIds = [];
    for (const item of parsed.items) {
      const { userId, activityId, fileUrl } = extractActivityFields(item, webhookData);

      console.log('📥 Garmin webhook received:', {
        webhookType: parsed.type,
        userId,
        activityId,
        hasFileUrl: !!fileUrl,
        ip: clientIP,
        timestamp: lastWebhookReceived
      });

      if (!userId) {
        console.warn('🚫 Missing userId in webhook payload item');
        continue;
      }

      // Duplicate check
      if (activityId) {
        const { data: existingEvent } = await supabase
          .from('garmin_webhook_events')
          .select('id, file_url')
          .eq('activity_id', activityId)
          .eq('garmin_user_id', userId)
          .maybeSingle();

        if (existingEvent) {
          const hasNewFileUrl = fileUrl && !existingEvent.file_url;
          const isFileDataWebhook = parsed.type === 'ACTIVITY_FILE_DATA';

          if (isFileDataWebhook && hasNewFileUrl) {
            console.log('📍 ACTIVITY_FILE_DATA received for existing activity, updating with FIT URL:', activityId);
            await supabase
              .from('garmin_webhook_events')
              .update({ file_url: fileUrl, processed: false, process_error: null })
              .eq('id', existingEvent.id);

            try {
              await processWebhookEvent(existingEvent.id);
              console.log('✅ GPS data processed from ACTIVITY_FILE_DATA webhook');
            } catch (err) {
              console.error('❌ GPS processing error:', err.message);
            }

            eventIds.push(existingEvent.id);
          } else {
            console.log('ℹ️ Duplicate webhook ignored:', activityId);
          }
          continue;
        }
      }

      // Store webhook event
      const { data: event, error: eventError } = await supabase
        .from('garmin_webhook_events')
        .insert({
          event_type: parsed.type,
          garmin_user_id: userId,
          activity_id: activityId,
          file_url: fileUrl,
          file_type: webhookData.fileType || item.fileType || 'FIT',
          upload_timestamp: webhookData.uploadTimestamp ||
            (item.startTimeInSeconds ? new Date(item.startTimeInSeconds * 1000).toISOString() : null) ||
            (webhookData.startTimeInSeconds ? new Date(webhookData.startTimeInSeconds * 1000).toISOString() : null),
          payload: webhookData,
          processed: false
        })
        .select()
        .single();

      if (eventError) {
        console.error('Error storing webhook event:', eventError);
        console.error('Failed payload:', JSON.stringify(webhookData));
        continue;
      }

      console.log('✅ Webhook event stored:', event.id);
      eventIds.push(event.id);

      // Process synchronously (Vercel terminates after response)
      try {
        await processWebhookEvent(event.id);
        console.log('✅ Webhook processed successfully:', event.id);
      } catch (err) {
        console.error('❌ Webhook processing error:', err);
      }
    }

    return res.status(200).json({
      success: true,
      eventIds,
      message: `Webhook received and processed (${eventIds.length} events)`
    });

  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(200).json({
      success: false,
      error: 'Webhook processing failed',
      message: 'Event acknowledged but processing failed'
    });
  }
}

// ============================================================================
// EVENT PROCESSING
// ============================================================================

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
      await markEventProcessed(eventId, `No integration found for Garmin user ID: ${event.garmin_user_id}. User needs to reconnect Garmin.`);
      return;
    }

    // Update event with user info
    await supabase
      .from('garmin_webhook_events')
      .update({ user_id: integration.user_id, integration_id: integration.id })
      .eq('id', eventId);

    // Proactively check and refresh token
    try {
      const validToken = await ensureValidAccessToken(integration, supabase);
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
        await handleExistingActivity(eventId, event, existing, integration);
        return;
      }
    }

    // Download and process activity
    await downloadAndProcessActivity(event, integration);

    // Update integration last sync timestamp
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

async function handleExistingActivity(eventId, event, existing, integration) {
  const fitFileUrl = event.file_url;
  const needsGps = !existing.map_summary_polyline;
  const needsAvgPower = !existing.average_watts;
  const needsPowerMetrics = !existing.normalized_power && !existing.power_curve_summary;
  const needsFitData = (needsGps || needsPowerMetrics || needsAvgPower) && fitFileUrl;

  if (needsFitData) {
    console.log('📍 Activity exists but missing data, attempting FIT file download:', event.activity_id);
    try {
      const fitResult = await downloadAndParseFitFile(fitFileUrl, integration.access_token);

      const activityUpdate = { updated_at: new Date().toISOString() };
      const updates = [];

      if (needsGps && fitResult.polyline) {
        activityUpdate.map_summary_polyline = fitResult.polyline;
        updates.push(`GPS: ${fitResult.simplifiedCount} points`);
      }

      if (fitResult.powerMetrics) {
        const pm = fitResult.powerMetrics;
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
}

async function downloadAndProcessActivity(event, integration) {
  try {
    const payload = event.payload;
    const parsed = parseWebhookPayload(payload);

    let webhookInfo = null;
    let isPushNotification = false;

    if (parsed.items.length > 0) {
      webhookInfo = parsed.items[0];
      isPushNotification = parsed.isPush !== false;
    } else {
      webhookInfo = payload;
      isPushNotification = true;
    }

    const summaryId = webhookInfo?.summaryId || event.activity_id;
    const activityType = webhookInfo?.activityType;

    console.log('📥 Processing Garmin activity:', {
      activityId: event.activity_id,
      summaryId,
      activityType,
      activityName: webhookInfo?.activityName,
      isPushNotification,
      hasAccessToken: !!integration.access_token,
      duration: webhookInfo?.durationInSeconds || webhookInfo?.movingDurationInSeconds,
      distance: webhookInfo?.distanceInMeters
    });

    // FILTER 1: Health/monitoring activity types
    if (shouldFilterActivityType(activityType)) {
      console.log('💚 Health/monitoring activity detected:', activityType);
      const savedHealthData = await extractAndSaveHealthMetrics(integration.user_id, webhookInfo || {}, supabase);
      const message = savedHealthData
        ? `Health activity "${activityType}" - metrics saved to Body Check-in`
        : `Health activity "${activityType}" - no metrics to extract`;
      console.log('⏭️ Skipping activity import (health data handled separately)');
      await markEventProcessed(event.id, message);
      return;
    }

    // FILTER 2: Minimum metrics
    if (!hasMinimumActivityMetrics(webhookInfo || {})) {
      console.log('⏭️ Activity too short for import:', {
        type: activityType,
        duration: webhookInfo?.durationInSeconds || webhookInfo?.movingDurationInSeconds || 0,
        distance: webhookInfo?.distanceInMeters || 0
      });
      await extractAndSaveHealthMetrics(integration.user_id, webhookInfo || {}, supabase);
      await markEventProcessed(event.id, `Filtered: activity too short, any health data saved`);
      return;
    }

    // Fetch activity details from API if needed
    let activityDetails = null;
    const hasSufficientData = webhookInfo &&
      (webhookInfo.distanceInMeters || webhookInfo.durationInSeconds || webhookInfo.startTimeInSeconds);

    if (!isPushNotification && integration.access_token && summaryId) {
      console.log('📥 Fetching activity details from API for ACTIVITY_FILE_DATA...');
      activityDetails = await fetchGarminActivityDetails(integration.access_token, summaryId);
    } else if (!hasSufficientData && integration.access_token && summaryId) {
      console.log('📥 Fetching additional data from Garmin API...');
      activityDetails = await fetchGarminActivityDetails(integration.access_token, summaryId);
    } else {
      console.log('✅ Using webhook payload data directly (PUSH notification)');
    }

    const activityInfo = activityDetails || webhookInfo || {};

    // Build activity data
    const source = activityDetails ? 'webhook_with_api' : 'webhook_push';
    const activityData = buildActivityData(integration.user_id, event.activity_id, activityInfo, source);
    activityData.raw_data = { webhook: payload, api: activityDetails };

    // Cross-provider duplicate check
    const dupCheck = await checkForDuplicate(
      integration.user_id,
      activityData.start_date,
      activityData.distance,
      'garmin',
      event.activity_id
    );

    if (dupCheck.isDuplicate) {
      await handleDuplicateActivity(event, integration, activityData, activityInfo, dupCheck, webhookInfo);
      return;
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

    if (activityInfo.startTimeInSeconds) {
      await updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
    }

    // Try to download and parse FIT file for GPS/power data
    const fitFileUrl = event.file_url || webhookInfo?.callbackURL;

    if (fitFileUrl && integration.access_token) {
      await processFitFile(activity.id, fitFileUrl, integration.access_token);
    } else {
      console.log('ℹ️ No FIT file URL available for GPS extraction');

      const isIndoorActivity = activityData.trainer === true ||
        (activityInfo.activityType || '').toLowerCase().includes('indoor') ||
        (activityInfo.activityType || '').toLowerCase().includes('virtual');

      if (!isIndoorActivity && activityInfo.startTimeInSeconds) {
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

async function handleDuplicateActivity(event, integration, activityData, activityInfo, dupCheck, webhookInfo) {
  if (dupCheck.shouldTakeover) {
    console.log('🔄 Cross-provider duplicate: Garmin taking over from', dupCheck.existingActivity.provider);

    const result = await takeoverActivity(
      dupCheck.existingActivity.id,
      activityData,
      'garmin',
      event.activity_id
    );

    if (result.success) {
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

      if (activityInfo.startTimeInSeconds) {
        await updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
      }
      await markEventProcessed(event.id, `Garmin took over from ${dupCheck.existingActivity.provider}`, dupCheck.existingActivity.id);
    } else {
      await markEventProcessed(event.id, `Takeover failed: ${result.error}`, dupCheck.existingActivity.id);
    }
  } else {
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
    if (activityInfo.startTimeInSeconds) {
      await updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
    }
    await markEventProcessed(event.id, dupCheck.reason, dupCheck.existingActivity.id);
  }
}

async function processFitFile(activityId, fitFileUrl, accessToken) {
  console.log('🗺️ Attempting to extract GPS data from FIT file...');

  try {
    const fitResult = await downloadAndParseFitFile(fitFileUrl, accessToken);

    const activityUpdate = { updated_at: new Date().toISOString() };

    if (fitResult.polyline) {
      activityUpdate.map_summary_polyline = fitResult.polyline;
    }

    if (fitResult.powerMetrics) {
      const pm = fitResult.powerMetrics;
      if (pm.avgPower) activityUpdate.average_watts = pm.avgPower;
      if (pm.normalizedPower) activityUpdate.normalized_power = pm.normalizedPower;
      if (pm.maxPower) activityUpdate.max_watts = pm.maxPower;
      if (pm.trainingStressScore) activityUpdate.tss = pm.trainingStressScore;
      if (pm.intensityFactor) activityUpdate.intensity_factor = pm.intensityFactor;
      if (pm.powerCurveSummary) activityUpdate.power_curve_summary = pm.powerCurveSummary;
      activityUpdate.device_watts = true;

      console.log(`⚡ Power metrics from FIT: Avg=${pm.avgPower}W, NP=${pm.normalizedPower}W, Max=${pm.maxPower}W, TSS=${pm.trainingStressScore || 'N/A'}`);
    }

    if (Object.keys(activityUpdate).length > 1) {
      const { error: updateError } = await supabase
        .from('activities')
        .update(activityUpdate)
        .eq('id', activityId);

      if (updateError) {
        console.error('❌ Failed to save FIT data:', updateError);
      } else {
        const updates = [];
        if (fitResult.polyline) updates.push(`GPS: ${fitResult.simplifiedCount} points`);
        if (fitResult.powerMetrics?.normalizedPower) updates.push(`NP: ${fitResult.powerMetrics.normalizedPower}W`);
        if (fitResult.powerMetrics?.powerCurveSummary) updates.push(`Power curve: ${Object.keys(fitResult.powerMetrics.powerCurveSummary).length} points`);
        console.log(`✅ FIT data saved: ${updates.join(', ')}`);

        if (fitResult.polyline) {
          extractAndStoreActivitySegments(activityId, null).catch(err => {
            console.warn(`⚠️ Segment extraction failed for activity ${activityId}:`, err.message);
          });
        }
      }
    } else if (fitResult.error) {
      console.log('⚠️ Could not extract data from FIT:', fitResult.error);
    } else {
      console.log('ℹ️ No GPS or power data in FIT file (indoor activity without power?)');
    }
  } catch (fitError) {
    console.error('⚠️ FIT file processing failed (activity still saved):', fitError.message);
  }
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
