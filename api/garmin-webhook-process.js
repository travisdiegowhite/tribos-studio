// Vercel API Route: Garmin Webhook Event Processor (Cron)
// Processes unprocessed events stored by the webhook handler.
// Runs every minute via Vercel cron.
//
// Retry strategy: exponential backoff (1m, 2m, 4m, 8m, 16m, 32m)
// Max retries: 6 (gives up after ~1 hour of failures)

import { createClient } from '@supabase/supabase-js';
import { downloadAndParseFitFile } from './utils/fitParser.js';
import { checkForDuplicate, takeoverActivity, mergeActivityData } from './utils/activityDedup.js';
import { updateBackfillChunkIfApplicable } from './utils/garminBackfill.js';
import { extractAndStoreActivitySegments } from './utils/roadSegmentExtractor.js';

import { parseWebhookPayload } from './utils/garmin/webhookPayloadParser.js';
import { shouldFilterActivityType, hasMinimumActivityMetrics } from './utils/garmin/activityFilters.js';
import { buildActivityData } from './utils/garmin/activityBuilder.js';
import { fetchGarminActivityDetails, requestActivityDetailsBackfill } from './utils/garmin/garminApiClient.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';
import { processHealthPushData, extractAndSaveHealthMetrics } from './utils/garmin/healthDataProcessor.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_RETRIES = 6;
const BATCH_SIZE = 10;

export default async function handler(req, res) {
  // Verify cron authorization
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const cronSecret = process.env.CRON_SECRET;
  const isValidSecret = cronSecret && req.headers.authorization === `Bearer ${cronSecret}`;

  if (!isVercelCron && !isValidSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== Garmin Webhook Processor Started ===');

  const results = { processed: 0, failed: 0, skipped: 0, retried: 0 };

  try {
    // Fetch unprocessed events that are ready for processing
    // - Not yet processed
    // - Either never tried (next_retry_at is null) or retry time has arrived
    // - Not exceeded max retries
    // - Within last 24 hours (don't process ancient events)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: events, error: queryError } = await supabase
      .from('garmin_webhook_events')
      .select('*')
      .eq('processed', false)
      .lt('retry_count', MAX_RETRIES)
      .gte('created_at', cutoff)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (queryError) {
      console.error('Failed to query events:', queryError);
      return res.status(500).json({ error: 'Query failed', details: queryError.message });
    }

    if (!events || events.length === 0) {
      console.log('No events to process');
      return res.status(200).json({ success: true, message: 'No events to process', ...results });
    }

    console.log(`Found ${events.length} events to process`);

    for (const event of events) {
      try {
        // Health events
        if (event.event_type?.startsWith('HEALTH_')) {
          await processHealthEvent(event);
          results.processed++;
          continue;
        }

        // Activity events
        await processActivityEvent(event);
        results.processed++;
      } catch (err) {
        console.error(`❌ Failed to process event ${event.id}:`, err.message);
        results.failed++;

        // Schedule retry with exponential backoff
        const newRetryCount = (event.retry_count || 0) + 1;
        if (newRetryCount < MAX_RETRIES) {
          const backoffMinutes = Math.pow(2, newRetryCount - 1); // 1, 2, 4, 8, 16, 32 minutes
          const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

          await supabase
            .from('garmin_webhook_events')
            .update({
              retry_count: newRetryCount,
              next_retry_at: nextRetryAt,
              process_error: err.message
            })
            .eq('id', event.id);

          console.log(`🔄 Scheduled retry ${newRetryCount}/${MAX_RETRIES} in ${backoffMinutes}m for event ${event.id}`);
          results.retried++;
        } else {
          // Max retries exceeded - mark as permanently failed
          await markEventProcessed(event.id, `Max retries (${MAX_RETRIES}) exceeded. Last error: ${err.message}`);
          console.log(`💀 Event ${event.id} permanently failed after ${MAX_RETRIES} retries`);
        }
      }
    }

    console.log('=== Garmin Webhook Processor Complete ===');
    console.log(`Processed: ${results.processed}, Failed: ${results.failed}, Retried: ${results.retried}`);

    return res.status(200).json({ success: true, ...results });

  } catch (error) {
    console.error('Processor error:', error);
    return res.status(500).json({ error: 'Processor failed', details: error.message });
  }
}

// ============================================================================
// HEALTH EVENT PROCESSING
// ============================================================================

async function processHealthEvent(event) {
  const healthType = event.event_type.replace('HEALTH_', '');
  const payload = event.payload;

  const allItems = payload[healthType];
  if (!allItems?.length) {
    await markEventProcessed(event.id, `No ${healthType} data in payload`);
    return;
  }

  // Use batch_index to process only the specific item for this event
  // (each item in a batch was stored as a separate event by the webhook handler)
  const idx = event.batch_index || 0;
  const item = allItems[idx];
  if (!item) {
    await markEventProcessed(event.id, `No item at batch_index ${idx}`);
    return;
  }

  // Look up integration to populate user_id/integration_id on the event (audit trail)
  if (item.userId) {
    const { data: integration } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id')
      .eq('provider', 'garmin')
      .eq('provider_user_id', item.userId)
      .maybeSingle();

    if (integration) {
      await supabase
        .from('garmin_webhook_events')
        .update({ user_id: integration.user_id, integration_id: integration.id })
        .eq('id', event.id);
    }
  }

  // Process the single item and capture what was saved
  const summary = await processHealthPushData(healthType, [item], supabase);
  const resultMsg = summary.results.length > 0 ? summary.results.join('; ') : null;

  await markEventProcessed(event.id, resultMsg);
  console.log(`✅ Health event processed: ${healthType}`, resultMsg || '(no detail)');
}

// ============================================================================
// ACTIVITY EVENT PROCESSING
// ============================================================================

async function processActivityEvent(event) {
  // Find integration
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
    await markEventProcessed(event.id, `No integration found for Garmin user ID: ${event.garmin_user_id}. User needs to reconnect Garmin.`);
    return;
  }

  // Update event with user info
  await supabase
    .from('garmin_webhook_events')
    .update({ user_id: integration.user_id, integration_id: integration.id })
    .eq('id', event.id);

  // Refresh token if needed
  const validToken = await ensureValidAccessToken(integration, supabase);
  if (validToken !== integration.access_token) {
    integration.access_token = validToken;
    console.log('✅ Token refreshed proactively');
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
      await handleExistingActivity(event, existing, integration);
      return;
    }
  }

  // Process new activity
  await downloadAndProcessActivity(event, integration);

  // Update integration last sync
  await supabase
    .from('bike_computer_integrations')
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', integration.id);
}

async function handleExistingActivity(event, existing, integration) {
  const fitFileUrl = event.file_url;
  const needsGps = !existing.map_summary_polyline;
  const needsAvgPower = !existing.average_watts;
  const needsPowerMetrics = !existing.normalized_power && !existing.power_curve_summary;
  const needsFitData = (needsGps || needsPowerMetrics || needsAvgPower) && fitFileUrl;

  if (!needsFitData) {
    await markEventProcessed(event.id, 'Already imported', existing.id);
    return;
  }

  console.log('📍 Activity exists but missing data, attempting FIT file download:', event.activity_id);
  const fitResult = await downloadAndParseFitFile(fitFileUrl, integration.access_token);

  const activityUpdate = { updated_at: new Date().toISOString() };
  const updates = [];

  if (needsGps && fitResult.polyline) {
    activityUpdate.map_summary_polyline = fitResult.polyline;
    updates.push(`GPS: ${fitResult.simplifiedCount} points`);
  }

  if (fitResult.activityStreams) {
    activityUpdate.activity_streams = fitResult.activityStreams;
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
      if (pm.workKj) activityUpdate.kilojoules = pm.workKj;
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
      throw new Error(`Update failed: ${updateError.message}`);
    }
    console.log(`✅ Data added to existing activity: ${updates.join(', ')}`);
    await markEventProcessed(event.id, `Data added: ${updates.join(', ')}`, existing.id);
  } else {
    await markEventProcessed(event.id, 'Already imported, no new data in FIT file', existing.id);
  }
}

async function downloadAndProcessActivity(event, integration) {
  const payload = event.payload;
  const parsed = parseWebhookPayload(payload);

  let webhookInfo = null;
  let isPushNotification = false;

  if (parsed.items.length > 0) {
    // Use batch_index to find the correct item from the batch
    const idx = event.batch_index || 0;
    webhookInfo = parsed.items[idx] || parsed.items[0];
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
    isPushNotification,
    batchIndex: event.batch_index
  });

  // FILTER 1: Health/monitoring activity types
  if (shouldFilterActivityType(activityType)) {
    const savedHealthData = await extractAndSaveHealthMetrics(integration.user_id, webhookInfo || {}, supabase);
    const message = savedHealthData
      ? `Health activity "${activityType}" - metrics saved`
      : `Health activity "${activityType}" - no metrics`;
    await markEventProcessed(event.id, message);
    return;
  }

  // FILTER 2: Minimum metrics
  if (!hasMinimumActivityMetrics(webhookInfo || {})) {
    await extractAndSaveHealthMetrics(integration.user_id, webhookInfo || {}, supabase);
    await markEventProcessed(event.id, 'Filtered: activity too short');
    return;
  }

  // Fetch from API if needed
  let activityDetails = null;
  const hasSufficientData = webhookInfo &&
    (webhookInfo.distanceInMeters || webhookInfo.durationInSeconds || webhookInfo.startTimeInSeconds);

  if (!isPushNotification && integration.access_token && summaryId) {
    activityDetails = await fetchGarminActivityDetails(integration.access_token, summaryId);
  } else if (!hasSufficientData && integration.access_token && summaryId) {
    activityDetails = await fetchGarminActivityDetails(integration.access_token, summaryId);
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

  // Insert activity
  const { data: activity, error: insertError } = await supabase
    .from('activities')
    .insert(activityData)
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  console.log('✅ Activity imported:', {
    id: activity.id,
    name: activity.name,
    type: activity.type,
    distance: activity.distance ? `${(activity.distance / 1000).toFixed(2)} km` : 'N/A',
    duration: activity.moving_time ? `${Math.round(activity.moving_time / 60)} min` : 'N/A',
    avgPower: activity.average_watts ? `${Math.round(activity.average_watts)}W` : 'N/A',
    dataSource: activityDetails ? 'Garmin API' : 'Webhook only'
  });

  if (activityInfo.startTimeInSeconds) {
    await updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
  }

  // FIT file processing
  const fitFileUrl = event.file_url || webhookInfo?.callbackURL;
  if (fitFileUrl && integration.access_token) {
    await processFitFile(activity.id, fitFileUrl, integration.access_token);
  } else {
    // Request backfill for outdoor activities without FIT URL
    const isIndoorActivity = activityData.trainer === true ||
      (activityInfo.activityType || '').toLowerCase().includes('indoor') ||
      (activityInfo.activityType || '').toLowerCase().includes('virtual');

    if (!isIndoorActivity && activityInfo.startTimeInSeconds) {
      await requestActivityDetailsBackfill(integration.access_token, activityInfo.startTimeInSeconds);
    }
  }

  await supabase
    .from('garmin_webhook_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      activity_imported_id: activity.id
    })
    .eq('id', event.id);
}

async function handleDuplicateActivity(event, integration, activityData, activityInfo, dupCheck, webhookInfo) {
  if (dupCheck.shouldTakeover) {
    console.log('🔄 Garmin taking over from', dupCheck.existingActivity.provider);

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
            if (fitResult.activityStreams) fitUpdate.activity_streams = fitResult.activityStreams;
            if (fitResult.powerMetrics?.avgPower) fitUpdate.average_watts = fitResult.powerMetrics.avgPower;
            if (fitResult.powerMetrics?.normalizedPower) fitUpdate.normalized_power = fitResult.powerMetrics.normalizedPower;
            if (fitResult.powerMetrics?.maxPower) fitUpdate.max_watts = fitResult.powerMetrics.maxPower;
            if (fitResult.powerMetrics?.powerCurveSummary) fitUpdate.power_curve_summary = fitResult.powerMetrics.powerCurveSummary;
            if (fitResult.powerMetrics?.workKj) fitUpdate.kilojoules = fitResult.powerMetrics.workKj;
            fitUpdate.device_watts = true;

            await supabase
              .from('activities')
              .update(fitUpdate)
              .eq('id', dupCheck.existingActivity.id);
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
  try {
    const fitResult = await downloadAndParseFitFile(fitFileUrl, accessToken);

    const activityUpdate = { updated_at: new Date().toISOString() };

    if (fitResult.polyline) {
      activityUpdate.map_summary_polyline = fitResult.polyline;
    }

    if (fitResult.activityStreams) {
      activityUpdate.activity_streams = fitResult.activityStreams;
    }

    if (fitResult.powerMetrics) {
      const pm = fitResult.powerMetrics;
      if (pm.avgPower) activityUpdate.average_watts = pm.avgPower;
      if (pm.normalizedPower) activityUpdate.normalized_power = pm.normalizedPower;
      if (pm.maxPower) activityUpdate.max_watts = pm.maxPower;
      if (pm.trainingStressScore) activityUpdate.tss = pm.trainingStressScore;
      if (pm.intensityFactor) activityUpdate.intensity_factor = pm.intensityFactor;
      if (pm.powerCurveSummary) activityUpdate.power_curve_summary = pm.powerCurveSummary;
      if (pm.workKj) activityUpdate.kilojoules = pm.workKj;
      activityUpdate.device_watts = true;

      console.log(`⚡ Power metrics from FIT: Avg=${pm.avgPower}W, NP=${pm.normalizedPower}W, Max=${pm.maxPower}W, Work=${pm.workKj}kJ`);
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
        console.log(`✅ FIT data saved: ${updates.join(', ')}`);

        if (fitResult.polyline) {
          extractAndStoreActivitySegments(activityId, null).catch(err => {
            console.warn(`⚠️ Segment extraction failed:`, err.message);
          });
        }
      }
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
