// Wahoo Cloud API integration service (OAuth 2.0). See docs/wahoo-integration.md.
//
// Every call to /api/wahoo-auth carries the Supabase session as a Bearer
// token; the server identifies the user from it and ignores any body userId.

import { supabase } from '../lib/supabase';
import { trackSync, trackInteraction, trackFeature, EventType } from './activityTracking';

const WAHOO_OAUTH_BASE = 'https://api.wahooligan.com/oauth';

/**
 * `offline_data` is the scope that makes Wahoo send workout webhooks; without
 * it a connection can never receive a ride. Override with VITE_WAHOO_SCOPES
 * (space-separated) if the developer-portal app has more scopes enabled.
 */
export const WAHOO_SCOPES =
  import.meta.env.VITE_WAHOO_SCOPES || 'email user_read workouts_read offline_data routes_read routes_write';

export const WAHOO_STATE_KEY = 'wahoo_oauth_state';

const getApiBaseUrl = () => (import.meta.env.PROD ? '' : 'http://localhost:3000');

function randomState() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check the `state` Wahoo echoed back against the one we stored before the
 * redirect, then forget it (single use).
 */
export function consumeWahooOAuthState(returnedState) {
  let expected = null;
  try {
    expected = sessionStorage.getItem(WAHOO_STATE_KEY);
    sessionStorage.removeItem(WAHOO_STATE_KEY);
  } catch {
    // Storage blocked — fall through and reject.
  }
  return Boolean(expected) && returnedState === expected;
}

export class WahooService {
  constructor() {
    this.clientId = import.meta.env.VITE_WAHOO_CLIENT_ID;
    this.redirectUri = import.meta.env.VITE_WAHOO_REDIRECT_URI || `${window.location.origin}/wahoo/callback`;
  }

  isConfigured() {
    return !!this.clientId;
  }

  async getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  /** POST an action to /api/wahoo-auth. Returns { ok, status, data }. */
  async callApi(action, payload = {}) {
    const headers = await this.getAuthHeaders();
    if (!headers) throw new Error('User must be authenticated');
    const response = await fetch(`${getApiBaseUrl()}/api/wahoo-auth`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...payload }),
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      // non-JSON error page
    }
    return { ok: response.ok, status: response.status, data };
  }

  /**
   * Build the Wahoo authorize URL. A fresh `state` nonce is stored in
   * sessionStorage and checked by WahooCallback (CSRF protection).
   */
  getAuthorizationUrl() {
    if (!this.isConfigured()) throw new Error('Wahoo client ID must be configured');
    const state = randomState();
    try {
      sessionStorage.setItem(WAHOO_STATE_KEY, state);
    } catch {
      // If storage is blocked the callback will reject; nothing else to do.
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: WAHOO_SCOPES,
      state,
    });
    return `${WAHOO_OAUTH_BASE}/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code) {
    if (!this.isConfigured()) throw new Error('Wahoo client credentials not configured');
    const { ok, status, data } = await this.callApi('exchange_code', { code, scope: WAHOO_SCOPES });
    if (!ok || !data.success) {
      throw new Error(data.details || data.error || `Token exchange failed: ${status}`);
    }
    trackInteraction(EventType.INTEGRATION_CONNECT, { provider: 'wahoo' });
    return data;
  }

  /**
   * @returns {Promise<{connected: boolean, needsReconnect?: boolean, username?: string,
   *   lastSyncAt?: string|null, errorMessage?: string|null}>}
   */
  async getConnectionStatus() {
    try {
      const { ok, data } = await this.callApi('get_connection_status');
      return ok ? data : { connected: false };
    } catch (error) {
      console.error('Error checking Wahoo connection:', error);
      return { connected: false };
    }
  }

  async disconnect() {
    const { ok, data } = await this.callApi('disconnect');
    if (!ok) throw new Error(data.error || 'Failed to disconnect');
    trackInteraction(EventType.INTEGRATION_DISCONNECT, { provider: 'wahoo' });
  }

  async syncWorkouts() {
    trackSync('wahoo', 'start');
    const { ok, data } = await this.callApi('sync_workouts');
    if (!ok) {
      const err = new Error(data.error || 'Failed to sync workouts');
      err.requiresReconnect = Boolean(data.requiresReconnect);
      throw err;
    }
    trackSync('wahoo', 'complete', { workoutsSynced: data.synced || 0 });
    return data;
  }

  /**
   * Push a route to Wahoo (for ELEMNT devices). Resolves with
   * `{ requiresReconnect: true }` rather than throwing when the connection
   * has to be renewed, so the caller can say so.
   */
  async pushRoute(routeData) {
    const { ok, data } = await this.callApi('push_route', { routeData });
    if (!ok) {
      if (data.requiresReconnect) return data;
      throw new Error(data.error || 'Failed to push route to Wahoo');
    }
    trackFeature(EventType.ROUTE_SEND_TO_WAHOO, { routeName: routeData?.name, success: true });
    return data;
  }
}

export const wahooService = new WahooService();
export default wahooService;
