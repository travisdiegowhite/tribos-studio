// Vercel API Route: Wahoo Cloud connection (OAuth 2.0) + manual sync + route push.
// See docs/wahoo-integration.md.
//
// Every action authenticates the caller with requireAuth() and acts on THAT
// user. The body `userId` the old client sent is ignored — trusting it let
// anyone disconnect, sync or push routes for any account.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { setupCors } from './utils/cors.js';
import { requireAuth } from './utils/auth.js';
import { completeActivationStep } from './utils/activation.js';
import {
  WAHOO_API_BASE,
  WahooReauthRequired,
  deauthorizeWahoo,
  getValidWahooToken,
  requestWahooToken,
  tokenColumns,
} from './utils/wahoo/tokens.js';
import { ingestWahooWorkout } from './utils/wahoo/ingest.js';
import { WAHOO_FAMILY_BIKING, WAHOO_FAMILY_RUNNING } from './utils/wahoo/workoutTypes.js';

const supabase = getSupabaseAdmin();

/** Scopes we ask for. `offline_data` is what makes Wahoo send webhooks. */
export const WAHOO_DEFAULT_SCOPES = ['email', 'user_read', 'workouts_read', 'offline_data', 'routes_read', 'routes_write'];

// Manual sync budget. Sandbox apps get 25 requests / 5 min for the WHOLE app,
// so a sync reads at most a few pages and leaves headroom for everyone else.
const SYNC_PER_PAGE = 30;
const SYNC_MAX_PAGES = 2;
const SYNC_TIME_BUDGET_MS = 45 * 1000;
const RATE_LIMIT_FLOOR = 3;

const INTEGRATION_COLUMNS =
  'id, user_id, provider_user_id, provider_user_data, access_token, refresh_token, token_expires_at, ' +
  'refresh_token_invalid, scopes, status, error_message, last_sync_at, sync_enabled, updated_at';

export function parseScopes(scope) {
  if (Array.isArray(scope)) return scope.filter(Boolean);
  if (typeof scope === 'string' && scope.trim()) return scope.trim().split(/[\s,]+/);
  return null;
}

/** True when this connection cannot receive rides and the user must reconnect. */
export function needsReconnect(integration) {
  if (!integration) return false;
  if (integration.refresh_token_invalid) return true;
  const scopes = parseScopes(integration.scopes);
  return !scopes || !scopes.includes('offline_data');
}

function redirectUri() {
  if (process.env.WAHOO_REDIRECT_URI) return process.env.WAHOO_REDIRECT_URI;
  const baseUrl = process.env.PRODUCTION_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || 'http://localhost:3000';
  return `${baseUrl}/oauth/wahoo/callback`;
}

async function loadIntegration(userId) {
  const { data, error } = await supabase
    .from('bike_computer_integrations')
    .select(INTEGRATION_COLUMNS)
    .eq('user_id', userId)
    .eq('provider', 'wahoo')
    .maybeSingle();
  if (error) throw new Error(`Failed to load Wahoo integration: ${error.message}`);
  return data;
}

function reconnectResponse(res) {
  return res.status(401).json({
    error: 'Your Wahoo connection has expired. Reconnect Wahoo in Settings.',
    requiresReconnect: true,
  });
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rateLimitResult = await rateLimitMiddleware(req, res, 'wahoo_auth', 30, 60);
  if (rateLimitResult !== null) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (!process.env.WAHOO_CLIENT_ID || !process.env.WAHOO_CLIENT_SECRET) {
    return res.status(200).json({ error: 'Wahoo integration not configured', configured: false });
  }

  const { action, code, routeData, scope } = req.body || {};

  try {
    switch (action) {
      case 'exchange_code':
        return await exchangeCodeForToken(res, user.id, code, scope);
      case 'get_connection_status':
        return await getConnectionStatus(res, user.id);
      case 'disconnect':
        return await disconnect(res, user.id);
      case 'sync_workouts':
        return await syncWorkouts(res, user.id);
      case 'push_route':
        return await pushRoute(res, user.id, routeData);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    if (error instanceof WahooReauthRequired) return reconnectResponse(res);
    console.error(`Wahoo ${action} error:`, error.message);
    return res.status(500).json({
      error: 'Wahoo request failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

async function exchangeCodeForToken(res, userId, code, requestedScope) {
  if (!code) return res.status(400).json({ error: 'Authorization code required' });

  const uri = redirectUri();
  let tokenData;
  try {
    tokenData = await requestWahooToken({ code, grant_type: 'authorization_code', redirect_uri: uri });
  } catch (err) {
    console.error('❌ Wahoo token exchange failed:', { status: err.status, redirect_uri_used: uri, error: err.message });
    if (err.status === 400 || err.status === 401) {
      return res.status(400).json({
        error: 'Wahoo authentication failed',
        details: "The authorization code may have expired or the redirect URI doesn't match. Please try again.",
      });
    }
    throw err;
  }

  // Wahoo's user record gives us the id webhooks are addressed to.
  let wahooUser = {};
  try {
    const userResponse = await fetch(`${WAHOO_API_BASE}/user`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userResponse.ok) wahooUser = await userResponse.json();
    else console.warn('⚠️ Wahoo /v1/user returned', userResponse.status);
  } catch (err) {
    console.warn('⚠️ Wahoo /v1/user failed:', err.message);
  }
  if (!wahooUser.id) {
    // Without the Wahoo user id no webhook can ever be matched to this user.
    return res.status(502).json({ error: 'Could not read your Wahoo account. Please try connecting again.' });
  }

  // Prefer what Wahoo says it granted; fall back to what the client requested.
  const scopes = parseScopes(tokenData.scope) || parseScopes(requestedScope) || WAHOO_DEFAULT_SCOPES;

  const now = new Date().toISOString();
  const { error: dbError } = await supabase
    .from('bike_computer_integrations')
    .upsert({
      user_id: userId,
      provider: 'wahoo',
      provider_user_id: String(wahooUser.id),
      provider_user_data: {
        email: wahooUser.email ?? null,
        first: wahooUser.first ?? null,
        last: wahooUser.last ?? null,
        created_at: wahooUser.created_at ?? null,
      },
      ...tokenColumns(tokenData),
      scopes,
      status: 'active',
      error_message: null,
      sync_enabled: true,
      refresh_lock_until: null,
      updated_at: now,
    }, { onConflict: 'user_id,provider' });

  if (dbError) {
    console.error('Database error storing Wahoo tokens:', dbError.message);
    throw new Error('Failed to store authentication data');
  }

  // Strava auto-import is NOT switched off here any more — the first workout
  // that actually imports does it (api/utils/wahoo/ingest.js), so a Wahoo
  // connection that never delivers can never silence Strava.
  await completeActivationStep(supabase, userId, 'connect_device').catch(() => {});

  console.log(`✅ Wahoo connected for ${userId} (wahoo user ${wahooUser.id}, scopes: ${scopes.join(' ')})`);
  return res.status(200).json({
    success: true,
    scopes,
    webhooksEnabled: scopes.includes('offline_data'),
    user: {
      id: wahooUser.id,
      email: wahooUser.email ?? null,
      name: `${wahooUser.first || ''} ${wahooUser.last || ''}`.trim(),
    },
  });
}

async function getConnectionStatus(res, userId) {
  const integration = await loadIntegration(userId);
  if (!integration) return res.status(200).json({ connected: false });

  const data = integration.provider_user_data || {};
  const name = `${data.first || ''} ${data.last || ''}`.trim();
  return res.status(200).json({
    connected: true,
    needsReconnect: needsReconnect(integration),
    username: data.email || name || null,
    userId: integration.provider_user_id,
    syncEnabled: integration.sync_enabled,
    lastSyncAt: integration.last_sync_at,
    errorMessage: integration.error_message,
    lastUpdated: integration.updated_at,
  });
}

async function disconnect(res, userId) {
  const integration = await loadIntegration(userId);
  if (integration) {
    // Best effort — revoke on Wahoo's side so webhooks stop, then forget locally.
    const revoke = await deauthorizeWahoo(integration);
    console.log('Wahoo deauthorization:', revoke);
  }

  const { error } = await supabase
    .from('bike_computer_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'wahoo');
  if (error) throw new Error(`Failed to disconnect Wahoo: ${error.message}`);

  return res.status(200).json({ success: true, message: 'Wahoo connection disconnected' });
}

async function syncWorkouts(res, userId) {
  const integration = await loadIntegration(userId);
  if (!integration) return res.status(400).json({ error: 'Wahoo not connected' });

  const started = Date.now();
  const counts = { inserted: 0, updated: 0, merged: 0, takeover: 0, unchanged: 0, skipped: 0, errors: 0 };
  let fetched = 0;
  let stoppedEarly = null;

  for (let page = 1; page <= SYNC_MAX_PAGES; page++) {
    const token = await getValidWahooToken(integration);
    const response = await fetch(`${WAHOO_API_BASE}/workouts?page=${page}&per_page=${SYNC_PER_PAGE}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401 || response.status === 403) return reconnectResponse(res);
    if (response.status === 429) {
      stoppedEarly = 'Wahoo rate limit reached — try again in a few minutes';
      break;
    }
    if (!response.ok) throw new Error(`Wahoo workouts list failed (page ${page}): ${response.status}`);

    const body = await response.json();
    const workouts = Array.isArray(body.workouts) ? body.workouts : [];
    fetched += workouts.length;

    for (const workout of workouts) {
      if (Date.now() - started > SYNC_TIME_BUDGET_MS) {
        stoppedEarly = 'Sync paused to stay within the time limit — run it again to continue';
        break;
      }
      try {
        const result = await ingestWahooWorkout(integration, { workout }, {
          source: 'wahoo_manual_sync',
          raw: workout,
          skipExisting: true,
        });
        counts[result.status] = (counts[result.status] || 0) + 1;
      } catch (err) {
        console.error(`Wahoo sync: workout ${workout?.id} failed:`, err.message);
        counts.errors++;
      }
    }
    if (stoppedEarly) break;

    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const total = Number(body.total);
    const more = workouts.length === SYNC_PER_PAGE && (!Number.isFinite(total) || page * SYNC_PER_PAGE < total);
    if (!more) break;
    if (Number.isFinite(remaining) && remaining < RATE_LIMIT_FLOOR) {
      stoppedEarly = 'Wahoo rate limit nearly reached — try again in a few minutes';
      break;
    }
  }

  // last_sync_at is set by the importer only when a workout actually lands —
  // an empty sync must not look like a received ride (or pre-empt the
  // first-import Strava switch-off in ingest.js).
  const newCount = counts.inserted + counts.takeover;
  const message = stoppedEarly
    ? `Synced ${newCount} new workout${newCount === 1 ? '' : 's'}. ${stoppedEarly}.`
    : `Synced ${newCount} new workout${newCount === 1 ? '' : 's'} from Wahoo`;

  console.log(`✅ Wahoo manual sync for ${userId}:`, { fetched, ...counts, stoppedEarly });
  return res.status(200).json({
    success: true,
    synced: newCount,
    ...counts,
    total: fetched,
    partial: Boolean(stoppedEarly),
    message,
  });
}

/**
 * Push a route to Wahoo Cloud as a base64 FIT course (POST /v1/routes). The
 * FIT is encoded client-side (src/utils/fitCourseEncoder.ts) and arrives as a
 * data URI in routeData.fitBase64 ("data:application/vnd.fit;base64,…").
 */
async function pushRoute(res, userId, routeData) {
  if (!routeData) return res.status(400).json({ error: 'routeData required' });
  if (!routeData.fitBase64 || !String(routeData.fitBase64).startsWith('data:application/vnd.fit;base64,')) {
    return res.status(400).json({ error: 'routeData.fitBase64 (FIT data URI) required' });
  }

  const integration = await loadIntegration(userId);
  if (!integration) return res.status(400).json({ error: 'Wahoo not connected' });
  const token = await getValidWahooToken(integration);

  const safeName = String(routeData.name || 'Tribos Route').slice(0, 120);
  const filename = safeName.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'route';
  const isRun = routeData.sport === 'running';

  const wahooRoute = {
    route: {
      name: safeName,
      description: routeData.description || '',
      file: routeData.fitBase64,
      filename: `${filename}.fit`,
      external_id: String(routeData.external_id || `tribos-${userId}-${Date.now()}`),
      provider_updated_at: new Date().toISOString(),
      workout_type_family_id: isRun ? WAHOO_FAMILY_RUNNING : WAHOO_FAMILY_BIKING,
      start_lat: routeData.start_lat ?? null,
      start_lng: routeData.start_lng ?? null,
      distance: routeData.distance_m ?? 0,
      ascent: routeData.ascent_m ?? 0,
      descent: routeData.descent_m ?? 0,
    },
  };

  const response = await fetch(`${WAHOO_API_BASE}/routes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(wahooRoute),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Wahoo route push error:', response.status, errorText.slice(0, 300));
    if (response.status === 401 || response.status === 403) {
      // 403 also means the token lacks routes_write (connected before we asked for it).
      return reconnectResponse(res);
    }
    return res.status(502).json({
      error: `Wahoo rejected the route (${response.status})`,
      details: errorText.slice(0, 300),
    });
  }

  const result = await response.json();
  return res.status(200).json({
    success: true,
    routeId: result.route?.id ?? result.id ?? null,
    message: isRun
      ? 'Route sent to Wahoo. It will appear in your Wahoo routes.'
      : 'Route sent to Wahoo. Sync your ELEMNT to download it.',
  });
}
