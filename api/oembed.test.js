import { describe, it, expect, vi, beforeEach } from 'vitest';

const ROUTE_ID = '0b8f1c2e-1111-4222-8333-944455556666';
let row = null;
vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: row, error: null }), single: async () => ({ data: row, error: null }) };
      return c;
    },
    auth: { getUser: vi.fn() },
  }),
}));
vi.mock('./utils/rateLimit.js', () => ({ rateLimitMiddleware: vi.fn(async () => null) }));
vi.mock('./utils/cors.js', () => ({ setupCors: () => false }));
vi.mock('./utils/activation.js', () => ({ completeActivationStep: vi.fn() }));

const { default: handler, parseShareUrl } = await import('./oembed.js');

function call(query) {
  const res = {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  return handler({ method: 'GET', query, headers: {} }, res).then(() => res);
}

beforeEach(() => {
  row = { id: ROUTE_ID, name: 'Lefthand <Loop>', distance_km: 52, elevation_gain_m: 600, visibility: 'unlisted', is_private: true };
});

describe('parseShareUrl', () => {
  it('accepts tribos share and embed links only', () => {
    expect(parseShareUrl(`https://www.tribos.studio/r/${ROUTE_ID}`)).toEqual({ routeId: ROUTE_ID, origin: 'https://www.tribos.studio' });
    expect(parseShareUrl(`https://tribos.studio/r/${ROUTE_ID}/embed`)?.routeId).toBe(ROUTE_ID);
    expect(parseShareUrl(`https://evil.example/r/${ROUTE_ID}`)).toBeNull();
    expect(parseShareUrl(`http://www.tribos.studio/r/${ROUTE_ID}`)).toBeNull();
    expect(parseShareUrl('https://www.tribos.studio/ride/new')).toBeNull();
  });
});

describe('api/oembed', () => {
  it('returns rich oEmbed with an embed iframe for an unlisted route', async () => {
    const res = await call({ url: `https://www.tribos.studio/r/${ROUTE_ID}`, maxwidth: '500' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.body).toMatchObject({ version: '1.0', type: 'rich', provider_name: 'tribos.studio', width: 500 });
    expect(res.body.html).toContain(`src="https://www.tribos.studio/r/${ROUTE_ID}/embed"`);
    // The rider-entered name is escaped inside the iframe title.
    expect(res.body.html).toContain('Lefthand &lt;Loop&gt;');
  });

  it('404s for a private route, a foreign host, or a non-route URL', async () => {
    row = { ...row, visibility: 'private', is_private: true };
    expect((await call({ url: `https://www.tribos.studio/r/${ROUTE_ID}` })).statusCode).toBe(404);
    expect((await call({ url: `https://evil.example/r/${ROUTE_ID}` })).statusCode).toBe(404);
    expect((await call({ url: 'not a url' })).statusCode).toBe(404);
  });

  it('only speaks JSON', async () => {
    expect((await call({ url: `https://www.tribos.studio/r/${ROUTE_ID}`, format: 'xml' })).statusCode).toBe(501);
  });
});
