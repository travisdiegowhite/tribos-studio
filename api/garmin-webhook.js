// Vercel API Route: Garmin Activity Webhook Handler
// Receives push notifications when users sync Garmin devices
// Documentation: https://developer.garmin.com/gc-developer-program/activity-api/
//
// ARCHITECTURE: Store-and-respond pattern
// 1. This handler ONLY stores events and returns 200 (fast, well within 5s)
// 2. Processing happens via api/garmin-webhook-process.js (cron, every minute)
// This eliminates the 5-second Garmin timeout risk entirely.

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';
import { verifySignature, getSignatureFromHeaders } from './utils/garmin/signatureVerifier.js';
import { parseWebhookPayload, extractActivityFields } from './utils/garmin/webhookPayloadParser.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

  // Signature verification
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

            console.log('📍 Updated existing event with FIT URL:', activityId);
            eventIds.push(existingEvent.id);
          } else {
            console.log('ℹ️ Duplicate ignored:', activityId);
          }
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
