// Vercel API Route: Garmin Webhook Event Processor (Cron)
// Processes unprocessed events stored by the webhook handler.
// Runs every 5 minutes via Vercel cron.
//
// Retry strategy: exponential backoff with ±20% jitter (1m … 256m, ≈8.5h
// total budget — see api/utils/garmin/retryPolicy.js). Activity events that
// exhaust the budget are dead-lettered (processed stays false, visible and
// redrivable via api/admin-garmin-dlq.js) instead of being silently marked
// processed-with-error.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { downloadAndParseFitFile } from './utils/fitParser.js';
import { fetchAthleteProfile } from './utils/athleteProfile.js';
import { checkForDuplicate, takeoverActivity, mergeActivityData } from './utils/activityDedup.js';
import { completeActivationStep, enqueueProactiveInsight, enqueueCheckIn } from './utils/activation.js';
import { enqueueDeviationAnalysis } from './utils/deviationProcessor.js';
import { sendPushToUser, buildPostRideMessage } from './utils/pushNotification.js';
import { updateBackfillChunkIfApplicable } from './utils/garminBackfill.js';
import { extractAndStoreActivitySegments } from './utils/roadSegmentExtractor.js';

import { parseWebhookPayload } from './utils/garmin/webhookPayloadParser.js';
import { shouldFilterActivityType, hasMinimumActivityMetrics } from './utils/garmin/activityFilters.js';
import { buildActivityData } from './utils/garmin/activityBuilder.js';
import { fetchGarminActivityDetails, requestActivityDetailsBackfill, fetchGarminUserId } from './utils/garmin/garminApiClient.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';
import { processHealthPushData, extractAndSaveHealthMetrics } from './utils/garmin/healthDataProcessor.js';
import { updateSnapshotForActivity } from './utils/fitnessSnapshots.js';
import { deriveCompleteness, refreshCompleteness } from './utils/garmin/completeness.js';
import { captureServerError } from './utils/serverSentry.js';
import { MAX_RETRIES, computeBackoffMinutes, deadLetterEvent } from './utils/garmin/retryPolicy.js';

const supabase = getSupabaseAdmin();

const BATCH_SIZE = 20;
// Activity events (CONNECT_ACTIVITY / ACTIVITY_DETAIL / ACTIVITY_FILE_DATA)
// can sit in the queue when health-event bursts back things up. The previous
// 24h cutoff silently dropped them forever; widen it so the safety-net
// requestActivityDetailsBackfill in downloadAndProcessActivity actually gets
// to run. Health events keep the tight window — they're cheap to lose.
const ACTIVITY_EVENT_TYPES = ['CONNECT_ACTIVITY', 'ACTIVITY_DETAIL', 'ACTIVITY_FILE_DATA'];

// Ping event types that belong to the NEW garmin2-pull pipeline, NOT this
// legacy processor. The Cloudflare worker tags ping payloads with these
// event_types; api/garmin2-pull.js owns them exclusively. Without this
// exclusion list, the health-fallback query below ("anything that isn't
// an activity") would claim ping rows and race the new puller for the
// same DB rows. Keep these literals in sync with
// api/utils/garmin2/pingQueue.js (ACTIVITY_PING + HEALTH_*_PING).
const PING_EVENT_TYPES = ['ACTIVITY_DETAIL_PING'];
const PING_EVENT_TYPE_LIKE_PATTERN = 'HEALTH_%_PING';
const ACTIVITY_CUTOFF_DAYS = 14;
const HEALTH_CUTOFF_HOURS = 24;

export default async function handler(req, res) {
  // Verify cron authorization (timing-safe)
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== Garmin Webhook Processor Started ===');

  const results = { processed: 0, failed: 0, skipped: 0, retried: 0 };

  try {
    // Fetch unprocessed events that are ready for processing.
    // Activity events get priority and a 14d window so a health-event burst
    // can't starve them past a hard 24h drop. Health events keep the tight
    // 24h cutoff.
    const activityCutoff = new Date(Date.now() - ACTIVITY_CUTOFF_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const healthCutoff = new Date(Date.now() - HEALTH_CUTOFF_HOURS * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const baseQuery = () => supabase
      .from('garmin_webhook_events')
      .select('*')
      .eq('processed', false)
      .lt('retry_count', MAX_RETRIES)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order('created_at', { ascending: true });

    const { data: activityEvents, error: activityErr } = await baseQuery()
      .in('event_type', ACTIVITY_EVENT_TYPES)
      .gte('created_at', activityCutoff)
      .limit(BATCH_SIZE);

    if (activityErr) {
      console.error('Failed to query activity events:', activityErr);
      return res.status(500).json({ error: 'Query failed', details: activityErr.message });
    }

    let events = activityEvents || [];
    const remaining = BATCH_SIZE - events.length;
    if (remaining > 0) {
      // Health fallback: claim any non-activity event_type EXCEPT the new
      // ping types (ACTIVITY_DETAIL_PING + HEALTH_*_PING). Those belong to
      // api/garmin2-pull.js; without this exclusion the two crons race.
      const excluded = [...ACTIVITY_EVENT_TYPES, ...PING_EVENT_TYPES];
      const { data: healthEvents, error: healthErr } = await baseQuery()
        .not('event_type', 'in', `(${excluded.join(',')})`)
        .not('event_type', 'like', PING_EVENT_TYPE_LIKE_PATTERN)
        .gte('created_at', healthCutoff)
        .limit(remaining);
      if (healthErr) {
        console.error('Failed to query health events:', healthErr);
      } else if (healthEvents?.length) {
        events = events.concat(healthEvents);
      }
    }

    if (!events || events.length === 0) {
      console.log('No events to process');
      return res.status(200).json({ success: true, message: 'No events to process', ...results });
    }

    console.log(`Found ${events.length} events to process`);

    // Cache integration lookups per batch to avoid repeated queries for the same user
    const integrationCache = new Map();

    for (const event of events) {
      try {
        // Health events
        if (event.event_type?.startsWith('HEALTH_')) {
          await processHealthEvent(event, integrationCache);
          results.processed++;
          continue;
        }

        // Activity events
        await processActivityEvent(event, integrationCache);
        results.processed++;
      } catch (err) {
        console.error(`❌ Failed to process event ${event.id}:`, err.message);
        results.failed++;

        // Schedule retry with exponential backoff (jittered — see retryPolicy.js)
        const newRetryCount = (event.retry_count || 0) + 1;
        if (newRetryCount < MAX_RETRIES) {
          const backoffMinutes = computeBackoffMinutes(newRetryCount);
          const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

          await supabase
            .from('garmin_webhook_events')
            .update({
              retry_count: newRetryCount,
              next_retry_at: nextRetryAt,
              process_error: err.message
            })
            .eq('id', event.id);

          console.log(`🔄 Scheduled retry ${newRetryCount}/${MAX_RETRIES} in ${backoffMinutes.toFixed(1)}m for event ${event.id}`);
          results.retried++;
        } else {
          const isActivity = ACTIVITY_EVENT_TYPES.includes(event.event_type);

          if (isActivity) {
            // Budget exhausted: park in the DLQ (processed stays false) so the
            // event remains visible and redrivable instead of silently lost.
            const { deadLettered } = await deadLetterEvent(supabase, event, err.message);
            console.error(`🚨 ACTIVITY EVENT ${deadLettered ? 'DEAD-LETTERED' : 'LOST'} Event ${event.id} (${event.event_type}, activity_id=${event.activity_id}) after ${MAX_RETRIES} retries: ${err.message}`);

            // Emit a structured error so it's discoverable via Sentry /
            // admin-garmin-health / garmin-health-monitor.
            captureServerError(err, {
              tag: 'garmin.activity_lost',
              extra: {
                event_id: event.id,
                event_type: event.event_type,
                activity_id: event.activity_id,
                garmin_user_id: event.garmin_user_id,
                retry_count: MAX_RETRIES,
                dead_lettered: deadLettered,
              },
            });
            if (event.activity_imported_id) {
              await supabase
                .from('activities')
                .update({ data_completeness: 'needs_resync' })
                .eq('id', event.activity_imported_id)
                .then(({ error }) => {
                  if (error) console.warn(`⚠️ Could not flag activity needs_resync:`, error.message);
                });
            }
          } else {
            // Health events stay cheap to lose: mark processed with the error.
            await markEventProcessed(event.id, `Max retries (${MAX_RETRIES}) exceeded. Last error: ${err.message}`);
            console.error(`💀 Event ${event.id} (${event.event_type}) permanently failed after ${MAX_RETRIES} retries: ${err.message}`);
          }
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
// INTEGRATION LOOKUP CACHE
// ============================================================================

/**
 * Look up a Garmin integration by provider_user_id, using a per-batch cache.
 * For activity processing (fullSelect=true), fetches token fields too.
 * After token refreshes, the caller should update the cached object.
 */
async function getCachedIntegration(garminUserId, cache, fullSelect = false) {
  const cacheKey = `${garminUserId}:${fullSelect ? 'full' : 'basic'}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const selectFields = fullSelect
    ? 'id, user_id, access_token, refresh_token, token_expires_at, provider_user_id, refresh_token_invalid'
    : 'id, user_id, refresh_token_invalid';

  const { data: integration, error } = await supabase
    .from('bike_computer_integrations')
    .select(selectFields)
    .eq('provider', 'garmin')
    .eq('provider_user_id', garminUserId)
    .maybeSingle();

  if (error) {
    console.error('Error finding integration:', error);
  }

  // Cache even null results to avoid re-querying for unknown users
  cache.set(cacheKey, integration || null);
  return integration || null;
}

/**
 * Attempt to match an orphaned garmin_user_id to an integration whose
 * provider_user_id was never stored (OAuth /user/id fetch failed during
 * connect). Asks Garmin for the user ID behind each NULL-id integration's
 * token; on a match, persists it and returns the healed integration.
 *
 * Cheap in the common case: the NULL-id query returns zero rows. The result
 * (healed or not) is cached per batch via the same integrationCache keys.
 *
 * @returns {Promise<object|null>} healed integration (full select shape) or null
 */
async function healMissingProviderUserId(garminUserId, cache) {
  const healCacheKey = `heal:${garminUserId}`;
  if (cache.has(healCacheKey)) return cache.get(healCacheKey);

  let healed = null;
  try {
    const { data: orphans, error } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, access_token, refresh_token, token_expires_at, provider_user_id, refresh_token_invalid')
      .eq('provider', 'garmin')
      .is('provider_user_id', null)
      .neq('refresh_token_invalid', true)
      .limit(10);

    if (!error) {
      for (const candidate of orphans || []) {
        try {
          const validToken = await ensureValidAccessToken(candidate, supabase);
          const fetchedId = await fetchGarminUserId(validToken);
          if (!fetchedId) continue;

          // Persist whatever Garmin returned — even a non-matching ID heals
          // that integration for its own future webhooks.
          await supabase
            .from('bike_computer_integrations')
            .update({ provider_user_id: fetchedId, updated_at: new Date().toISOString() })
            .eq('id', candidate.id);
          console.log(`🩹 Healed provider_user_id for integration ${candidate.id} → ${fetchedId}`);

          if (fetchedId === garminUserId) {
            candidate.provider_user_id = fetchedId;
            candidate.access_token = validToken;
            healed = candidate;
            break;
          }
        } catch (err) {
          console.warn(`⚠️ provider_user_id heal attempt failed for integration ${candidate.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ provider_user_id heal scan failed:', err.message);
  }

  cache.set(healCacheKey, healed);
  if (healed) {
    cache.set(`${garminUserId}:full`, healed);
  }
  return healed;
}

// ============================================================================
// HEALTH EVENT PROCESSING
// ============================================================================

async function processHealthEvent(event, integrationCache) {
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
    const integration = await getCachedIntegration(item.userId, integrationCache);

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

async function processActivityEvent(event, integrationCache) {
  // Find integration (cached per batch to avoid repeated lookups for same user)
  let integration = await getCachedIntegration(event.garmin_user_id, integrationCache, true);

  if (!integration) {
    // Self-heal: an OAuth flow that stored tokens but failed the /user/id
    // fetch leaves provider_user_id NULL, making every webhook for that user
    // unmatchable. Before giving up, ask Garmin for the user ID of each
    // NULL-id integration and backfill the match.
    integration = await healMissingProviderUserId(event.garmin_user_id, integrationCache);
  }

  if (!integration) {
    // Genuinely unmatched (most often a user who disconnected in-app while
    // Garmin keeps delivering until consent is revoked). Mark processed so it
    // doesn't clog the DLQ, but emit a tagged event — the health monitor
    // counts these via the process_error marker below.
    captureServerError(`Unmatched Garmin webhook: no integration for Garmin user ID ${event.garmin_user_id}`, {
      tag: 'garmin.unmatched_webhook',
      extra: { event_id: event.id, event_type: event.event_type, garmin_user_id: event.garmin_user_id },
    });
    await markEventProcessed(event.id, `No integration found for Garmin user ID: ${event.garmin_user_id}. User needs to reconnect Garmin.`);
    return;
  }

  // Update event with user info
  await supabase
    .from('garmin_webhook_events')
    .update({ user_id: integration.user_id, integration_id: integration.id })
    .eq('id', event.id);

  // Short-circuit known-dead integrations. Without this, every webhook for a
  // disconnected user burns 6 retries against Garmin's token endpoint and
  // pollutes logs. The user only recovers via the in-app reconnect prompt.
  if (integration.refresh_token_invalid) {
    await markEventProcessed(event.id, 'Integration disconnected (refresh_token_invalid); user must reconnect Garmin');
    return;
  }

  // Refresh token if needed (also updates cached integration object for subsequent events)
  const validToken = await ensureValidAccessToken(integration, supabase);
  if (validToken !== integration.access_token) {
    integration.access_token = validToken;
    console.log('✅ Token refreshed proactively');
  }

  // Check if activity already imported
  if (event.activity_id) {
    const { data: existing } = await supabase
      .from('activities')
      .select('id, start_date, map_summary_polyline, average_watts, normalized_power, power_curve_summary, activity_streams, ride_analytics')
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
  // Extract FIT URL from event column OR from webhook payload callbackURL
  const parsed = parseWebhookPayload(event.payload || {});
  const idx = event.batch_index || 0;
  const webhookInfo = parsed.items.length > 0 ? (parsed.items[idx] || parsed.items[0]) : (event.payload || {});
  const fitFileUrl = event.file_url || webhookInfo?.callbackURL;

  const needsGps = !existing.map_summary_polyline;
  const needsAvgPower = !existing.average_watts;
  const needsPowerMetrics = !existing.normalized_power && !existing.power_curve_summary;
  const needsPowerCurve = !existing.power_curve_summary;
  const needsStreams = !existing.activity_streams;
  const needsAnalytics = !existing.ride_analytics;
  const needsAnyFitData = needsGps || needsPowerMetrics || needsPowerCurve || needsAvgPower || needsStreams || needsAnalytics;
  const needsFitData = needsAnyFitData && fitFileUrl;

  if (!needsFitData) {
    // If data is missing but we have no FIT URL, request a backfill
    if (needsAnyFitData && !fitFileUrl) {
      const startTime = webhookInfo?.startTimeInSeconds;
      if (integration.access_token && startTime) {
        await requestActivityDetailsBackfill(integration.access_token, startTime);
        console.log(`[FIT:BACKFILL] Requested backfill for existing activity missing FIT data: ${event.activity_id}`);
        // Stamp the activity so the reconciliation cron (Phase 4) can throttle.
        await supabase
          .from('activities')
          .update({ last_resync_requested_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
      await markEventProcessed(event.id, 'Already imported, missing FIT data - backfill requested', existing.id);
      return;
    }
    await markEventProcessed(event.id, 'Already imported', existing.id);
    return;
  }

  console.log(`[FIT:DOWNLOAD] Activity ${event.activity_id} exists but missing data (GPS:${needsGps} power:${needsPowerMetrics} streams:${needsStreams} analytics:${needsAnalytics}), downloading FIT from: ${fitFileUrl ? 'URL available' : 'no URL'}`);
  const athlete = await fetchAthleteProfile(integration.user_id);
  const fitResult = await downloadAndParseFitFile(fitFileUrl, integration.access_token, athlete);

  const activityUpdate = { updated_at: new Date().toISOString() };
  const updates = [];

  if (needsGps && fitResult.polyline) {
    activityUpdate.map_summary_polyline = fitResult.polyline;
    updates.push(`GPS: ${fitResult.simplifiedCount} points`);
  }

  if (fitResult.activityStreams) {
    activityUpdate.activity_streams = fitResult.activityStreams;
    updates.push('Activity streams');
  }

  if (fitResult.powerMetrics) {
    const pm = fitResult.powerMetrics;
    if (needsAvgPower && pm.avgPower) {
      activityUpdate.average_watts = pm.avgPower;
      updates.push(`Avg: ${pm.avgPower}W`);
    }
    if (needsPowerMetrics) {
      // Dual-write legacy + canonical (spec §2). Re-added 2026-05-09 after
      // the April 27 rollback (commit 95eb804) — migration 072 has been
      // stable in production for >2 weeks and the SELECT on line 236 still
      // reads `normalized_power` so the rollback's failure mode (silent
      // null on missing canonical column) cannot recur.
      if (pm.normalizedPower) {
        activityUpdate.normalized_power = pm.normalizedPower;
        activityUpdate.effective_power = pm.normalizedPower;
      }
      if (pm.maxPower) activityUpdate.max_watts = pm.maxPower;
      if (pm.trainingStressScore) {
        activityUpdate.tss = pm.trainingStressScore;
        activityUpdate.rss = pm.trainingStressScore;
      }
      if (pm.intensityFactor) {
        activityUpdate.intensity_factor = pm.intensityFactor;
        activityUpdate.ride_intensity = pm.intensityFactor;
      }
      if (pm.workKj) activityUpdate.kilojoules = pm.workKj;
      if (pm.normalizedPower) updates.push(`NP: ${pm.normalizedPower}W`);
    }
    // Self-heal power_curve_summary independently: an earlier partial write
    // may have populated normalized_power without the curve, leaving it NULL
    // forever because needsPowerMetrics evaluates false on subsequent webhooks.
    if (!existing.power_curve_summary && pm.powerCurveSummary) {
      activityUpdate.power_curve_summary = pm.powerCurveSummary;
      updates.push('Power curve');
    }
    if (pm.avgPower || pm.normalizedPower) {
      activityUpdate.device_watts = true;
    }
  }

  // Store advanced ride analytics (pacing, match burning, fatigue resistance, etc.)
  if (fitResult.rideAnalytics) {
    activityUpdate.ride_analytics = fitResult.rideAnalytics;
    updates.push('Advanced analytics');
  }

  // fit_coach_context written separately so a missing column never blocks GPS/streams/power
  const fitCoachCtx = fitResult.fitCoachContext ?? null;

  if (updates.length > 0) {
    const { error: updateError } = await supabase
      .from('activities')
      .update(activityUpdate)
      .eq('id', existing.id);

    if (updateError) {
      throw new Error(`Update failed: ${updateError.message}`);
    }
    console.log(`[FIT:SUCCESS] Data added to existing activity ${existing.id}: ${updates.join(', ')}`);
    await markEventProcessed(event.id, `Data added: ${updates.join(', ')}`, existing.id);

    // Re-derive completeness now that the missing fields have landed.
    refreshCompleteness(supabase, existing.id).catch(err =>
      console.warn(`⚠️ completeness refresh failed for ${existing.id}:`, err.message)
    );

    if (fitCoachCtx) {
      const { error: ctxErr } = await supabase
        .from('activities')
        .update({ fit_coach_context: fitCoachCtx })
        .eq('id', existing.id);
      if (ctxErr) console.warn(`⚠️ fit_coach_context write failed (non-critical):`, ctxErr.message);
    }
  } else {
    // FIT download succeeded but extracted nothing usable — the callbackURL
    // sometimes points at a "summary FIT" without per-second records. Request
    // a fresh backfill so Garmin re-emits ACTIVITY_FILE_DATA with the full file,
    // mirroring the no-URL branch above. Without this, the activity is stranded
    // as summary-only forever.
    const startTime = webhookInfo?.startTimeInSeconds
      ?? (existing.start_date ? Math.floor(new Date(existing.start_date).getTime() / 1000) : null);
    // FIT was downloaded but yielded no per-second records (summary-only
    // FIT). With the Phase 7 reconciler disabled (PR #803 — direct §7.3
    // pulls with OAuth Bearer return InvalidPullTokenException), this is
    // the only remaining recovery mechanism: ask Garmin to re-emit
    // ACTIVITY_FILE_DATA in the hope a subsequent delivery includes the
    // full file. requestActivityDetailsBackfill is self-contained
    // (never throws, treats 409 duplicate-processed as success) so no
    // try/catch needed at the call site.
    if (integration.access_token && startTime) {
      await requestActivityDetailsBackfill(integration.access_token, startTime);
      console.log(`[FIT:BACKFILL] FIT yielded no data; requested backfill for ${event.activity_id}`);
      await supabase
        .from('activities')
        .update({ last_resync_requested_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    console.log(`[FIT:SKIP] FIT file parsed but no new data for activity ${existing.id} — requested re-send`);
    await markEventProcessed(event.id, 'Already imported, FIT empty - backfill requested', existing.id);
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
  // Stamp completeness on insert so the row is honest the moment it lands.
  // The FIT enrichment in processFitFile / handleExistingActivity will
  // refresh this to 'full' once streams/power/polyline land.
  activityData.data_completeness = deriveCompleteness(activityData) || 'summary_only';

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

  if (activityInfo.startTimeInSeconds) {
    await updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
  }

  // FIT file processing
  const fitFileUrl = event.file_url || webhookInfo?.callbackURL;
  if (fitFileUrl && integration.access_token) {
    console.log(`[FIT:DOWNLOAD] Processing FIT file for new activity ${activity.id}`);
    await processFitFile(activity.id, fitFileUrl, integration.access_token, integration.user_id, activityInfo.startTimeInSeconds);
  } else if (integration.access_token && activityInfo.startTimeInSeconds) {
    // No FIT URL on the new-activity webhook — common when Garmin only
    // sent CONNECT_ACTIVITY without the ACTIVITY_FILE_DATA follow-up.
    // Ask Garmin to re-emit the FIT-data webhook. With the Phase 7
    // reconciler disabled (PR #803) this is the only remaining recovery
    // path for these activities; without it they stay summary_only.
    // Mirrors the surviving call sites in handleDuplicateActivity.
    console.log(`[FIT:BACKFILL] No FIT URL for activity ${activity.id}, requesting backfill`);
    await requestActivityDetailsBackfill(integration.access_token, activityInfo.startTimeInSeconds);
  }

  // Update fitness snapshot for the week of this activity
  try {
    await updateSnapshotForActivity(supabase, integration.user_id, activity.start_date);
    console.log('📊 Fitness snapshot updated for activity');
  } catch (snapshotError) {
    console.error('⚠️ Snapshot update failed (non-critical):', snapshotError.message);
  }

  // Compute proprietary metrics (EFI, TWL)
  try {
    const { computeAndStoreMetrics } = await import('./utils/metricsComputation.js');
    await computeAndStoreMetrics(supabase, integration.user_id, activity.id);
    console.log('📊 Proprietary metrics computed for activity');
  } catch (metricsError) {
    console.error('⚠️ Metrics computation failed (non-critical):', metricsError.message);
  }

  // Track activation progress and enqueue insight
  try {
    await completeActivationStep(supabase, integration.user_id, 'first_sync');
    await enqueueProactiveInsight(supabase, integration.user_id, activity.id);

    // Enqueue coaching check-in and trigger generation (fire-and-forget)
    const checkInId = await enqueueCheckIn(supabase, integration.user_id, activity.id);
    if (checkInId) {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.tribos.studio';
      fetch(`${baseUrl}/api/coach-check-in-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET },
        body: JSON.stringify({ checkInId }),
      }).catch(() => {});
    }

    // Enqueue deviation analysis (fire-and-forget)
    enqueueDeviationAnalysis(supabase, integration.user_id, activity.id).catch(() => {});
  } catch (activationError) {
    console.error('⚠️ Activation tracking failed (non-critical):', activationError.message);
  }

  // Send post-ride push notification (fire-and-forget)
  try {
    const { data: latestLoad } = await supabase
      .from('training_load_daily')
      .select('tfi, afi, form_score')
      .eq('user_id', integration.user_id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const message = buildPostRideMessage(latestLoad);
    sendPushToUser(integration.user_id, {
      ...message,
      url: '/dashboard',
      notificationType: 'post_ride_insight',
      referenceId: activity.id,
    }).catch((e) => console.error('⚠️ Push notification failed (non-fatal):', e.message));
  } catch (pushError) {
    console.error('⚠️ Push notification failed (non-fatal):', pushError.message);
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
          const athlete = await fetchAthleteProfile(integration.user_id);
          const fitResult = await downloadAndParseFitFile(fitFileUrl, integration.access_token, athlete);
          if (fitResult.powerMetrics || fitResult.polyline) {
            const fitUpdate = { updated_at: new Date().toISOString() };
            if (fitResult.polyline) fitUpdate.map_summary_polyline = fitResult.polyline;
            if (fitResult.activityStreams) fitUpdate.activity_streams = fitResult.activityStreams;
            if (fitResult.powerMetrics?.avgPower) fitUpdate.average_watts = fitResult.powerMetrics.avgPower;
            if (fitResult.powerMetrics?.normalizedPower) {
              fitUpdate.normalized_power = fitResult.powerMetrics.normalizedPower;
              fitUpdate.effective_power = fitResult.powerMetrics.normalizedPower;
            }
            if (fitResult.powerMetrics?.maxPower) fitUpdate.max_watts = fitResult.powerMetrics.maxPower;
            if (fitResult.powerMetrics?.powerCurveSummary) fitUpdate.power_curve_summary = fitResult.powerMetrics.powerCurveSummary;
            if (fitResult.powerMetrics?.workKj) fitUpdate.kilojoules = fitResult.powerMetrics.workKj;
            if (fitResult.rideAnalytics) fitUpdate.ride_analytics = fitResult.rideAnalytics;
            if (fitResult.fitCoachContext) fitUpdate.fit_coach_context = fitResult.fitCoachContext;
            fitUpdate.device_watts = true;

            await supabase
              .from('activities')
              .update(fitUpdate)
              .eq('id', dupCheck.existingActivity.id);
            // Re-derive completeness now that streams/power have landed.
            refreshCompleteness(supabase, dupCheck.existingActivity.id).catch(err =>
              console.warn(`⚠️ completeness refresh failed for ${dupCheck.existingActivity.id}:`, err.message)
            );
          }
        } catch (fitError) {
          console.warn('⚠️ Could not add FIT data to taken-over activity:', fitError.message);
        }
      } else if (integration.access_token && activityInfo?.startTimeInSeconds) {
        // Mirror the new-activity path: when Garmin's webhook arrives without an
        // inline FIT URL (common for summary-only PUSH), ask Garmin to send a
        // fresh PING with the FIT callbackURL so the follow-up webhook can fill
        // in streams/curve/analytics via handleExistingActivity.
        console.log(`[FIT:BACKFILL] No FIT URL on takeover for activity ${dupCheck.existingActivity.id}, requesting backfill`);
        await requestActivityDetailsBackfill(integration.access_token, activityInfo.startTimeInSeconds);
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

    // Also process FIT file if available and activity is missing detailed data
    const fitFileUrl = event.file_url || webhookInfo?.callbackURL;
    if (fitFileUrl && integration.access_token) {
      try {
        const { data: existingFull } = await supabase
          .from('activities')
          .select('activity_streams, power_curve_summary, ride_analytics')
          .eq('id', dupCheck.existingActivity.id)
          .single();

        const needsFitData = existingFull && (
          !existingFull.activity_streams ||
          !existingFull.power_curve_summary ||
          !existingFull.ride_analytics
        );

        if (needsFitData) {
          await processFitFile(dupCheck.existingActivity.id, fitFileUrl, integration.access_token, integration.user_id, activityInfo?.startTimeInSeconds);
          console.log('[FIT:SUCCESS] FIT data added via merge path');
        }
      } catch (fitError) {
        console.warn('⚠️ FIT processing in merge path failed:', fitError.message);
      }
    } else if (integration.access_token && activityInfo?.startTimeInSeconds) {
      // Defensive symmetry with the takeover branch / new-activity path.
      console.log(`[FIT:BACKFILL] No FIT URL on merge for activity ${dupCheck.existingActivity.id}, requesting backfill`);
      await requestActivityDetailsBackfill(integration.access_token, activityInfo.startTimeInSeconds);
    }

    if (activityInfo.startTimeInSeconds) {
      await updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
    }
    await markEventProcessed(event.id, dupCheck.reason, dupCheck.existingActivity.id);
  }
}

async function processFitFile(activityId, fitFileUrl, accessToken, userId = null, startTimeInSeconds = null) {
  try {
    const athlete = await fetchAthleteProfile(userId);
    const fitResult = await downloadAndParseFitFile(fitFileUrl, accessToken, athlete);

    // Surface download failures explicitly. downloadAndParseFitFile catches
    // its own errors and returns { error: '...', polyline: null, ... } instead
    // of throwing — without this branch the function would silently no-op
    // (build an empty activityUpdate, fail the `> 1` gate, return), leaving
    // the activity stranded as summary_only with no log and no recovery nudge.
    if (fitResult.error) {
      console.warn(`[FIT:DOWNLOAD-FAILED] activity ${activityId}: ${fitResult.error}`);
      if (accessToken && startTimeInSeconds) {
        await requestActivityDetailsBackfill(accessToken, startTimeInSeconds);
        console.log(`[FIT:BACKFILL] Requested backfill after download failure for activity ${activityId}`);
      }
      return;
    }

    // Surface "downloaded successfully but parsed to nothing" — what's been
    // happening for Garmin Edge 540 FIT files where the file is ~500 KB but
    // easy-fit returns 0 records (likely format-version mismatch with the
    // pre-1.0 easy-fit library). Same downstream symptom as the download
    // failure case: no polyline, no streams, no power, every `if` skipped,
    // gate fails, activity stays summary_only forever.
    const hasUsableContent = Boolean(
      fitResult.polyline || fitResult.activityStreams || fitResult.powerMetrics
    );
    if (!hasUsableContent) {
      console.warn(`[FIT:EMPTY] activity ${activityId}: FIT downloaded but parsed empty (pointCount=${fitResult.pointCount ?? 0}, hasGpsData=${fitResult.hasGpsData}, hasPowerData=${fitResult.hasPowerData})`);
      if (accessToken && startTimeInSeconds) {
        await requestActivityDetailsBackfill(accessToken, startTimeInSeconds);
        console.log(`[FIT:BACKFILL] Requested backfill after empty FIT for activity ${activityId}`);
      }
      return;
    }

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
      // Dual-write legacy + canonical (spec §2). See note at line 312.
      if (pm.normalizedPower) {
        activityUpdate.normalized_power = pm.normalizedPower;
        activityUpdate.effective_power = pm.normalizedPower;
      }
      if (pm.maxPower) activityUpdate.max_watts = pm.maxPower;
      if (pm.trainingStressScore) {
        activityUpdate.tss = pm.trainingStressScore;
        activityUpdate.rss = pm.trainingStressScore;
      }
      if (pm.intensityFactor) {
        activityUpdate.intensity_factor = pm.intensityFactor;
        activityUpdate.ride_intensity = pm.intensityFactor;
      }
      if (pm.powerCurveSummary) activityUpdate.power_curve_summary = pm.powerCurveSummary;
      if (pm.workKj) activityUpdate.kilojoules = pm.workKj;
      activityUpdate.device_watts = true;

      console.log(`[FIT:SUCCESS] Power metrics: Avg=${pm.avgPower}W, NP=${pm.normalizedPower}W, Max=${pm.maxPower}W, Work=${pm.workKj}kJ`);
    }

    // Store advanced ride analytics
    if (fitResult.rideAnalytics) {
      activityUpdate.ride_analytics = fitResult.rideAnalytics;
    }

    // fit_coach_context written separately so a missing column never blocks GPS/streams/power
    const fitCoachCtx = fitResult.fitCoachContext ?? null;
    if (fitCoachCtx) {
      console.log(`[FIT:SUCCESS] Coach context: ${fitCoachCtx.sample_count} samples @ ${fitCoachCtx.interval_seconds}s`);
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

        // Re-derive completeness now that streams/power/polyline have landed.
        // Failure here is non-critical (Phase 4 reconciliation will fix drift).
        refreshCompleteness(supabase, activityId).catch(err =>
          console.warn(`⚠️ completeness refresh failed for ${activityId}:`, err.message)
        );

        if (fitResult.polyline) {
          extractAndStoreActivitySegments(activityId, null).catch(err => {
            console.warn(`⚠️ Segment extraction failed:`, err.message);
          });
        }

        if (fitCoachCtx) {
          supabase.from('activities')
            .update({ fit_coach_context: fitCoachCtx })
            .eq('id', activityId)
            .then(({ error }) => {
              if (error) console.warn(`⚠️ fit_coach_context write failed (non-critical):`, error.message);
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
