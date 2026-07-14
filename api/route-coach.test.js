import { describe, it, expect, vi, beforeEach } from 'vitest';

const messagesCreate = vi.fn();
const getUser = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    constructor() {
      this.messages = { create: messagesCreate };
    }
  },
}));

vi.mock('./utils/cors.js', () => ({
  setupCors: vi.fn().mockReturnValue(false),
}));

vi.mock('./utils/rateLimit.js', () => ({
  rateLimitByUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('./utils/aiQuota.js', () => ({
  enforceAiQuota: vi.fn().mockResolvedValue(null),
  enforceGlobalAiQuota: vi.fn().mockResolvedValue(null),
}));

// A chainable Supabase stub: every query resolves empty, so the context
// fetchers all fall back to null/empty and the prompt has no extra blocks.
function emptyChain() {
  const obj = {
    select: () => obj,
    eq: () => obj,
    order: () => obj,
    limit: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve) => Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return obj;
}

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser },
    from: () => emptyChain(),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

const handler = (await import('./route-coach.js')).default;

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end() {
      return this;
    },
  };
}

const VALID_SNAPSHOT = {
  geometry: { type: 'LineString', coordinates: [[-105.05, 40.05], [-105.04, 40.05]] },
  stats: { distance_km: 28, elevation_gain_m: 320, duration_s: 3600 },
  startLocation: [-105.05, 40.05],
  routeProfile: 'road',
};

function makeReq(body, { auth = true } = {}) {
  return {
    method: 'POST',
    headers: auth ? { authorization: 'Bearer tok' } : {},
    body,
  };
}

beforeEach(() => {
  messagesCreate.mockReset();
  getUser.mockReset();
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('route-coach handler — gates', () => {
  it('rejects non-POST with 405', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when message is missing', async () => {
    const res = makeRes();
    await handler(makeReq({ routeId: 'r1', routeSnapshot: VALID_SNAPSHOT }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when routeSnapshot has no geometry', async () => {
    const res = makeRes();
    await handler(makeReq({ message: 'flatten it', routeId: 'r1' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without an auth header', async () => {
    const res = makeRes();
    await handler(
      makeReq({ message: 'flatten it', routeId: 'r1', routeSnapshot: VALID_SNAPSHOT }, { auth: false }),
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the token is invalid', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const res = makeRes();
    await handler(
      makeReq({ message: 'flatten it', routeId: 'r1', routeSnapshot: VALID_SNAPSHOT }),
      res,
    );
    expect(res.statusCode).toBe(401);
  });
});

describe('route-coach handler — tool-use', () => {
  it('returns a proposedEdit when Claude calls apply_route_edit', async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Pushing the turnaround east and dropping the climb.' },
        {
          type: 'tool_use',
          id: 't1',
          name: 'apply_route_edit',
          input: { intent: 'longer', target_distance_km: 45, reasoning: 'rider asked' },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const res = makeRes();
    await handler(
      makeReq({
        message: 'stretch this to 45km and stay east',
        routeId: 'r1',
        routeSnapshot: VALID_SNAPSHOT,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/east/i);
    expect(res.body.proposedEdit.intent).toBe('longer');
    expect(res.body.proposedEdit.editIntent.distanceModifier).toBeCloseTo(17, 5);
    // Single round in the happy path.
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it('collects multiple edits in one turn for a compound request', async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Adding climbing and stretching it out.' },
        {
          type: 'tool_use',
          id: 't1',
          name: 'apply_route_edit',
          input: { intent: 'add_climbing', reasoning: 'hillier' },
        },
        {
          type: 'tool_use',
          id: 't2',
          name: 'apply_route_edit',
          input: { intent: 'longer', target_distance_km: 45, reasoning: 'longer' },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const res = makeRes();
    await handler(
      makeReq({ message: 'make it hillier and longer', routeId: 'r1', routeSnapshot: VALID_SNAPSHOT }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.proposedEdits).toHaveLength(2);
    expect(res.body.proposedEdits.map((e) => e.intent)).toEqual(['add_climbing', 'longer']);
    // Back-compat: single field is the first edit.
    expect(res.body.proposedEdit.intent).toBe('add_climbing');
  });

  it('returns no proposedEdit when Claude only asks a clarifying question', async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Flatter how much — drop all the climbing or just trim it?' }],
      usage: { input_tokens: 5, output_tokens: 8 },
    });

    const res = makeRes();
    await handler(
      makeReq({ message: 'make it flatter', routeId: 'r1', routeSnapshot: VALID_SNAPSHOT }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.proposedEdit).toBeNull();
    expect(res.body.message).toMatch(/how much/i);
  });

  it('feeds an error back so Claude can recover from a rejected edit', async () => {
    messagesCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Shifting the route.' },
          {
            type: 'tool_use',
            id: 't1',
            // Missing the required `direction` param — normalizeRouteEdit rejects it.
            name: 'apply_route_edit',
            input: { intent: 'shift_direction', reasoning: 'rider asked to move it' },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: "Which way should I shift it — want me to reverse it instead?" }],
        usage: { input_tokens: 12, output_tokens: 15 },
      });

    const res = makeRes();
    await handler(
      makeReq({ message: 'shift it over', routeId: 'r1', routeSnapshot: VALID_SNAPSHOT }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.proposedEdit).toBeNull();
    expect(res.body.message).toMatch(/reverse it instead/);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
  });
});
