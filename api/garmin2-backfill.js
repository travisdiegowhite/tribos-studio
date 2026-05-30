/**
 * Garmin Historical Backfill Orchestrator — user-triggered
 * =========================================================================
 *
 * Phase 4 of the Garmin ping/pull rebuild. This endpoint kicks off
 * Garmin's §8 Summary Backfill flow: we request 2-month chunks of
 * historical data; Garmin queues the chunks and asynchronously sends
 * pings for every activity within the window. Those pings flow through
 * the Cloudflare worker → `garmin_webhook_events` → `api/garmin2-pull.js`
 * cron, where they're pulled and persisted exactly like fresh activities.
 *
 * The heavy lifting lives in `api/utils/garminBackfill.js` (createChunks,
 * executeBackfillForUser, chunk state in `garmin_backfill_chunks`). This
 * endpoint is the thin user-facing wrapper around it.
 *
 * Actions:
 *   POST { action: 'start', yearsBack? }   → kick off; requires up to 5 years
 *   POST { action: 'status' }              → progress + chunk counts
 *   POST { action: 'reset_failed' }        → re-enqueue failed chunks
 *
 * Integration filter matches every other garmin2-* reader:
 *   provider='garmin' AND sync_enabled=true AND refresh_token_invalid=false.
 * NEVER `.eq('status','active')` (phantom column — see hotfix a8f3a43).
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';
import {
  executeBackfillForUser,
  getBackfillProgress,
  resetFailedChunks,
} from './utils/garminBackfill.js';

const supabase = getSupabaseAdmin();

const MAX_YEARS_BACK = 5;
const DEFAULT_YEARS_BACK = 2;

async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.substring(7));
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) return res.status(401).json({ error: 'Authentication required' });

  const { action } = req.body || {};
  try {
    switch (action) {
      case 'start':
        return await startBackfill(req, res, authUser.id);
      case 'status':
        return await getStatus(res, authUser.id);
      case 'reset_failed':
        return await resetFailed(res, authUser.id);
      default:
        return res.status(400).json({ error: `Unknown action: ${action || '<missing>'}` });
    }
  } catch (err) {
    console.error(`garmin2-backfill ${action} error:`, err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

async function startBackfill(req, res, userId) {
  const requested = Number(req.body?.yearsBack ?? DEFAULT_YEARS_BACK);
  const yearsBack = Math.max(1, Math.min(MAX_YEARS_BACK, Number.isFinite(requested) ? requested : DEFAULT_YEARS_BACK));

  const { data: integration, error: lookupErr } = await supabase
    .from('bike_computer_integrations')
    .select('id, user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, refresh_token_invalid, sync_enabled, provider_user_id')
    .eq('user_id', userId)
    .eq('provider', 'garmin')
    .eq('sync_enabled', true)
    .eq('refresh_token_invalid', false)
    .maybeSingle();

  if (lookupErr) throw new Error(`integration lookup: ${lookupErr.message}`);
  if (!integration) {
    return res.status(400).json({
      error: 'Garmin not connected. Connect your Garmin account first.',
      requiresConnection: true,
    });
  }
  if (!integration.provider_user_id) {
    return res.status(400).json({
      error: 'Garmin connection missing user ID. Reconnect to repair.',
      requiresReconnect: true,
    });
  }

  let accessToken;
  try {
    accessToken = await ensureValidAccessToken(integration, supabase);
  } catch (err) {
    return res.status(401).json({
      error: 'Garmin authorization expired. Please reconnect.',
      requiresReconnect: true,
      details: err.message,
    });
  }

  // Kick off. executeBackfillForUser creates chunks if missing, then loops
  // through pending/failed chunks calling requestActivityBackfill for each
  // (with a delay between chunks to respect Garmin's rate limits). Each
  // successful request returns 202 — Garmin then asynchronously delivers
  // pings for activities in that window. Pings drain via garmin2-pull.
  const result = await executeBackfillForUser(userId, accessToken, { yearsBack });

  return res.status(200).json({
    success: true,
    yearsBack,
    message: `Historical backfill kicked off — activities will arrive via webhooks over the next several hours.`,
    ...result,
  });
}

async function getStatus(res, userId) {
  const progress = await getBackfillProgress(userId);
  return res.status(200).json({ success: true, ...progress });
}

async function resetFailed(res, userId) {
  const result = await resetFailedChunks(userId);
  return res.status(200).json({ success: true, ...result });
}
