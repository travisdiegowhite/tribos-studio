/**
 * Garmin OAuth 2.0 PKCE — connect / exchange / status / disconnect
 * =========================================================================
 *
 * Phase 3 of the Garmin ping/pull rebuild. Replaces the auth concerns of
 * the 1258-LoC api/garmin-auth.js with a focused ~400-LoC endpoint that
 * does only the four auth actions:
 *
 *   get_authorization_url  → generate PKCE verifier/challenge/state
 *   exchange_token         → code → tokens, fetch provider_user_id, upsert
 *   get_connection_status  → diagnostic
 *   disconnect             → delete integration row
 *
 * Other concerns that lived in the old handler move elsewhere:
 *   - push_route, get_health_data → garmin2-route-push.js (Phase 4)
 *   - sync_activities             → Phase 4 (historical backfill orchestrator)
 *   - refresh_token (manual)      → obsolete; ensureValidAccessToken handles
 *                                   refresh on-demand from every consumer
 *   - repair_connection           → obsolete in the rebuild's require-reconnect
 *                                   model; users with broken integrations
 *                                   re-run the OAuth flow
 *
 * Critical invariants (preserved from the old handler):
 *   - HARD-FAIL if we can't fetch the Garmin User ID after 3 attempts.
 *     The Garmin user ID is `provider_user_id` and is THE linchpin that
 *     matches incoming pings to integration rows. Without it, every ping
 *     for the user silently fails. The old handler logged but proceeded;
 *     the new handler treats it as terminal.
 *   - First-connect detection sets `strava_auto_sync_enabled=false` so
 *     Garmin becomes the primary ingest source (suppresses Strava auto-import).
 *
 * NOTE: NOT registered in vercel.json / not consumed by the frontend yet.
 * Phase 6 cutover repoints garminService.js to /api/garmin2-auth and runs
 * the require-reconnect data update (sets `refresh_token_invalid=true` on
 * all existing rows, prompting users to re-auth via the new endpoint).
 */

import crypto from 'crypto';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { completeActivationStep } from './utils/activation.js';

const supabase = getSupabaseAdmin();

// Garmin Connect OAuth 2.0 PKCE endpoints.
const GARMIN_AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm';
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const GARMIN_USER_ID_URL = 'https://apis.garmin.com/wellness-api/rest/user/id';

// PKCE & state generation -----------------------------------------------------

function base64URLEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(32));
}
function generateCodeChallenge(verifier) {
  return base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
}
function generateState() {
  return base64URLEncode(crypto.randomBytes(24));
}

function callbackUrl() {
  return process.env.GARMIN_CALLBACK_URL
    || `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/oauth/garmin/callback`;
}

// Auth header → user ----------------------------------------------------------

async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Handler ---------------------------------------------------------------------

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 30 requests per minute per IP. Matches the legacy
  // api/garmin-auth.js so we don't surprise existing flows.
  if (await rateLimitMiddleware(req, res, 'garmin2_auth', 30, 60) !== null) return;

  // Prefer auth-header identity over request-body userId.
  const authUser = await getUserFromAuthHeader(req);
  const bodyUserId = req.body?.userId;
  const userId = authUser?.id || bodyUserId;
  if (authUser && bodyUserId && bodyUserId !== authUser.id) {
    console.warn('garmin2-auth: userId mismatch between body and auth header');
  }

  const { action, code, state } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action is required' });

  try {
    switch (action) {
      case 'get_authorization_url':
        return await getAuthorizationUrl(res, userId);
      case 'exchange_token':
        return await exchangeToken(res, userId, code, state);
      case 'get_connection_status':
        return await getConnectionStatus(res, userId);
      case 'disconnect':
        return await disconnect(res, userId);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`garmin2-auth ${action} error:`, err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

// Actions ---------------------------------------------------------------------

async function getAuthorizationUrl(res, userId) {
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (!process.env.GARMIN_CONSUMER_KEY) {
    return res.status(500).json({ error: 'GARMIN_CONSUMER_KEY not configured' });
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Persist the PKCE verifier + state. We reuse the existing garmin_oauth_temp
  // table (no new migration): request_token column holds the state,
  // request_token_secret holds the code_verifier.
  const { error } = await supabase
    .from('garmin_oauth_temp')
    .upsert({
      user_id: userId,
      request_token: state,
      request_token_secret: codeVerifier,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw new Error(`Failed to store PKCE: ${error.message}`);

  const url = `${GARMIN_AUTHORIZE_URL}?` + new URLSearchParams({
    client_id: process.env.GARMIN_CONSUMER_KEY,
    response_type: 'code',
    redirect_uri: callbackUrl(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();

  return res.status(200).json({ success: true, authorizationUrl: url });
}

async function exchangeToken(res, userId, code, state) {
  if (!userId || !code) return res.status(400).json({ error: 'userId + code required' });

  // === Verify state (CSRF protection) ===
  const { data: temp, error: tempErr } = await supabase
    .from('garmin_oauth_temp')
    .select('request_token, request_token_secret')
    .eq('user_id', userId)
    .maybeSingle();
  if (tempErr || !temp) {
    return res.status(400).json({ error: 'Authorization session not found — restart the flow' });
  }
  if (!state || state !== temp.request_token) {
    return res.status(400).json({ error: 'State mismatch (possible CSRF)' });
  }
  const codeVerifier = temp.request_token_secret;

  // === Exchange code for tokens ===
  const tokenRes = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.GARMIN_CONSUMER_KEY,
      client_secret: process.env.GARMIN_CONSUMER_SECRET,
      code,
      redirect_uri: callbackUrl(),
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    throw new Error(`Token exchange failed (${tokenRes.status}): ${body.substring(0, 200)}`);
  }
  const tokenData = await tokenRes.json();

  // === Fetch Garmin user ID (THE LINCHPIN) ===
  // Hard-fail if we can't get it. Without provider_user_id, every ping for
  // this user silently fails to match. 3 attempts with exponential backoff.
  const garminUserId = await fetchGarminUserId(tokenData.access_token);
  if (!garminUserId) {
    throw new Error(
      'Failed to retrieve your Garmin User ID. This is required for activity sync. '
      + 'Please try connecting again.'
    );
  }

  // Access tokens: 24h. Refresh tokens: ~90 days.
  const accessExpiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000);
  const refreshExpiresAt = tokenData.refresh_token_expires_in
    ? new Date(Date.now() + tokenData.refresh_token_expires_in * 1000)
    : new Date(Date.now() + 90 * 86400 * 1000);

  // Detect first connect to suppress Strava auto-import.
  const { data: prior } = await supabase
    .from('bike_computer_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'garmin')
    .maybeSingle();
  const isFirstConnect = !prior;

  // === Persist integration ===
  // Set sync_enabled=true and refresh_token_invalid=false explicitly so the
  // require-reconnect cutover (which sets refresh_token_invalid=true on
  // old rows) gets cleared on re-auth.
  const { error: upsertErr } = await supabase
    .from('bike_computer_integrations')
    .upsert({
      user_id: userId,
      provider: 'garmin',
      provider_user_id: garminUserId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: accessExpiresAt.toISOString(),
      refresh_token_expires_at: refreshExpiresAt.toISOString(),
      refresh_token_invalid: false,
      sync_enabled: true,
      provider_user_data: {
        connected_at: new Date().toISOString(),
        scope: tokenData.scope || null,
        garmin_user_id: garminUserId,
        connected_via: 'garmin2-auth',
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
  if (upsertErr) throw new Error(`Failed to store integration: ${upsertErr.message}`);

  // First-connect housekeeping — Strava auto-import suppression + activation.
  if (isFirstConnect) {
    await supabase
      .from('user_profiles')
      .update({ strava_auto_sync_enabled: false })
      .eq('id', userId)
      .then(({ error }) => {
        if (error) console.warn('strava_auto_sync_enabled update failed (non-fatal):', error.message);
      });
  }
  await completeActivationStep(supabase, userId, 'connect_device').catch(() => {});

  // Clean up PKCE temp row.
  await supabase.from('garmin_oauth_temp').delete().eq('user_id', userId);

  return res.status(200).json({
    success: true,
    message: 'Garmin connected successfully',
    provider_user_id: garminUserId,
  });
}

async function fetchGarminUserId(accessToken) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(GARMIN_USER_ID_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) {
        const data = await r.json();
        if (data?.userId) return data.userId;
      } else {
        lastErr = `HTTP ${r.status}`;
      }
    } catch (err) {
      lastErr = err.message;
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
  console.error('fetchGarminUserId failed after 3 attempts:', lastErr);
  return null;
}

async function getConnectionStatus(res, userId) {
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const { data: integration } = await supabase
    .from('bike_computer_integrations')
    .select('id, provider_user_id, token_expires_at, refresh_token_expires_at, refresh_token_invalid, sync_enabled, last_sync_at, created_at, updated_at')
    .eq('user_id', userId)
    .eq('provider', 'garmin')
    .maybeSingle();

  if (!integration) {
    return res.status(200).json({
      connected: false,
      reason: 'no_integration',
    });
  }
  const now = Date.now();
  const accessExpMs = integration.token_expires_at ? new Date(integration.token_expires_at).getTime() : null;
  const refreshExpMs = integration.refresh_token_expires_at ? new Date(integration.refresh_token_expires_at).getTime() : null;
  return res.status(200).json({
    connected: integration.sync_enabled && !integration.refresh_token_invalid,
    sync_enabled: integration.sync_enabled,
    refresh_token_invalid: integration.refresh_token_invalid,
    has_provider_user_id: Boolean(integration.provider_user_id),
    access_token_expires_at: integration.token_expires_at,
    access_token_expired: accessExpMs ? accessExpMs < now : null,
    refresh_token_expires_at: integration.refresh_token_expires_at,
    refresh_token_expired: refreshExpMs ? refreshExpMs < now : null,
    last_sync_at: integration.last_sync_at,
    connected_at: integration.created_at,
    updated_at: integration.updated_at,
  });
}

async function disconnect(res, userId) {
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const { error } = await supabase
    .from('bike_computer_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'garmin');
  if (error) throw new Error(`Failed to disconnect: ${error.message}`);
  return res.status(200).json({ success: true, message: 'Garmin disconnected' });
}
