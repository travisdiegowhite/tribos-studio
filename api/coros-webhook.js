// Vercel API Route: COROS Workout Webhook Handler
// Receives push notifications when users complete workouts on COROS devices
// Section 5.3 of COROS API Reference V2.0.6
//
// ARCHITECTURE: Store-and-respond pattern (same as Garmin)
// 1. This handler ONLY stores events and returns 200 (fast response)
// 2. Processing happens via api/coros-webhook-process.js (cron, every minute)

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';

// Initialize Supabase (server-side)
const supabase = getSupabaseAdmin();

let lastWebhookReceived = null;

export default async function handler(req, res) {
  if (setupCors(req, res, { allowedMethods: ['POST', 'GET', 'OPTIONS'] })) {
    return;
  }

  // GET handler: Health check / Service Status Check API
  // COROS requires this to return HTTP 200 to verify endpoint availability
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'coros-webhook-handler',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      lastWebhookReceived,
      processing: 'async (cron every minute)'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const { limit, windowMinutes, name } = RATE_LIMITS.COROS_WEBHOOK;
  const rateLimited = await rateLimitMiddleware(req, res, name, limit, windowMinutes);
  if (rateLimited) return;

  try {
    lastWebhookReceived = new Date().toISOString();
    const webhookData = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';

    console.log('📥 COROS webhook received:', {
      ip: clientIP,
      dataKeys: Object.keys(webhookData || {}),
      timestamp: lastWebhookReceived
    });

    // COROS webhook payload structure based on Section 5.3
    // The exact format depends on COROS's push implementation
    // We store the raw payload and parse during processing
    const workouts = Array.isArray(webhookData) ? webhookData : [webhookData];
    const eventIds = [];

    for (const workout of workouts) {
      // Extract key fields from workout data
      const corosUserId = workout.openId || workout.userId || null;
      const workoutId = workout.labelId || workout.planWorkoutId || null;
      const fitUrl = workout.fitUrl || null;
      const mode = workout.mode ?? null;
      const subMode = workout.subMode ?? null;

      if (!corosUserId) {
        console.warn('🚫 Missing COROS user ID in webhook item, skipping');
        continue;
      }

      // Quick duplicate check
      if (workoutId) {
        const { data: existingEvent } = await supabase
          .from('coros_webhook_events')
          .select('id')
          .eq('workout_id', workoutId)
          .eq('coros_user_id', corosUserId)
          .maybeSingle();

        if (existingEvent) {
          console.log('ℹ️ Duplicate COROS webhook event ignored:', workoutId);
          continue;
        }
      }

      // Look up our user by COROS openId
      let userId = null;
      const { data: integration } = await supabase
        .from('bike_computer_integrations')
        .select('user_id, id')
        .eq('provider', 'coros')
        .eq('provider_user_id', corosUserId)
        .maybeSingle();

      if (integration) {
        userId = integration.user_id;
      }

      // Store event for async processing
      const eventData = {
        event_type: 'WORKOUT',
        coros_user_id: corosUserId,
        user_id: userId,
        integration_id: integration?.id || null,
        workout_id: workoutId,
        file_url: fitUrl,
        mode: mode,
        sub_mode: subMode,
        payload: workout,
        processed: false,
        retry_count: 0,
        next_retry_at: null
      };

      const { data: event, error: eventError } = await supabase
        .from('coros_webhook_events')
        .insert(eventData)
        .select('id')
        .single();

      if (eventError) {
        console.error('Failed to store COROS webhook event:', eventError.message);
      } else {
        eventIds.push(event.id);
      }
    }

    console.log(`✅ Stored ${eventIds.length} COROS events for async processing`);

    return res.status(200).json({
      success: true,
      eventIds,
      message: `${eventIds.length} events queued for processing`
    });

  } catch (error) {
    console.error('COROS webhook handler error:', error);
    // Always return 200 to prevent COROS from disabling the webhook
    return res.status(200).json({
      success: false,
      error: 'Webhook storage failed',
      message: 'Event acknowledged but storage failed'
    });
  }
}
