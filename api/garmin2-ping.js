/**
 * Garmin Ping Receiver — Vercel fallback
 * =========================================================================
 *
 * Phase 2 of the Garmin ping/pull rebuild. This is a thin, store-and-respond
 * Vercel endpoint that mirrors the Cloudflare worker's contract for Garmin
 * Activity API §4 PINGs. The worker (deployed at
 * garmin-webhook.tribos.workers.dev) is the production receiver —
 * it decouples webhook receipt from Vercel deploys, which is the property
 * that ended the recurring March 2026 deploy-breaks-webhook outage. This
 * Vercel endpoint exists for:
 *
 *   - Dev / staging when the worker is not in front of this environment.
 *   - Emergency cutback if the worker is down.
 *
 * Garmin Developer Portal can be reconfigured to point pings here in either
 * case.
 *
 * Contract (must match the worker byte-for-byte so the row shape that lands
 * in `garmin_webhook_events` is identical regardless of receiver):
 *
 *   - HMAC-SHA256 over the RAW request bytes (never JSON.stringify(parsed)).
 *     This is the root cause of the March 2026 outage; raw bytes only.
 *   - Missing GARMIN_WEBHOOK_SECRET → warn and accept (graceful degradation
 *     — never hard-reject; another CLAUDE.md hard rule from the same outage).
 *   - Signature header absent but secret configured → warn and accept. Some
 *     Garmin ping configurations deliver unsigned bodies; rejecting them
 *     would defeat the rebuild's whole purpose.
 *   - Respond 200 within 5 s or Garmin disables the endpoint. We use the
 *     existing pingQueue.storePing pattern (single insert per item) and
 *     return as soon as inserts complete.
 *   - On ALL inserts failing, return 503 so Garmin retries delivery. Losing
 *     a ping silently is worse than a brief endpoint disable.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import {
  verifySignature,
  getSignatureFromHeaders,
} from './utils/garmin/signatureVerifier.js';
import {
  classifyPayload,
  validatePingItem,
  eventTypeFor,
  HANDLED_HEALTH_TYPES,
} from './utils/garmin2/pingParser.js';
import { storePing, ACTIVITY_PING } from './utils/garmin2/pingQueue.js';

// Disable Vercel's automatic body parsing so we can access the raw bytes for
// HMAC verification. See the file header for why this matters.
export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = getSupabaseAdmin();

function getRawBody(req) {
  if (req.body) {
    return Promise.resolve(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (setupCors(req, res, { allowedMethods: ['POST', 'GET', 'OPTIONS'] })) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'garmin2-ping-receiver',
      version: '1.0.0',
      note: 'Vercel fallback for the Cloudflare worker. Primary receiver is the worker.',
      timestamp: new Date().toISOString(),
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('garmin2-ping: failed to read body:', err);
    return res.status(400).json({ error: 'Could not read body' });
  }

  // Signature verification — see file header for the policy rationale.
  // Read the env var per-request (serverless env can change between cold
  // starts, and module-load capture would hide later config changes).
  const webhookSecret = process.env.GARMIN_WEBHOOK_SECRET;
  if (webhookSecret) {
    const sig = getSignatureFromHeaders(req.headers);
    if (sig) {
      const result = verifySignature(webhookSecret, sig, rawBody);
      if (!result.valid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else {
      // Secret configured but no signature header → warn+accept (some Garmin
      // ping configs are unsigned; rejecting would break the integration).
      console.warn('garmin2-ping: secret configured but no signature header on request — accepting');
    }
  } else {
    console.warn('⚠️ GARMIN_WEBHOOK_SECRET not configured — accepting without verification.');
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    console.error('garmin2-ping: malformed JSON:', err.message);
    return res.status(400).json({ error: 'Malformed JSON' });
  }

  const classification = classifyPayload(body);

  // Drop unhandled health types at the door (epochs, allDayRespiration,
  // userMetrics, etc.) — same policy as the worker and legacy handler.
  if (classification.kind === 'UNKNOWN') {
    return res.status(200).json({ stored: 0, skipped: classification.items.length || 0, reason: 'unhandled_or_unknown_payload' });
  }
  if (classification.kind === 'PING_HEALTH' && !HANDLED_HEALTH_TYPES.has(classification.healthType)) {
    return res.status(200).json({ stored: 0, skipped: classification.items.length, reason: 'unhandled_health_type' });
  }

  // This receiver is intentionally PING-only. Legacy PUSH events still arrive
  // at api/garmin-webhook.js until the portal cutover. If we receive a PUSH
  // shape here it's a misconfiguration — log and accept (200) so Garmin
  // doesn't disable us, but don't queue.
  if (!classification.kind.startsWith('PING_')) {
    console.warn(`garmin2-ping: received non-ping payload kind=${classification.kind}; ignoring (use /api/garmin-webhook for push)`);
    return res.status(200).json({ stored: 0, reason: 'push-not-supported-here' });
  }

  const eventType = eventTypeFor(classification);
  let stored = 0;
  let attempts = 0;
  const eventIds = [];

  for (const item of classification.items) {
    const missing = validatePingItem(item);
    if (missing.length > 0) {
      console.warn(`garmin2-ping: dropping invalid ping item, missing: ${missing.join(',')}`);
      continue;
    }
    attempts++;
    const { id, error } = await storePing(supabase, item, { eventType });
    if (error) {
      console.error('garmin2-ping: insert failed:', error.message);
      continue;
    }
    stored++;
    eventIds.push(id);
  }

  // All inserts failed and we tried at least one → 503 so Garmin retries.
  if (stored === 0 && attempts > 0) {
    console.error('garmin2-ping: all inserts failed; returning 503 for Garmin retry');
    return res.status(503).json({ success: false, error: 'Storage temporarily unavailable', retryable: true });
  }

  return res.status(200).json({
    success: true,
    stored,
    attempted: attempts,
    eventIds,
    eventType,
  });
}
