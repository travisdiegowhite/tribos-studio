import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Rate limit state per key; `allow` flips to false to simulate an exhausted window.
const limiter = { allow: true, keys: [] };
vi.mock('./utils/rateLimit.js', () => ({
  checkRateLimit: vi.fn(async (key) => {
    limiter.keys.push(key);
    return { allowed: limiter.allow, remaining: limiter.allow ? 10 : 0, resetAt: new Date(Date.now() + 60_000) };
  }),
  getClientIp: (req) => req.headers['x-forwarded-for'] || '0.0.0.0',
  RATE_LIMITS: {
    ROUTING_USER: { limit: 1500, windowMinutes: 60, name: 'routing' },
    ROUTING_GUEST: { limit: 150, windowMinutes: 60, name: 'routing-guest' },
  },
}));

const getUser = vi.fn();
vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({ auth: { getUser: (...a) => getUser(...a) } }),
}));

import brouterHandler from './brouter.js';
import profileHandler from './brouter/profile.js';
import stadiaHandler, { sanitizeStadiaBody } from './stadia-route.js';
import { __resetRoutingTokenCache, brouterUpstream } from './utils/routingQuota.js';

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; },
  };
}

function upstream(status, body, contentType = 'application/json') {
  return { status, ok: status < 400, headers: new Map([['content-type', contentType]]), text: async () => body };
}

const ROUTE_QUERY = {
  lonlats: '-105.27,40.01|-105.25,40.03',
  profile: 'trekking',
  alternativeidx: '0',
  format: 'geojson',
};

let fetchMock;
beforeEach(() => {
  limiter.allow = true;
  limiter.keys = [];
  getUser.mockReset();
  __resetRoutingTokenCache();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.BROUTER_URL;
  process.env.STADIA_API_KEY = 'server-key';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STADIA_API_KEY;
});

describe('api/brouter (routing proxy)', () => {
  it('forwards to brouter.de by default and passes the body through unchanged', async () => {
    const geojson = JSON.stringify({ features: [{ properties: { messages: [['Longitude'], ['1']] } }] });
    fetchMock.mockResolvedValue(upstream(200, geojson));
    const res = mockRes();
    await brouterHandler({ method: 'GET', query: ROUTE_QUERY, headers: {} }, res);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/brouter\.de\/brouter\?lonlats=/);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(geojson);
  });

  it('uses BROUTER_URL when set', async () => {
    process.env.BROUTER_URL = 'https://tribos-brouter.fly.dev/brouter/';
    expect(brouterUpstream()).toBe('https://tribos-brouter.fly.dev');
    fetchMock.mockResolvedValue(upstream(200, '{}'));
    await brouterHandler({ method: 'GET', query: ROUTE_QUERY, headers: {} }, mockRes());
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/tribos-brouter\.fly\.dev\/brouter\?/);
  });

  it('keeps BRouter plain-text errors (no route) with their status', async () => {
    fetchMock.mockResolvedValue(upstream(500, 'target island detected', 'text/plain'));
    const res = mockRes();
    await brouterHandler({ method: 'GET', query: ROUTE_QUERY, headers: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe('target island detected');
    expect(res.headers['content-type']).toBe('text/plain');
  });

  it('rejects malformed input before touching the quota or upstream', async () => {
    const res = mockRes();
    await brouterHandler({ method: 'GET', query: { ...ROUTE_QUERY, lonlats: 'x;drop' }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(limiter.keys).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a guest over the limit with routing_rate_limited and never calls upstream', async () => {
    limiter.allow = false;
    const res = mockRes();
    await brouterHandler({ method: 'GET', query: ROUTE_QUERY, headers: { 'x-forwarded-for': '1.2.3.4' } }, res);
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ error: 'routing_rate_limited', guest: true });
    expect(limiter.keys[0]).toBe('routing-guest:1.2.3.4');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limits a verified user per user id, and caches the token check', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    fetchMock.mockResolvedValue(upstream(200, '{}'));
    const req = { method: 'GET', query: ROUTE_QUERY, headers: { authorization: 'Bearer tok' } };
    await brouterHandler(req, mockRes());
    await brouterHandler(req, mockRes());
    expect(limiter.keys).toEqual(['routing:user:u-1', 'routing:user:u-1']);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('treats an invalid token as a guest', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    fetchMock.mockResolvedValue(upstream(200, '{}'));
    await brouterHandler(
      { method: 'GET', query: ROUTE_QUERY, headers: { authorization: 'Bearer forged', 'x-forwarded-for': '9.9.9.9' } },
      mockRes(),
    );
    expect(limiter.keys[0]).toBe('routing-guest:9.9.9.9');
  });

  it('returns 504 when the upstream times out', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    const res = mockRes();
    await brouterHandler({ method: 'GET', query: ROUTE_QUERY, headers: {} }, res);
    expect(res.statusCode).toBe(504);
  });
});

describe('api/brouter/profile (upload proxy)', () => {
  it('posts the .brf text upstream and passes the profile id back', async () => {
    fetchMock.mockResolvedValue(upstream(200, '{"profileid":"custom_123"}'));
    const res = mockRes();
    await profileHandler({ method: 'POST', body: '---context:global\nassign comfort_level 2\n', headers: {} }, res);
    expect(fetchMock.mock.calls[0][0]).toBe('https://brouter.de/brouter/profile');
    expect(fetchMock.mock.calls[0][1].body).toContain('comfort_level');
    expect(res.body).toBe('{"profileid":"custom_123"}');
  });

  it('rejects an oversized profile', async () => {
    const res = mockRes();
    await profileHandler({ method: 'POST', body: 'x'.repeat(70 * 1024), headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });
});

describe('api/stadia-route (Stadia proxy)', () => {
  const body = {
    locations: [
      { lat: 40.01, lon: -105.27, type: 'break' },
      { lat: 40.03, lon: -105.25, type: 'break' },
    ],
    costing: 'bicycle',
    costing_options: { bicycle: { use_roads: 0.2 } },
    directions_type: 'maneuvers',
    units: 'kilometers',
    alternates: 2,
  };

  it('adds the server-side key and forwards the cleaned body', async () => {
    fetchMock.mockResolvedValue(upstream(200, '{"trip":{"legs":[]}}'));
    const res = mockRes();
    await stadiaHandler({ method: 'POST', body: { ...body, evil: 'x' }, headers: {} }, res);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.stadiamaps.com/route/v1?api_key=server-key');
    expect(JSON.parse(init.body).evil).toBeUndefined();
    expect(res.statusCode).toBe(200);
  });

  it('reports 503 when the server key is not configured', async () => {
    delete process.env.STADIA_API_KEY;
    const res = mockRes();
    await stadiaHandler({ method: 'POST', body, headers: {} }, res);
    expect(res.statusCode).toBe(503);
  });

  it('rejects bad costing or too many locations', () => {
    expect(sanitizeStadiaBody({ ...body, costing: 'auto' })).toBeNull();
    const many = Array.from({ length: 51 }, () => ({ lat: 40, lon: -105 }));
    expect(sanitizeStadiaBody({ ...body, locations: many })).toBeNull();
    expect(sanitizeStadiaBody({ ...body, alternates: 9 }).alternates).toBe(3);
  });
});
