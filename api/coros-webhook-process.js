// Vercel API Route: COROS Webhook Event Processor (Cron)
// Processes unprocessed events stored by the webhook handler.
// Runs every 2 minutes via Vercel cron.
//
// Retry strategy: exponential backoff (1m, 2m, 4m, 8m, 16m, 32m)
// Max retries: 6 (gives up after ~1 hour of failures)

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { checkForDuplicate, mergeActivityData } from './utils/activityDedup.js';
import { completeActivationStep, enqueueProactiveInsight } from './utils/activation.js';
import { buildCorosActivityData } from './utils/coros/activityBuilder.js';

const supabase = getSupabaseAdmin();

const MAX_RETRIES = 6;
const BATCH_SIZE = 20;

export default async function handler(req, res) {
  // Verify cron authorization (timing-safe)
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== COROS Webhook Processor Started ===');

  const results = { processed: 0, failed: 0, skipped: 0, retried: 0 };

  try {
    // Fetch unprocessed events that are ready for processing
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: events, error: queryError } = await supabase
      .from('coros_webhook_events')
      .select('*')
      .eq('processed', false)
      .lt('retry_count', MAX_RETRIES)
      .gte('created_at', cutoff)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (queryError) {
      console.error('Failed to query COROS events:', queryError);
      return res.status(500).json({ error: 'Query failed', details: queryError.message });
    }

    if (!events || events.length === 0) {
      console.log('No COROS events to process');
      return res.status(200).json({ success: true, message: 'No events to process', ...results });
    }

    console.log(`Found ${events.length} COROS events to process`);

    // Cache integration lookups per batch to avoid repeated queries for the same user
    const integrationCache = new Map();

    for (const event of events) {
      try {
        await processWorkoutEvent(event, results, integrationCache);
      } catch (error) {
        console.error(`Error processing COROS event ${event.id}:`, error.message);
        await scheduleRetry(event, error.message);
        results.failed++;
      }
    }

    console.log('=== COROS Webhook Processor Complete ===', results);

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('COROS processor error:', error);
    return res.status(500).json({
      error: 'Processing failed',
      details: error.message
    });
  }
}

/**
 * Process a single COROS workout webhook event
 */
async function processWorkoutEvent(event, results, integrationCache) {
  const workout = event.payload;
  const corosUserId = event.coros_user_id;

  // Look up our user (cached per batch to avoid repeated lookups for same user)
  let userId = event.user_id;
  if (!userId) {
    let integration = integrationCache.get(corosUserId);
    if (integration === undefined) {
      const { data } = await supabase
        .from('bike_computer_integrations')
        .select('user_id, id')
        .eq('provider', 'coros')
        .eq('provider_user_id', corosUserId)
        .maybeSingle();
      integration = data || null;
      integrationCache.set(corosUserId, integration);
    }

    if (!integration) {
      console.warn(`No COROS integration found for openId: ${corosUserId}`);
      await markEventProcessed(event.id, null, 'No matching integration found');
      results.skipped++;
      return;
    }

    userId = integration.user_id;

    // Update event with user_id for future reference
    await supabase
      .from('coros_webhook_events')
      .update({ user_id: userId, integration_id: integration.id })
      .eq('id', event.id);
  }

  const activityId = workout.labelId || event.workout_id;
  if (!activityId) {
    await markEventProcessed(event.id, null, 'No workout ID in payload');
    results.skipped++;
    return;
  }

  // Check for duplicate activities
  const dupCheck = await checkForDuplicate(
    userId,
    'coros',
    activityId,
    workout.startTime ? new Date(workout.startTime * 1000) : null,
    workout.distance || null
  );

  if (dupCheck.isDuplicate) {
    if (dupCheck.shouldMerge && dupCheck.existingActivity) {
      const corosData = buildCorosActivityData(userId, workout, 'webhook');
      await mergeActivityData(dupCheck.existingActivity.id, corosData);
      await markEventProcessed(event.id, dupCheck.existingActivity.id);
      results.processed++;
      console.log(`📎 Merged COROS webhook data into existing activity: ${activityId}`);
    } else {
      await markEventProcessed(event.id, null, 'Duplicate activity');
      results.skipped++;
      console.log(`ℹ️ Duplicate COROS activity skipped: ${activityId}`);
    }
    return;
  }

  // Build and store new activity
  const activityData = buildCorosActivityData(userId, workout, 'webhook');

  const { data: inserted, error: insertError } = await supabase
    .from('activities')
    .insert(activityData)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to insert activity: ${insertError.message}`);
  }

  await markEventProcessed(event.id, inserted.id);
  results.processed++;

  console.log(`✅ Imported COROS activity: ${activityId} → ${inserted.id}`);

  // Track activation and insights (non-blocking)
  await completeActivationStep(supabase, userId, 'first_activity').catch(() => {});

  try {
    await enqueueProactiveInsight(supabase, userId, 'new_activity', {
      activityId: inserted.id,
      provider: 'coros',
      type: activityData.type
    });
  } catch (insightErr) {
    // Non-blocking
  }
}

/**
 * Mark a webhook event as processed
 */
async function markEventProcessed(eventId, activityImportedId, error = null) {
  await supabase
    .from('coros_webhook_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      activity_imported_id: activityImportedId,
      process_error: error,
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId);
}

/**
 * Schedule a retry with exponential backoff
 */
async function scheduleRetry(event, errorMessage) {
  const retryCount = (event.retry_count || 0) + 1;
  const backoffMinutes = Math.pow(2, retryCount - 1); // 1, 2, 4, 8, 16, 32
  const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

  if (retryCount >= MAX_RETRIES) {
    // Give up after max retries
    await supabase
      .from('coros_webhook_events')
      .update({
        retry_count: retryCount,
        process_error: `Max retries exceeded. Last error: ${errorMessage}`,
        processed: true,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', event.id);

    console.log(`❌ COROS event ${event.id} exceeded max retries`);
  } else {
    await supabase
      .from('coros_webhook_events')
      .update({
        retry_count: retryCount,
        next_retry_at: nextRetryAt,
        process_error: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('id', event.id);

    console.log(`🔄 COROS event ${event.id} scheduled for retry ${retryCount} at ${nextRetryAt}`);
  }
}
