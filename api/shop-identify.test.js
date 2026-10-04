import { describe, it, expect, vi, beforeEach } from 'vitest';

const betaCreate = vi.fn();
const getUser = vi.fn();
const createSignedUrl = vi.fn();
const tableCalls = [];

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { constructor(m) { super(m); this.status = 500; } }
  class RateLimitError extends APIError {}
  class FakeAnthropic {
    constructor() { this.beta = { messages: { create: betaCreate } }; }
  }
  FakeAnthropic.APIError = APIError;
  FakeAnthropic.RateLimitError = RateLimitError;
  return { default: FakeAnthropic };
});

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));
vi.mock('./utils/rateLimit.js', () => ({ rateLimitByUser: vi.fn().mockResolvedValue(null) }));
vi.mock('./utils/aiQuota.js', () => ({ enforceAiQuota: vi.fn().mockResolvedValue(null) }));
vi.mock('./utils/auth.js', () => ({
  requireAuth: async (req, res) => {
    const u = await getUser();
    if (!u) { res.status(401).json({ error: 'Authentication required' }); return null; }
    return u;
  },
}));

const CATEGORIES = [
  { id: 'cp', name: 'Components', parent_id: null },
  { id: 'cp-d', name: 'Drivetrain', parent_id: 'cp' },
];
const LOCATIONS = [{ id: 'g', name: 'Garage', parent_id: null }];

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => ({
      select: () => ({
        eq: async (col, val) => {
          tableCalls.push({ table, col, val });
          if (table === 'shop_categories') return { data: CATEGORIES, error: null };
          if (table === 'shop_locations') return { data: LOCATIONS, error: null };
          throw new Error(`unexpected table ${table}`);
        },
      }),
    }),
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

import handler from './shop-identify.js';

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const OWNER = { id: '11111111-1111-1111-1111-111111111111', email: 'Owner@Example.com' };
const post = (body) => ({ method: 'POST', headers: {}, body });

const MODEL_JSON = {
  name: 'Chain', brand: 'Shimano', model: 'CN-HG701', mpn: 'CN-HG701-11', upc: '', quantity: 2, condition: 'new',
  category: 'Components > Drivetrain', location: 'Garage', compatibility: ['11-speed'], notes: '', confidence: 'high',
};

beforeEach(() => {
  vi.clearAllMocks();
  tableCalls.length = 0;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.SHOP_OWNER_EMAILS = 'owner@example.com';
  getUser.mockResolvedValue(OWNER);
  createSignedUrl.mockImplementation(async (path) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }));
  betaCreate.mockResolvedValue({
    model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(MODEL_JSON) }],
  });
});

describe('POST /api/shop-identify', () => {
  it('rejects GET, signed-out and non-owner callers before calling Claude', async () => {
    const r1 = makeRes();
    await handler({ method: 'GET', headers: {}, body: {} }, r1);
    expect(r1.statusCode).toBe(405);

    getUser.mockResolvedValueOnce(null);
    const r2 = makeRes();
    await handler(post({ transcript: 'chain' }), r2);
    expect(r2.statusCode).toBe(401);

    getUser.mockResolvedValueOnce({ id: 'x', email: 'someone@else.com' });
    const r3 = makeRes();
    await handler(post({ transcript: 'chain' }), r3);
    expect(r3.statusCode).toBe(403);
    expect(betaCreate).not.toHaveBeenCalled();
  });

  it('needs input, and refuses photos outside the caller’s folder', async () => {
    const r1 = makeRes();
    await handler(post({}), r1);
    expect(r1.statusCode).toBe(400);

    for (const photoPath of ['someone-else/pending/1.jpg', `${OWNER.id}/../x/1.jpg`]) {
      const r = makeRes();
      await handler(post({ photoPath }), r);
      expect(r.statusCode).toBe(403);
    }
    expect(betaCreate).not.toHaveBeenCalled();
  });

  it('scopes reads to the caller and sends a schema-constrained request', async () => {
    const res = makeRes();
    await handler(post({ transcript: 'two xt chains in the garage', photoPath: `${OWNER.id}/pending/1.jpg` }), res);
    expect(res.statusCode).toBe(200);
    expect(tableCalls).toEqual([
      { table: 'shop_categories', col: 'user_id', val: OWNER.id },
      { table: 'shop_locations', col: 'user_id', val: OWNER.id },
    ]);

    const req = betaCreate.mock.calls[0][0];
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(req.fallbacks).toBe('default');
    expect(req.thinking).toBeUndefined();
    expect(req.output_config.effort).toBe('medium');
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.output_config.format.schema.properties.category.enum).toEqual(['Components', 'Components > Drivetrain', '']);
    const [image, text] = req.messages[0].content;
    expect(image).toEqual({ type: 'image', source: { type: 'url', url: `https://signed/${OWNER.id}/pending/1.jpg` } });
    expect(text.text).toMatch(/two xt chains in the garage/);

    expect(res.body.draft).toMatchObject({ name: 'Chain', category_id: 'cp-d', location_id: 'g', quantity: 2 });
  });

  it('uses low effort for text only, and reports refusals and truncation', async () => {
    await handler(post({ transcript: 'chain' }), makeRes());
    expect(betaCreate.mock.calls[0][0].output_config.effort).toBe('low');
    expect(betaCreate.mock.calls[0][0].messages[0].content).toHaveLength(1);

    betaCreate.mockResolvedValueOnce({ stop_reason: 'refusal', stop_details: { explanation: 'no' }, content: [] });
    const r1 = makeRes();
    await handler(post({ transcript: 'x' }), r1);
    expect(r1.statusCode).toBe(422);

    betaCreate.mockResolvedValueOnce({ stop_reason: 'max_tokens', content: [] });
    const r2 = makeRes();
    await handler(post({ transcript: 'x' }), r2);
    expect(r2.statusCode).toBe(500);
  });
});
