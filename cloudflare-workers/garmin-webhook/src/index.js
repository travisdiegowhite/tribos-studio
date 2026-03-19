/**
 * Cloudflare Worker: Garmin Webhook Proxy
 *
 * Thin store-and-respond handler — no business logic.
 * Verifies signature, stores events to Supabase.
 * Returns 200 if stored, 503 if storage failed (so Garmin retries).
 * All processing happens via Vercel cron (api/garmin-webhook-process.js).
 *
 * FALLBACK PLAN: If Garmin disables the endpoint due to sustained 503s,
 * upgrade to a circuit breaker pattern:
 *   - Track consecutive 503 responses (module-level counter, resets on 200)
 *   - After N consecutive 503s (e.g. 10), flip to returning 200
 *   - Log a critical alert when the circuit breaker trips
 *   - This limits Garmin's exposure to failures while still getting retries
 *     for brief outages (the common case)
 *   - To re-enable a disabled endpoint: Garmin Developer Portal → re-register URL
 */

import { createClient } from '@supabase/supabase-js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === 'GET') {
      return json(200, {
        status: 'ok',
        service: 'garmin-webhook-proxy-cf',
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        processing: 'async (Vercel cron every minute)'
      });
    }

    if (request.method !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    // Read body once (needed for both signature check and parsing)
    const bodyText = await request.text();

    // Signature verification
    if (env.GARMIN_WEBHOOK_SECRET) {
      const sig = request.headers.get('x-garmin-signature') || request.headers.get('x-webhook-signature');
      if (!sig) return json(401, { error: 'Missing signature' });
      if (!(await verifyHmac(env.GARMIN_WEBHOOK_SECRET, sig, bodyText))) {
        return json(401, { error: 'Invalid signature' });
      }
    }

    try {
      const webhookData = JSON.parse(bodyText);
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      const { type, healthType, items } = parsePayload(webhookData);

      const eventIds = [];
      let batchIndex = 0;
      let storageAttempts = 0;

      for (const item of items) {
        const userId = item.userId;
        const activityId = (item.activityId || item.summaryId)?.toString() || null;
        const fileUrl = item.callbackURL || item.fileUrl || null;

        if (!userId) { batchIndex++; continue; }

        // Duplicate check for activity webhooks
        if (activityId && type !== 'HEALTH') {
          const { data: rows } = await supabase
            .from('garmin_webhook_events')
            .select('id, file_url')
            .eq('activity_id', activityId)
            .eq('garmin_user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);
          const existing = rows?.[0] || null;

          if (existing) {
            if (type === 'ACTIVITY_FILE_DATA' && fileUrl) {
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

        // Secondary match: PING with FIT URL but no activity_id
        // ACTIVITY_FILE_DATA items often lack activityId/summaryId.
        // Match to a recent PUSH event from the same user that has no FIT URL yet.
        if (!activityId && type === 'ACTIVITY_FILE_DATA' && fileUrl) {
          const recentWindow = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { data: recentRows } = await supabase
            .from('garmin_webhook_events')
            .select('id, file_url, activity_id')
            .eq('garmin_user_id', userId)
            .is('file_url', null)
            .gte('created_at', recentWindow)
            .in('event_type', ['CONNECT_ACTIVITY', 'ACTIVITY_DETAIL'])
            .order('created_at', { ascending: false })
            .limit(1);

          if (recentRows?.[0]) {
            storageAttempts++;
            await supabase.from('garmin_webhook_events')
              .update({ file_url: fileUrl, processed: false, process_error: null, retry_count: 0, next_retry_at: null })
              .eq('id', recentRows[0].id);
            console.log(`[FIT:MATCH] Matched PING to recent PUSH event ${recentRows[0].activity_id} by userId+time`);
            eventIds.push(recentRows[0].id);
            batchIndex++;
            continue;
          }
        }

        storageAttempts++;
        const { data: event, error } = await supabase
          .from('garmin_webhook_events')
          .insert({
            event_type: type === 'HEALTH' ? `HEALTH_${healthType}` : type,
            garmin_user_id: userId,
            activity_id: activityId,
            file_url: fileUrl,
            file_type: webhookData.fileType || item.fileType || 'FIT',
            upload_timestamp: webhookData.uploadTimestamp ||
              (item.startTimeInSeconds ? new Date(item.startTimeInSeconds * 1000).toISOString() : null) ||
              (webhookData.startTimeInSeconds ? new Date(webhookData.startTimeInSeconds * 1000).toISOString() : null),
            payload: webhookData,
            processed: false,
            retry_count: 0,
            next_retry_at: null,
            batch_index: batchIndex
          })
          .select('id')
          .single();

        if (!error) eventIds.push(event.id);
        batchIndex++;
      }

      // Return 503 when ALL storage attempts failed (e.g. database is down).
      // Garmin will retry delivery. Losing events silently is worse than risking
      // a temporary endpoint disable.
      if (eventIds.length === 0 && storageAttempts > 0) {
        console.error('All event storage failed — returning 503 for Garmin retry', {
          attemptedCount: storageAttempts, type
        });
        return json(503, {
          success: false,
          error: 'Service temporarily unavailable — all event storage failed',
          retryable: true
        });
      }

      if (eventIds.length > 0 && eventIds.length < storageAttempts) {
        console.warn('Partial storage failure', {
          stored: eventIds.length, attempted: storageAttempts, type
        });
      }

      return json(200, { success: true, eventIds, message: `${eventIds.length} events queued` });

    } catch (err) {
      console.error('Webhook error:', err);
      // Return 503 so Garmin retries delivery.
      return json(503, {
        success: false,
        error: 'Service temporarily unavailable',
        retryable: true
      });
    }
  }
};

// --- Helpers ---

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
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
  const expected = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === signature.toLowerCase();
}

function parsePayload(data) {
  const healthTypes = ['dailies', 'sleeps', 'bodyComps', 'stressDetails', 'hrv',
    'epochs', 'respirations', 'pulseOx', 'allDayRespiration', 'bloodPressures', 'userMetrics'];
  for (const ht of healthTypes) {
    if (data[ht]?.length) return { type: 'HEALTH', healthType: ht, items: data[ht] };
  }
  if (data.activityFiles?.length) return { type: 'ACTIVITY_FILE_DATA', items: data.activityFiles };
  if (data.activityDetails?.length) return { type: 'ACTIVITY_DETAIL', items: data.activityDetails };
  if (data.activities?.length) return { type: 'CONNECT_ACTIVITY', items: data.activities };
  return { type: 'UNKNOWN', items: [data] };
}
