import { describe, it, expect, vi, beforeEach } from 'vitest';

// The opener handler lives at api/route-coach/opener.js; mock its
// relative imports (resolved from that directory).
const getUser = vi.fn();
const maybeSingle = vi.fn();

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: (...a) => getUser(...a) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: (...a) => maybeSingle(...a) }),
      }),
    }),
  }),
}));
vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));

import handler from './route-coach/opener.js';

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function makeReq(body = {}) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  maybeSingle.mockResolvedValue({ data: { coaching_persona: 'scientist' }, error: null });
});

describe('route-coach opener — no snapshot (back-compat)', () => {
  it('returns the exact pre-route-aware persona string', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('What aspect of this route would you like to refine?');
  });

  it('falls back for pending persona', async () => {
    maybeSingle.mockResolvedValue({ data: { coaching_persona: 'pending' }, error: null });
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.body.message).toBe("Tell me what you'd like to change about this route.");
  });
});

describe('route-coach opener — route-aware', () => {
  it('references the loaded route by distance and shape (metric)', async () => {
    const res = makeRes();
    await handler(
      makeReq({ routeSnapshot: { distance_km: 42.4, routeType: 'loop' }, units: 'metric' }),
      res,
    );
    expect(res.body.message).toBe('What aspect of your 42 km loop would you like to refine?');
  });

  it('renders miles for imperial riders', async () => {
    const res = makeRes();
    await handler(
      makeReq({ routeSnapshot: { distance_km: 42.4, routeType: 'loop' }, units: 'imperial' }),
      res,
    );
    // 42.4 km ≈ 26 mi
    expect(res.body.message).toBe('What aspect of your 26 mi loop would you like to refine?');
  });

  it('prefers the route name when present', async () => {
    const res = makeRes();
    await handler(
      makeReq({ routeSnapshot: { name: 'Lookout Loop', distance_km: 42.4 } }),
      res,
    );
    expect(res.body.message).toBe("What aspect of 'Lookout Loop' would you like to refine?");
  });

  it('ignores malformed snapshots and falls back to the generic string', async () => {
    for (const routeSnapshot of [
      { distance_km: 'huge' },
      { distance_km: -5 },
      { distance_km: 999999 },
      'not-an-object',
    ]) {
      const res = makeRes();
      await handler(makeReq({ routeSnapshot }), res);
      expect(res.body.message).toBe('What aspect of this route would you like to refine?');
    }
  });
});
