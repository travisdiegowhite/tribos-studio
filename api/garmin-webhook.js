// Vercel API Route: Garmin Activity Webhook Handler
// Receives push notifications when users sync Garmin devices
// Documentation: https://developer.garmin.com/gc-developer-program/activity-api/
//
// ARCHITECTURE: Store-and-respond pattern
// 1. This handler ONLY stores events and returns 200 (fast, well within 5s)
// 2. Processing happens via api/garmin-webhook-process.js (cron, every minute)
// This eliminates the 5-second Garmin timeout risk entirely.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';
import { verifySignature, getSignatureFromHeaders } from './utils/garmin/signatureVerifier.js';
import { parseWebhookPayload, extractActivityFields } from './utils/garmin/webhookPayloadParser.js';

// Disable Vercel's automatic body parsing so we can access the raw body
// for accurate HMAC signature verification (JSON.stringify on a parsed
// object produces different bytes than the original payload)
export const config = {
  api: {
    bodyParser: false
  }
};

/**
 * Read the raw request body from the stream.
 * Required for accurate webhook signature verification.
 */
function getRawBody(req) {
  // If body was already parsed (e.g. in dev/test), use it directly
  if (req.body) {
    return Promise.resolve(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Initialize Supabase (server-side)
const supabase = getSupabaseAdmin();

const WEBHOOK_SECRET = process.env.GARMIN_WEBHOOK_SECRET;

let lastWebhookReceived = null;

export default async function handler(req, res) {
  if (setupCors(req, res, { allowedMethods: ['POST', 'GET', 'OPTIONS'] })) {
    return;
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'garmin-webhook-handler',
      version: '3.0.0',
      timestamp: new Date().toISOString(),
      lastWebhookReceived,
      processing: 'async (cron every minute)',
      endpoints: {
        webhook: 'POST /api/garmin-webhook',
        health: 'GET /api/garmin-webhook',
        status: 'GET /api/garmin-webhook-status'
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting (Supabase-backed, distributed across serverless instances)
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  const { limit, windowMinutes, name } = RATE_LIMITS.GARMIN_WEBHOOK;
  const rateLimited = await rateLimitMiddleware(req, res, name, limit, windowMinutes);
  if (rateLimited) return;

  // Read raw body for accurate signature verification
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (bodyErr) {
    console.error('Failed to read request body:', bodyErr.message);
    return res.status(400).json({ error: 'Failed to read request body' });
  }

  // Signature verification (using raw bytes, not re-serialized JSON)
  const sigResult = verifySignature(
    WEBHOOK_SECRET,
    getSignatureFromHeaders(req.headers),
    rawBody
  );
  if (!sigResult.valid) {
    console.warn(`${sigResult.error} from:`, clientIP);
    return res.status(401).json({ error: sigResult.error });
  }

  try {
    lastWebhookReceived = new Date().toISOString();
    const webhookData = typeof rawBody === 'object' ? rawBody : JSON.parse(rawBody);
    const parsed = parseWebhookPayload(webhookData);

    console.log('📥 Garmin webhook received:', {
      type: parsed.type,
      healthType: parsed.healthType || null,
      itemCount: parsed.items.length,
      ip: clientIP
    });

    // Store every item as a separate event for the processor to pick up
    const eventIds = [];
    let batchIndex = 0;

    for (const item of parsed.items) {
      const { userId, activityId, fileUrl } = extractActivityFields(item, webhookData);

      if (!userId) {
        console.warn('🚫 Missing userId in webhook item, skipping');
        continue;
      }

      // Quick duplicate check for activity webhooks (avoid storing dupes)
      if (activityId && parsed.type !== 'HEALTH') {
        const { data: existingEvents } = await supabase
          .from('garmin_webhook_events')
          .select('id, file_url')
          .eq('activity_id', activityId)
          .eq('garmin_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        const existingEvent = existingEvents?.[0] || null;

        if (existingEvent) {
          const hasNewFileUrl = fileUrl && !existingEvent.file_url;
          const isFileDataWebhook = parsed.type === 'ACTIVITY_FILE_DATA';

          if (isFileDataWebhook && hasNewFileUrl) {
            // Update existing event with new FIT URL and mark for reprocessing
            await supabase
              .from('garmin_webhook_events')
              .update({
                file_url: fileUrl,
                processed: false,
                process_error: null,
                retry_count: 0,
                next_retry_at: null
              })
              .eq('id', existingEvent.id);

            console.log(`[FIT:MATCH] Updated existing event ${existingEvent.id} with FIT URL for activity: ${activityId}`);
            eventIds.push(existingEvent.id);
          } else {
            console.log(`[FIT:SKIP] Duplicate webhook ignored for activity: ${activityId} (hasNewFileUrl: ${hasNewFileUrl}, isFileData: ${isFileDataWebhook})`);
          }
          batchIndex++;
          continue;
        }
      }

      // Secondary match: PING with FIT URL but no exact activity_id match
      // Try to find a recent PUSH event for this user that needs a FIT URL
      if (!activityId && parsed.type === 'ACTIVITY_FILE_DATA' && fileUrl) {
        const recentWindow = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { data: recentPush } = await supabase
          .from('garmin_webhook_events')
          .select('id, file_url, activity_id')
          .eq('garmin_user_id', userId)
          .is('file_url', null)
          .gte('created_at', recentWindow)
          .in('event_type', ['CONNECT_ACTIVITY', 'ACTIVITY_DETAIL'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (recentPush?.[0]) {
          await supabase
            .from('garmin_webhook_events')
            .update({
              file_url: fileUrl,
              processed: false,
              process_error: null,
              retry_count: 0,
              next_retry_at: null
            })
            .eq('id', recentPush[0].id);

          console.log(`[FIT:MATCH] Matched PING to recent PUSH event ${recentPush[0].activity_id} by userId+time`);
          eventIds.push(recentPush[0].id);
          batchIndex++;
          continue;
        }
      }

      // Store the event - processor will handle it
      const eventData = {
        event_type: parsed.type === 'HEALTH' ? `HEALTH_${parsed.healthType}` : parsed.type,
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
      };

      const { data: event, error: eventError } = await supabase
        .from('garmin_webhook_events')
        .insert(eventData)
        .select('id')
        .single();

      if (eventError) {
        console.error('Failed to store event:', eventError.message);
      } else {
        eventIds.push(event.id);
      }

      batchIndex++;
    }

    console.log(`✅ Stored ${eventIds.length} events for async processing`);

    return res.status(200).json({
      success: true,
      eventIds,
      message: `${eventIds.length} events queued for processing`
    });

  } catch (error) {
    console.error('Webhook handler error:', error);
    // Always 200 to prevent Garmin from disabling the webhook
    return res.status(200).json({
      success: false,
      error: 'Webhook storage failed',
      message: 'Event acknowledged but storage failed'
    });
  }
}
