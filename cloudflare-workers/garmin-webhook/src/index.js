/**
 * Cloudflare Worker: Garmin Webhook Proxy
 *
 * Thin store-and-respond handler — no business logic. Verifies signature,
 * stores events to Supabase, returns 200 if stored, 503 if storage failed
 * (so Garmin retries). All processing happens via Vercel cron.
 *
 * The worker exists to decouple webhook receipt from Vercel deploys. That
 * property is what ended the recurring March 2026 outage where Vercel code
 * changes were breaking webhook reception — keep it.
 *
 * ╔════════════════════════════════════════════════════════════════════════╗
 * ║  DUPLICATION NOTE                                                       ║
 * ╠════════════════════════════════════════════════════════════════════════╣
 * ║  The ping-detection and row-shape logic below MUST stay in sync with    ║
 * ║  api/utils/garmin2/pingParser.js and api/utils/garmin2/pingQueue.js.    ║
 * ║  We cannot import from outside this worker directory (different package ║
 * ║  + edge runtime), so the logic is duplicated. Treat pingParser.js as    ║
 * ║  the canonical reference and mirror any change here.                    ║
 * ╚════════════════════════════════════════════════════════════════════════╝
 *
 * Routing model: PING/PULL (Phase 2 of the ground-up Garmin rebuild).
 *   - PING activity-detail (Activity API §4) → row event_type='ACTIVITY_DETAIL_PING',
 *     drained by api/garmin2-pull.js cron.
 *   - PING health → 'HEALTH_<TYPE>_PING'.
 *   - Legacy PUSH still flowing during cutover is stored with the legacy
 *     event_type values; the old processor api/garmin-webhook-process.js
 *     handles them. Strict event_type partition prevents double-processing.
 *
 * HMAC policy (matches api/garmin2-ping.js):
 *   - Missing GARMIN_WEBHOOK_SECRET env var → warn and accept.
 *   - Secret configured + signature present → verify; reject on mismatch.
 *   - Secret configured + signature absent  → warn and accept. (Some Garmin
 *     ping configurations deliver unsigned bodies.)
 *   - HMAC is over the RAW request body bytes (the March 2026 outage was
 *     caused by hashing JSON.stringify(parsed) — never do that).
 *
 * CIRCUIT BREAKER: Garmin disables endpoints that fail persistently. A
 * module-level counter tracks consecutive 503 responses; after
 * CIRCUIT_BREAKER_THRESHOLD the worker flips to returning 200 with
 * degraded:true and a critical log line (visible in CF logs / Logpush) so a
 * long Supabase outage can't get the endpoint deregistered. Events arriving
 * while the breaker is open ARE lost — that's the explicit trade against
 * losing the endpoint registration (and ALL future events) instead. The
 * counter is per-isolate (best effort), which is fine: any isolate seeing 10
 * consecutive failures means the outage is real and sustained.
 */

import { createClient } from '@supabase/supabase-js';

// Circuit breaker state (per-isolate, best effort).
const CIRCUIT_BREAKER_THRESHOLD = 10;
let consecutiveFailures = 0;

// Health summary types the puller (processHealthPushData) knows about.
// Others — epochs, allDayRespiration, userMetrics, etc. — flood the queue
// with rows the processor no-ops on. Drop at the door.
const HANDLED_HEALTH_TYPES = new Set(['dailies', 'sleeps', 'bodyComps', 'stressDetails', 'hrv']);

// Constants mirror api/utils/garmin2/pingQueue.js.
const ACTIVITY_PING = 'ACTIVITY_DETAIL_PING';
const ACTIVITY_DETAIL_PUSH = 'ACTIVITY_DETAIL_PUSH';
const HEALTH_PING_PREFIX = 'HEALTH_';
const HEALTH_PING_SUFFIX = '_PING';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === 'GET') {
      return json(200, {
        status: 'ok',
        service: 'garmin-webhook-proxy-cf',
        version: '5.0.0',
        timestamp: new Date().toISOString(),
        model: 'activityDetails-push-primary (samples inline), ping+legacy-push supported',
        processing: 'async (Vercel cron every 5 min)',
      });
    }

    if (request.method !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    // Read body once for both signature check and parsing.
    const bodyText = await request.text();

    // === Signature verification ============================================
    if (env.GARMIN_WEBHOOK_SECRET) {
      const sig = request.headers.get('x-garmin-signature')
        || request.headers.get('x-webhook-signature');
      if (sig) {
        if (!(await verifyHmac(env.GARMIN_WEBHOOK_SECRET, sig, bodyText))) {
          return json(401, { error: 'Invalid signature' });
        }
      } else {
        // Secret configured but no signature header → warn+accept. Some
        // Garmin ping configurations are unsigned.
        console.warn('Webhook: secret configured but no signature header — accepting');
      }
    } else {
      console.warn('GARMIN_WEBHOOK_SECRET not configured — accepting without verification');
    }

    // === Parse + classify =================================================
    let webhookData;
    try {
      webhookData = JSON.parse(bodyText);
    } catch (err) {
      return json(400, { error: 'Malformed JSON' });
    }

    const classified = classifyPayload(webhookData);

    if (classified.kind === 'UNKNOWN') {
      return json(200, { stored: 0, skipped: classified.items.length || 0, reason: 'unhandled_or_unknown_payload' });
    }
    if (classified.kind === 'PING_HEALTH' && !HANDLED_HEALTH_TYPES.has(classified.healthType)) {
      return json(200, { stored: 0, skipped: classified.items.length, reason: 'unhandled_health_type' });
    }
    if (classified.kind === 'PUSH_HEALTH' && !HANDLED_HEALTH_TYPES.has(classified.healthType)) {
      return json(200, { stored: 0, skipped: classified.items.length, reason: 'unhandled_health_type' });
    }

    // === Store ============================================================
    try {
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      const eventType = eventTypeFor(classified);
      const isPing = classified.kind.startsWith('PING_');

      const eventIds = [];
      let storageAttempts = 0;
      let batchIndex = 0;

      for (const item of classified.items) {
        if (!item || typeof item !== 'object') { batchIndex++; continue; }
        const userId = item.userId;
        if (!userId) { batchIndex++; continue; }

        if (isPing) {
          // === PING path ===================================================
          const missing = validatePingItem(item);
          if (missing.length > 0) {
            console.warn(`Worker: dropping invalid ping item, missing: ${missing.join(',')}`);
            batchIndex++;
            continue;
          }

          // Dedupe: a redelivered ping for the same activity should not
          // create a duplicate row. If a row exists AND is not yet processed,
          // refresh the file_url (Garmin may have issued a fresher callbackURL
          // closer to its 24h expiry).
          const summaryId = String(item.summaryId).replace(/-detail$/, '');
          const { data: existing } = await supabase
            .from('garmin_webhook_events')
            .select('id, processed')
            .eq('activity_id', summaryId)
            .eq('garmin_user_id', userId)
            .eq('event_type', eventType)
            .order('created_at', { ascending: false })
            .limit(1);
          const existingRow = existing?.[0] || null;

          if (existingRow) {
            if (!existingRow.processed) {
              storageAttempts++;
              await supabase.from('garmin_webhook_events')
                .update({ file_url: item.callbackURL, retry_count: 0, next_retry_at: null })
                .eq('id', existingRow.id);
              eventIds.push(existingRow.id);
            }
            batchIndex++;
            continue;
          }

          storageAttempts++;
          const { data: event, error } = await supabase
            .from('garmin_webhook_events')
            .insert({
              event_type: eventType,
              garmin_user_id: String(userId),
              activity_id: summaryId,
              file_url: item.callbackURL,
              file_type: 'JSON',
              upload_timestamp: new Date(item.uploadStartTimeInSeconds * 1000).toISOString(),
              payload: item,                         // store the ITEM, not the envelope
              processed: false,
              retry_count: 0,
              next_retry_at: null,
              batch_index: batchIndex,
            })
            .select('id')
            .single();
          if (!error) eventIds.push(event.id);
          batchIndex++;
          continue;
        }

        if (classified.kind === 'PUSH_ACTIVITY_DETAIL') {
          // === Activity Details PUSH path (primary) ========================
          // Store the ITEM (summary + per-second samples[]) so the processor
          // builds full streams/power/GPS with no FIT download or pull token.
          const detailActivityId = (item.activityId || item.summaryId)?.toString().replace(/-detail$/, '') || null;
          if (detailActivityId) {
            const { data: rows } = await supabase
              .from('garmin_webhook_events')
              .select('id, processed')
              .eq('activity_id', detailActivityId)
              .eq('garmin_user_id', String(userId))
              .eq('event_type', eventType)
              .order('created_at', { ascending: false })
              .limit(1);
            const existing = rows?.[0] || null;
            if (existing) {
              // Re-pushed details for an unprocessed row: refresh the samples.
              if (!existing.processed) {
                storageAttempts++;
                await supabase.from('garmin_webhook_events')
                  .update({ payload: item, process_error: null, retry_count: 0, next_retry_at: null })
                  .eq('id', existing.id);
                eventIds.push(existing.id);
              }
              batchIndex++;
              continue;
            }
          }
          const startSec = item.summary?.startTimeInSeconds ?? item.startTimeInSeconds ?? null;
          storageAttempts++;
          const { data: detailEvent, error: detailErr } = await supabase
            .from('garmin_webhook_events')
            .insert({
              event_type: eventType,                  // 'ACTIVITY_DETAIL_PUSH'
              garmin_user_id: String(userId),
              activity_id: detailActivityId,
              file_url: null,
              file_type: 'JSON',
              upload_timestamp: startSec ? new Date(startSec * 1000).toISOString() : null,
              payload: item,                          // store the ITEM (samples included)
              processed: false,
              retry_count: 0,
              next_retry_at: null,
              batch_index: batchIndex,
            })
            .select('id')
            .single();
          if (!detailErr) eventIds.push(detailEvent.id);
          batchIndex++;
          continue;
        }

        // === Legacy PUSH path (during cutover) =============================
        const activityId = (item.activityId || item.summaryId)?.toString() || null;
        const fileUrl = item.callbackURL || item.fileUrl || null;

        if (activityId) {
          const { data: rows } = await supabase
            .from('garmin_webhook_events')
            .select('id, file_url')
            .eq('activity_id', activityId)
            .eq('garmin_user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);
          const existing = rows?.[0] || null;
          if (existing) {
            if (classified.kind === 'PUSH_ACTIVITY_FILE' && fileUrl) {
              storageAttempts++;
              await supabase.from('garmin_webhook_events')
                .update({ file_url: fileUrl, processed: false, process_error: null, retry_count: 0, next_retry_at: null })
                .eq('id', existing.id);
              eventIds.push(existing.id);
            }
            batchIndex++;
            continue;
          }
        }

        storageAttempts++;
        const { data: event, error } = await supabase
          .from('garmin_webhook_events')
          .insert({
            event_type: eventType,
            garmin_user_id: String(userId),
            activity_id: activityId,
            file_url: fileUrl,
            file_type: webhookData.fileType || item.fileType || 'FIT',
            upload_timestamp: webhookData.uploadTimestamp
              || (item.startTimeInSeconds ? new Date(item.startTimeInSeconds * 1000).toISOString() : null)
              || (webhookData.startTimeInSeconds ? new Date(webhookData.startTimeInSeconds * 1000).toISOString() : null),
            payload: webhookData,
            processed: false,
            retry_count: 0,
            next_retry_at: null,
            batch_index: batchIndex,
          })
          .select('id')
          .single();
        if (!error) eventIds.push(event.id);
        batchIndex++;
      }

      // ALL inserts failed → 503 so Garmin retries delivery. Losing events
      // silently is worse than risking a temporary endpoint disable.
      if (eventIds.length === 0 && storageAttempts > 0) {
        console.error('All event storage failed — signalling unavailable for Garmin retry', {
          attemptedCount: storageAttempts, kind: classified.kind,
        });
        return respondUnavailable();
      }
      if (eventIds.length > 0 && eventIds.length < storageAttempts) {
        console.warn('Partial storage failure', {
          stored: eventIds.length, attempted: storageAttempts, kind: classified.kind,
        });
      }

      consecutiveFailures = 0;
      return json(200, {
        success: true,
        eventIds,
        kind: classified.kind,
        eventType,
        message: `${eventIds.length} events queued`,
      });
    } catch (err) {
      console.error('Webhook error:', err);
      return respondUnavailable();
    }
  },
};

/**
 * Circuit-breaker-aware failure response: 503 (Garmin retries) until the
 * threshold of consecutive failures, then 200 degraded (Garmin keeps the
 * endpoint registered). See header comment for the trade-off.
 */
function respondUnavailable() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    console.error(`CRITICAL: circuit breaker OPEN — ${consecutiveFailures} consecutive storage failures; returning 200 to protect endpoint registration. Events are being DROPPED until storage recovers.`);
    return json(200, { success: false, degraded: true, error: 'Storage unavailable — event dropped to protect endpoint registration' });
  }
  return json(503, { success: false, error: 'Service temporarily unavailable', retryable: true });
}

// --- Helpers ----------------------------------------------------------------

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

async function verifyHmac(secret, signature, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const expected = Array.from(new Uint8Array(signed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === signature.toLowerCase();
}

/**
 * Mirror of api/utils/garmin2/pingParser.js#classifyPayload. Keep in sync.
 */
function classifyPayload(body) {
  if (!body || typeof body !== 'object') return { kind: 'UNKNOWN', healthType: null, items: [] };

  if (Array.isArray(body.activityDetails) && body.activityDetails.length > 0) {
    const sample = body.activityDetails[0];
    const isPing = sample && typeof sample === 'object' && typeof sample.callbackURL === 'string';
    // Detail items WITHOUT a callbackURL are an Activity Details PUSH: Garmin
    // inlined the summary + per-second samples[]. That's the rebuild's primary
    // "full data" path — store the item intact (not as a bare CONNECT_ACTIVITY
    // summary, which would discard the samples).
    return {
      kind: isPing ? 'PING_ACTIVITY_DETAIL' : 'PUSH_ACTIVITY_DETAIL',
      healthType: null,
      items: body.activityDetails,
    };
  }
  if (Array.isArray(body.activityFiles) && body.activityFiles.length > 0) {
    return { kind: 'PUSH_ACTIVITY_FILE', healthType: null, items: body.activityFiles };
  }
  if (Array.isArray(body.activities) && body.activities.length > 0) {
    return { kind: 'PUSH_CONNECT_ACTIVITY', healthType: null, items: body.activities };
  }
  for (const ht of HANDLED_HEALTH_TYPES) {
    if (Array.isArray(body[ht]) && body[ht].length > 0) {
      const sample = body[ht][0];
      const isPing = sample && typeof sample === 'object' && typeof sample.callbackURL === 'string';
      return {
        kind: isPing ? 'PING_HEALTH' : 'PUSH_HEALTH',
        healthType: ht,
        items: body[ht],
      };
    }
  }
  return { kind: 'UNKNOWN', healthType: null, items: [] };
}

function validatePingItem(item) {
  const missing = [];
  if (!item.userId) missing.push('userId');
  if (!item.summaryId) missing.push('summaryId');
  if (!item.callbackURL) missing.push('callbackURL');
  if (typeof item.uploadStartTimeInSeconds !== 'number') missing.push('uploadStartTimeInSeconds');
  if (typeof item.uploadEndTimeInSeconds !== 'number') missing.push('uploadEndTimeInSeconds');
  return missing;
}

function eventTypeFor({ kind, healthType }) {
  switch (kind) {
    case 'PING_ACTIVITY_DETAIL': return ACTIVITY_PING;
    case 'PUSH_ACTIVITY_DETAIL': return ACTIVITY_DETAIL_PUSH;
    case 'PING_HEALTH':           return `${HEALTH_PING_PREFIX}${(healthType || '').toUpperCase()}${HEALTH_PING_SUFFIX}`;
    case 'PUSH_ACTIVITY_FILE':    return 'ACTIVITY_FILE_DATA';
    case 'PUSH_CONNECT_ACTIVITY': return 'CONNECT_ACTIVITY';
    case 'PUSH_HEALTH':           return `${HEALTH_PING_PREFIX}${healthType || ''}`;
    default:                      return 'UNKNOWN';
  }
}
