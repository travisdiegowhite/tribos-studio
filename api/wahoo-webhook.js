// Vercel API Route: Wahoo Cloud webhook receiver.
// Docs: cloud-api.wahooligan.com → "Webhooks". See docs/wahoo-integration.md.
//
// What Wahoo actually sends (the previous handler expected a different shape
// and so never imported a workout):
//
//   POST, Content-Type: application/json
//   {
//     "event_type": "workout_summary",
//     "webhook_token": "<the token set on the app in the Wahoo developer portal>",
//     "user": { "id": 60462 },
//     "workout_summary": {
//       "id": …, "distance_accum": "1234.5", …,          // decimals are STRINGS
//       "file": { "url": "https://cdn.wahooligan.com/…" },
//       "workout": { "id": …, "starts": …, "workout_type_id": 0, … }
//     }
//   }
//
// Webhooks are only sent for users whose token carries the `offline_data`
// scope. Wahoo retries a delivery that does not get HTTP 200 after 30 min,
// 4 h, 24 h and 72 h, and may send duplicates — so this handler is idempotent
// and returns 5xx on a transient failure to get that retry for free.

import crypto from 'crypto';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { ingestWahooWorkout } from './utils/wahoo/ingest.js';
import { isProductionRuntime } from './utils/wahoo/fileHosts.js';

const supabase = getSupabaseAdmin();

const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const rateLimitStore = new Map();

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Wahoo puts the portal's webhook token in the body (`webhook_token`). The
 * `?token=` query form is still accepted for a webhook URL registered under
 * the old instructions.
 *
 * @returns {{ ok: boolean, status?: number, error?: string }}
 */
export function verifyWahooWebhookToken(req, env = process.env) {
  const expected = env.WAHOO_WEBHOOK_TOKEN;
  if (!expected) {
    if (isProductionRuntime(env)) {
      return { ok: false, status: 401, error: 'Webhook token not configured' };
    }
    console.warn('⚠️ WAHOO_WEBHOOK_TOKEN not configured — skipping verification (non-production)');
    return { ok: true };
  }
  const provided = req.body?.webhook_token ?? req.query?.token;
  if (!provided) return { ok: false, status: 401, error: 'Missing webhook token' };
  if (!safeEqual(provided, expected)) return { ok: false, status: 401, error: 'Invalid webhook token' };
  return { ok: true };
}

/** The body minus the shared secret, which must never be persisted. */
function redact(body) {
  const { webhook_token: _omit, ...rest } = body || {};
  return rest;
}

async function storeEvent(row) {
  try {
    const { data, error } = await supabase
      .from('wahoo_webhook_events')
      .insert(row)
      .select('id')
      .single();
    if (error) {
      console.warn(`⚠️ wahoo_webhook_events insert failed (migration 140 applied?): ${error.message}`);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn(`⚠️ wahoo_webhook_events insert threw: ${err.message}`);
    return null;
  }
}

async function finishEvent(eventId, fields) {
  if (!eventId) return;
  try {
    await supabase
      .from('wahoo_webhook_events')
      .update({ ...fields, processed_at: new Date().toISOString() })
      .eq('id', eventId);
  } catch (err) {
    console.warn(`⚠️ wahoo_webhook_events update threw: ${err.message}`);
  }
}

export default async function handler(req, res) {
  if (setupCors(req, res, { allowedMethods: ['POST', 'GET', 'OPTIONS'] })) return;

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'wahoo-webhook-handler', timestamp: new Date().toISOString() });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  let limit = rateLimitStore.get(clientIP);
  if (!limit || now - limit.windowStart > RATE_LIMIT_WINDOW_MS) limit = { windowStart: now, count: 0 };
  limit.count++;
  rateLimitStore.set(clientIP, limit);
  if (limit.count > RATE_LIMIT_MAX_REQUESTS) return res.status(429).json({ error: 'Too many requests' });

  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid payload format' });

  const auth = verifyWahooWebhookToken(req);
  if (!auth.ok) {
    console.warn(`🚨 Wahoo webhook rejected (${auth.error}) from ${clientIP}`);
    return res.status(auth.status).json({ error: auth.error });
  }

  const eventType = body.event_type;
  if (eventType !== 'workout_summary') {
    console.log('Ignoring Wahoo webhook event:', eventType);
    return res.status(200).json({ success: true, message: 'Event ignored' });
  }

  const wahooUserId = body.user?.id;
  const summary = body.workout_summary;
  const workout = summary?.workout;
  if (!wahooUserId || !summary || typeof summary !== 'object') {
    return res.status(400).json({ error: 'Invalid payload — missing user or workout_summary' });
  }

  console.log('📥 Wahoo webhook:', {
    wahooUserId,
    workoutId: workout?.id,
    summaryId: summary.id,
    workoutTypeId: workout?.workout_type_id,
    hasFile: Boolean(summary.file?.url),
  });

  const { data: integration, error: lookupError } = await supabase
    .from('bike_computer_integrations')
    .select('id, user_id, access_token, refresh_token, token_expires_at, refresh_token_invalid, last_sync_at')
    .eq('provider', 'wahoo')
    .eq('provider_user_id', String(wahooUserId))
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error('❌ Wahoo integration lookup failed:', lookupError.message);
    return res.status(500).json({ error: 'Lookup failed' }); // transient → Wahoo retries
  }
  if (!integration) {
    console.log('No tribos integration for Wahoo user', wahooUserId);
    return res.status(200).json({ success: true, message: 'User not linked' });
  }

  const raw = redact(body);
  const eventId = await storeEvent({
    event_type: eventType,
    wahoo_user_id: String(wahooUserId),
    user_id: integration.user_id,
    workout_id: workout?.id != null ? String(workout.id) : null,
    summary_id: summary.id != null ? String(summary.id) : null,
    payload: raw,
  });

  try {
    const result = await ingestWahooWorkout(integration, { summary, workout }, { source: 'wahoo_webhook', raw });
    await finishEvent(eventId, {
      status: result.status === 'skipped' ? 'skipped' : 'processed',
      result: result.status === 'skipped' ? result.reason : result.status,
      activity_id: result.activityId ?? null,
      process_error: result.fitNote && result.fitNote !== 'no file url' ? `fit: ${result.fitNote}` : null,
    });
    console.log(`✅ Wahoo webhook ${result.status}`, result.activityId || result.reason || '');
    return res.status(200).json({ success: true, result: result.status, activityId: result.activityId ?? null });
  } catch (err) {
    console.error('❌ Wahoo webhook processing failed:', err.message);
    await finishEvent(eventId, { status: 'error', process_error: String(err.message).slice(0, 1000) });
    // 5xx on purpose: Wahoo redelivers (30 min / 4 h / 24 h / 72 h) and the
    // importer is idempotent, so a transient failure heals itself.
    return res.status(500).json({ error: 'Processing failed — will be retried' });
  }
}
