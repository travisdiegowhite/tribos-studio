// Wahoo OAuth token handling — the ONE refresh path for every Wahoo caller.
//
// Wahoo rules (cloud-api.wahooligan.com, "Authentication"):
//   - Access tokens live 2 hours; a refresh returns a NEW access + refresh token.
//   - The old pair is revoked only once an API call succeeds with the new one,
//     and from 2026-01-01 an app may hold at most 10 unrevoked tokens per user.
//     So: refresh lazily, only right before a real request, never from a cron,
//     and never twice in parallel (each parallel refresh mints another token).

import { getSupabaseAdmin } from '../supabaseAdmin.js';

export const WAHOO_OAUTH_BASE = 'https://api.wahooligan.com/oauth';
export const WAHOO_API_BASE = 'https://api.wahooligan.com/v1';

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const LOCK_MS = 30 * 1000;
const LOCK_WAIT_MS = 1500;

/** Thrown when the user must reconnect Wahoo (refresh token rejected). */
export class WahooReauthRequired extends Error {
  constructor(message = 'Wahoo authorization expired — reconnect required') {
    super(message);
    this.name = 'WahooReauthRequired';
    this.reauthRequired = true;
  }
}

export function tokenNeedsRefresh(integration, now = Date.now()) {
  if (!integration?.token_expires_at) return true;
  const expiresAt = new Date(integration.token_expires_at).getTime();
  return !Number.isFinite(expiresAt) || expiresAt - REFRESH_BUFFER_MS < now;
}

/** POST /oauth/token. Returns the parsed token response or throws. */
export async function requestWahooToken(params, fetchImpl = fetch) {
  const response = await fetchImpl(`${WAHOO_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.WAHOO_CLIENT_ID,
      client_secret: process.env.WAHOO_CLIENT_SECRET,
      ...params,
    }).toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`Wahoo token request failed (${response.status}): ${text.slice(0, 200)}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

/** Columns to write after a token response. */
export function tokenColumns(tokenData, previousRefreshToken = null) {
  const expiresIn = Number(tokenData.expires_in) || 7200;
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || previousRefreshToken,
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    refresh_token_invalid: false,
    updated_at: new Date().toISOString(),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Return a usable access token for a Wahoo integration row, refreshing it if
 * it is about to expire. Call this immediately before the request that needs
 * the token.
 *
 * @param {object} integration  bike_computer_integrations row (needs id,
 *   access_token, refresh_token, token_expires_at)
 * @param {object} [deps]  { supabase, fetchImpl } for tests
 * @returns {Promise<string>}
 * @throws {WahooReauthRequired} when Wahoo rejects the refresh token
 */
export async function getValidWahooToken(integration, deps = {}) {
  const supabase = deps.supabase || getSupabaseAdmin();
  const fetchImpl = deps.fetchImpl || fetch;

  if (!integration) throw new Error('Wahoo not connected');
  if (integration.refresh_token_invalid) throw new WahooReauthRequired();
  if (!tokenNeedsRefresh(integration)) return integration.access_token;
  if (!integration.refresh_token) throw new WahooReauthRequired('No Wahoo refresh token stored');

  // Take the refresh lock. If someone else holds it, wait and re-read: they are
  // refreshing right now and we should use their token rather than mint another.
  const nowIso = new Date().toISOString();
  const { data: locked } = await supabase
    .from('bike_computer_integrations')
    .update({ refresh_lock_until: new Date(Date.now() + LOCK_MS).toISOString() })
    .eq('id', integration.id)
    .or(`refresh_lock_until.is.null,refresh_lock_until.lt.${nowIso}`)
    .select('id');

  if (!locked || locked.length === 0) {
    await sleep(deps.lockWaitMs ?? LOCK_WAIT_MS);
    const { data: fresh } = await supabase
      .from('bike_computer_integrations')
      .select('access_token, token_expires_at, refresh_token_invalid')
      .eq('id', integration.id)
      .maybeSingle();
    if (fresh?.refresh_token_invalid) throw new WahooReauthRequired();
    if (fresh && !tokenNeedsRefresh(fresh)) return fresh.access_token;
    // Lock holder failed or is slow — fall through and refresh ourselves.
  }

  try {
    const tokenData = await requestWahooToken(
      { grant_type: 'refresh_token', refresh_token: integration.refresh_token },
      fetchImpl,
    );
    const cols = tokenColumns(tokenData, integration.refresh_token);
    await supabase
      .from('bike_computer_integrations')
      .update({ ...cols, refresh_lock_until: null, status: 'active', error_message: null })
      .eq('id', integration.id);
    Object.assign(integration, cols);
    return cols.access_token;
  } catch (err) {
    if (err.status === 400 || err.status === 401) {
      await supabase
        .from('bike_computer_integrations')
        .update({
          refresh_token_invalid: true,
          status: 'reauth_required',
          error_message: 'Wahoo rejected the refresh token — reconnect Wahoo',
          refresh_lock_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);
      throw new WahooReauthRequired();
    }
    await supabase
      .from('bike_computer_integrations')
      .update({ refresh_lock_until: null })
      .eq('id', integration.id);
    throw err;
  }
}

/**
 * Best-effort deauthorization (DELETE /v1/permissions). Never throws — a
 * disconnect must succeed locally even if Wahoo is unreachable.
 */
export async function deauthorizeWahoo(integration, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  try {
    const token = await getValidWahooToken(integration, deps);
    const response = await fetchImpl(`${WAHOO_API_BASE}/permissions`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return { revoked: response.ok, status: response.status };
  } catch (err) {
    return { revoked: false, error: err.message };
  }
}
