/**
 * Tests for the Garmin OAuth PKCE handler. Coverage targets the
 * critical-path invariants:
 *   - PKCE row written; authorize URL carries client_id + S256 challenge + state
 *   - State mismatch on exchange_token → 400 (CSRF protection)
 *   - provider_user_id hard-fail when /user/id endpoint can't be reached
 *     (Garmin user id is the ping→integration linchpin)
 *   - Disconnect deletes the row
 *
 * The handler reads env at request time so we can set/unset vars per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn(() => false) }));
vi.mock('./utils/rateLimit.js', () => ({
  rateLimitMiddleware: vi.fn().mockResolvedValue(null),  // null = not rate-limited
  RATE_LIMITS: {},
}));
vi.mock('./utils/activation.js', () => ({
  completeActivationStep: vi.fn().mockResolvedValue(null),
}));

// In-memory PKCE temp store + integration store so the handler's reads/writes
// can be observed.
const tempStore = new Map();          // userId → { request_token, request_token_secret }
const integrationStore = new Map();    // userId → integration row
const deletedIntegrations = new Set();
const upsertedProfiles = new Map();

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => makeFakeSupabase(),
}));

function makeFakeSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from(table) {
      let pendingUpsert = null;
      let pendingDelete = false;
      let pendingUpdate = null;
      const filters = {};
      const b = {
        select(_cols) { return b; },
        eq(col, val) { filters[col] = val; return b; },
        upsert(payload, _opts) {
          pendingUpsert = { table, payload };
          return {
            then(resolve) { return Promise.resolve(applyUpsert(pendingUpsert)).then(resolve); },
          };
        },
        delete() { pendingDelete = true; return b; },
        update(patch) { pendingUpdate = patch; return b; },
        maybeSingle() {
          if (table === 'garmin_oauth_temp') {
            const row = tempStore.get(filters.user_id);
            return Promise.resolve({ data: row || null, error: null });
          }
          if (table === 'bike_computer_integrations') {
            const row = integrationStore.get(filters.user_id);
            return Promise.resolve({ data: row || null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() { return b.maybeSingle(); },
        then(resolve, reject) {
          // Terminal awaits for the chain (delete / update without .select).
          if (pendingDelete && table === 'bike_computer_integrations') {
            deletedIntegrations.add(filters.user_id);
            integrationStore.delete(filters.user_id);
          }
          if (pendingDelete && table === 'garmin_oauth_temp') {
            tempStore.delete(filters.user_id);
          }
          if (pendingUpdate && table === 'user_profiles') {
            upsertedProfiles.set(filters.id, pendingUpdate);
          }
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return b;
    },
  };

  function applyUpsert({ table, payload }) {
    if (table === 'garmin_oauth_temp') {
      tempStore.set(payload.user_id, {
        request_token: payload.request_token,
        request_token_secret: payload.request_token_secret,
      });
    } else if (table === 'bike_computer_integrations') {
      integrationStore.set(payload.user_id, payload);
    }
    return { error: null };
  }
}

import handler from './garmin2-auth.js';

function mockRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function mockReq({ body = {}, headers = {} } = {}) {
  return { method: 'POST', body, headers };
}

const USER = 'user-uuid-1';

beforeEach(() => {
  tempStore.clear();
  integrationStore.clear();
  deletedIntegrations.clear();
  upsertedProfiles.clear();
  process.env.GARMIN_CONSUMER_KEY = 'test-key';
  process.env.GARMIN_CONSUMER_SECRET = 'test-secret';
  process.env.GARMIN_CALLBACK_URL = 'https://test.tribos.studio/oauth/garmin/callback';
});
afterEach(() => {
  delete process.env.GARMIN_CONSUMER_KEY;
  delete process.env.GARMIN_CONSUMER_SECRET;
  delete process.env.GARMIN_CALLBACK_URL;
  vi.unstubAllGlobals();
});

describe('garmin2-auth: action routing', () => {
  it('responds 405 on non-POST', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when action is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { userId: USER } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on unknown action', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { userId: USER, action: 'launch_rocket' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('get_authorization_url', () => {
  it('stores PKCE state+verifier and returns a URL with S256 challenge', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { userId: USER, action: 'get_authorization_url' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const url = new URL(res.body.authorizationUrl);
    expect(url.origin + url.pathname).toBe('https://connect.garmin.com/oauth2Confirm');
    expect(url.searchParams.get('client_id')).toBe('test-key');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();

    // Temp store updated; state matches what's in the URL.
    const stored = tempStore.get(USER);
    expect(stored.request_token).toBe(state);
    expect(stored.request_token_secret).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  });

  it('returns 500 if GARMIN_CONSUMER_KEY is missing', async () => {
    delete process.env.GARMIN_CONSUMER_KEY;
    const res = mockRes();
    await handler(mockReq({ body: { userId: USER, action: 'get_authorization_url' } }), res);
    expect(res.statusCode).toBe(500);
  });

  it('returns 400 without a userId', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { action: 'get_authorization_url' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('exchange_token', () => {
  beforeEach(() => {
    // Pre-seed a PKCE row as if get_authorization_url just ran.
    tempStore.set(USER, { request_token: 'state-123', request_token_secret: 'verifier-abc' });
  });

  function stubFetch(handlers) {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      for (const [match, response] of handlers) {
        if (url.includes(match)) return response;
      }
      return { ok: false, status: 404, text: async () => 'no handler' };
    }));
  }

  it('rejects when state does not match (CSRF protection)', async () => {
    const res = mockRes();
    await handler(mockReq({
      body: { userId: USER, action: 'exchange_token', code: 'authcode', state: 'wrong-state' },
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/State mismatch/);
  });

  it('rejects when the PKCE row is missing', async () => {
    tempStore.clear();
    const res = mockRes();
    await handler(mockReq({
      body: { userId: USER, action: 'exchange_token', code: 'c', state: 's' },
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Authorization session/);
  });

  it('HARD-FAILS when provider_user_id cannot be fetched (linchpin guarantee)', async () => {
    stubFetch([
      ['diauth.garmin.com', { ok: true, json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 86400 }) }],
      ['wellness-api/rest/user/id', { ok: false, status: 503, text: async () => 'down' }],
    ]);
    const res = mockRes();
    await handler(mockReq({
      body: { userId: USER, action: 'exchange_token', code: 'authcode', state: 'state-123' },
    }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Garmin User ID/);
    // No integration row should have been written.
    expect(integrationStore.has(USER)).toBe(false);
  }, 20000);

  it('happy path: writes integration with provider_user_id, clears temp, sets first-connect flag', async () => {
    stubFetch([
      ['diauth.garmin.com', { ok: true, json: async () => ({
        access_token: 'NEW_AT', refresh_token: 'NEW_RT', expires_in: 86400,
        refresh_token_expires_in: 90 * 86400, scope: 'activity:read',
      })}],
      ['wellness-api/rest/user/id', { ok: true, json: async () => ({ userId: 'GARMIN-USER-9' }) }],
    ]);

    const res = mockRes();
    await handler(mockReq({
      body: { userId: USER, action: 'exchange_token', code: 'authcode', state: 'state-123' },
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.provider_user_id).toBe('GARMIN-USER-9');

    const integration = integrationStore.get(USER);
    expect(integration).toMatchObject({
      provider: 'garmin',
      provider_user_id: 'GARMIN-USER-9',
      access_token: 'NEW_AT',
      refresh_token: 'NEW_RT',
      refresh_token_invalid: false,
      sync_enabled: true,
    });
    expect(integration.token_expires_at).toBeTruthy();
    expect(integration.refresh_token_expires_at).toBeTruthy();

    // First-connect flag fired (no prior integration → strava_auto_sync_enabled=false).
    expect(upsertedProfiles.get(USER)).toEqual({ strava_auto_sync_enabled: false });
  });
});

describe('disconnect', () => {
  it('deletes the integration row', async () => {
    integrationStore.set(USER, { user_id: USER, provider: 'garmin' });
    const res = mockRes();
    await handler(mockReq({ body: { userId: USER, action: 'disconnect' } }), res);
    expect(res.statusCode).toBe(200);
    expect(deletedIntegrations.has(USER)).toBe(true);
    expect(integrationStore.has(USER)).toBe(false);
  });

  it('returns 400 without a userId', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { action: 'disconnect' } }), res);
    expect(res.statusCode).toBe(400);
  });
});
