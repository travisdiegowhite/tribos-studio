import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ integration: null, upserts: [], deletes: 0 }));
const getUser = vi.hoisted(() => vi.fn());

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));
vi.mock('./utils/rateLimit.js', () => ({ rateLimitMiddleware: vi.fn().mockResolvedValue(null) }));
vi.mock('./utils/activation.js', () => ({ completeActivationStep: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser },
    from() {
      const q = {
        upsert(row) { state.upserts.push(row); return q; },
        delete() { state.deletes++; return q; },
        update() { return q; },
        select() { return q; },
        eq() { return q; },
        maybeSingle: () => Promise.resolve({ data: state.integration, error: null }),
        then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
      };
      return q;
    },
  }),
}));
const tokens = vi.hoisted(() => ({
  deauthorizeWahoo: vi.fn().mockResolvedValue({ revoked: true }),
  getValidWahooToken: vi.fn().mockResolvedValue('live-token'),
  requestWahooToken: vi.fn(),
}));
vi.mock('./utils/wahoo/tokens.js', async (orig) => ({ ...(await orig()), ...tokens }));
vi.mock('./utils/wahoo/ingest.js', () => ({ ingestWahooWorkout: vi.fn().mockResolvedValue({ status: 'inserted' }) }));

process.env.WAHOO_CLIENT_ID = 'cid';
process.env.WAHOO_CLIENT_SECRET = 'secret';
const { default: handler, needsReconnect } = await import('./wahoo-auth.js');

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => res;
  res.end = () => res;
  return res;
}
const req = (body, headers = { authorization: 'Bearer tok' }) => ({ method: 'POST', headers, body });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'me' } }, error: null });
  state.integration = null;
  state.upserts = [];
  state.deletes = 0;
  globalThis.fetch = vi.fn();
});

describe('auth', () => {
  it('401s without a bearer token, for every action', async () => {
    for (const action of ['exchange_code', 'get_connection_status', 'disconnect', 'sync_workouts', 'push_route']) {
      const res = makeRes();
      await handler(req({ action, userId: 'victim' }, {}), res);
      expect(res.statusCode).toBe(401);
    }
    expect(state.deletes).toBe(0);
  });

  it('acts on the authenticated user, ignoring a body userId', async () => {
    tokens.requestWahooToken.mockResolvedValue({ access_token: 'a', refresh_token: 'r', expires_in: 7200, scope: 'email user_read workouts_read offline_data' });
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 60462, email: 'rider@example.com', first: 'A', last: 'B' }) });
    const res = makeRes();
    await handler(req({ action: 'exchange_code', code: 'c', userId: 'victim' }), res);
    expect(res.statusCode).toBe(200);
    expect(state.upserts[0]).toMatchObject({
      user_id: 'me',
      provider_user_id: '60462',
      scopes: ['email', 'user_read', 'workouts_read', 'offline_data'],
      status: 'active',
    });
    expect(state.upserts[0]).not.toHaveProperty('sync_error');
    expect(res.body.webhooksEnabled).toBe(true);
  });
});

describe('exchange_code', () => {
  it('refuses to store a connection it cannot match webhooks to', async () => {
    tokens.requestWahooToken.mockResolvedValue({ access_token: 'a', refresh_token: 'r', expires_in: 7200 });
    globalThis.fetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const res = makeRes();
    await handler(req({ action: 'exchange_code', code: 'c' }), res);
    expect(res.statusCode).toBe(502);
    expect(state.upserts).toHaveLength(0);
  });
});

describe('needsReconnect', () => {
  it('flags connections without offline_data (no webhooks) or with a dead refresh token', () => {
    expect(needsReconnect({ scopes: null })).toBe(true);
    expect(needsReconnect({ scopes: ['user_read', 'workouts_read'] })).toBe(true);
    expect(needsReconnect({ scopes: ['offline_data'], refresh_token_invalid: true })).toBe(true);
    expect(needsReconnect({ scopes: ['user_read', 'offline_data'] })).toBe(false);
  });

  it('is reported by get_connection_status', async () => {
    state.integration = { provider_user_id: '1', provider_user_data: { email: 'a@b.c' }, scopes: null, last_sync_at: null };
    const res = makeRes();
    await handler(req({ action: 'get_connection_status' }), res);
    expect(res.body).toMatchObject({ connected: true, needsReconnect: true, username: 'a@b.c' });
  });
});

describe('disconnect', () => {
  it('deauthorizes on Wahoo, then deletes the row', async () => {
    state.integration = { id: 'i1', user_id: 'me' };
    const res = makeRes();
    await handler(req({ action: 'disconnect' }), res);
    expect(res.statusCode).toBe(200);
    expect(tokens.deauthorizeWahoo).toHaveBeenCalledWith(state.integration);
    expect(state.deletes).toBe(1);
  });
});

describe('push_route', () => {
  const fitBase64 = 'data:application/vnd.fit;base64,AAAA';

  it('sends runs as the running family', async () => {
    state.integration = { id: 'i1', user_id: 'me' };
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 9 }) });
    await handler(req({ action: 'push_route', routeData: { name: 'Loop', fitBase64, sport: 'running' } }), makeRes());
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).route.workout_type_family_id).toBe(1);

    globalThis.fetch.mockClear();
    await handler(req({ action: 'push_route', routeData: { name: 'Loop', fitBase64 } }), makeRes());
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).route.workout_type_family_id).toBe(0);
  });

  it('asks for a reconnect when Wahoo refuses the token', async () => {
    state.integration = { id: 'i1', user_id: 'me' };
    globalThis.fetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });
    const res = makeRes();
    await handler(req({ action: 'push_route', routeData: { name: 'Loop', fitBase64 } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.requiresReconnect).toBe(true);
  });
});
