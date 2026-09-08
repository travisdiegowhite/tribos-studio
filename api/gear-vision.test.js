import { describe, it, expect, vi, beforeEach } from 'vitest';

const messagesCreate = vi.fn();
const getUser = vi.fn();
const createSignedUrl = vi.fn();
const gearSingle = vi.fn();
const gearUpdateEq2 = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { constructor(m) { super(m); this.status = 500; } }
  class RateLimitError extends APIError {}
  class FakeAnthropic {
    constructor() { this.messages = { create: messagesCreate }; }
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
vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => {
      if (table !== 'gear_items') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ eq: () => ({ single: gearSingle }) }) }),
        update: () => ({ eq: () => ({ eq: gearUpdateEq2 }) }),
      };
    },
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

import handler from './gear-vision.js';

function makeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}

const USER = { id: '11111111-1111-1111-1111-111111111111' };
const GEAR = { id: 'g1', user_id: USER.id, name: 'Tarmac', brand: 'Specialized', model: 'SL7', category: 'road', gear_type: 'bike' };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  getUser.mockResolvedValue(USER);
  gearSingle.mockResolvedValue({ data: GEAR, error: null });
  gearUpdateEq2.mockResolvedValue({ error: null });
  createSignedUrl.mockImplementation(async (path) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }));
});

describe('POST /api/gear-vision', () => {
  it('rejects non-POST and unauthenticated calls', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);

    getUser.mockResolvedValue(null);
    const res2 = makeRes();
    await handler({ method: 'POST', headers: {}, body: { gearItemId: 'g1', photoPaths: { whole_bike: `${USER.id}/g1/a.jpg` } } }, res2);
    expect(res2.statusCode).toBe(401);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('refuses photo paths outside the caller\'s folder', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { gearItemId: 'g1', photoPaths: { whole_bike: 'someone-else/g1/a.jpg' } } }, res);
    expect(res.statusCode).toBe(403);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('404s on a bike that is not the caller\'s and 400s on shoes', async () => {
    gearSingle.mockResolvedValueOnce({ data: null, error: { message: 'no rows' } });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { gearItemId: 'g9', photoPaths: { whole_bike: `${USER.id}/g9/a.jpg` } } }, res);
    expect(res.statusCode).toBe(404);

    gearSingle.mockResolvedValueOnce({ data: { ...GEAR, gear_type: 'shoes' }, error: null });
    const res2 = makeRes();
    await handler({ method: 'POST', headers: {}, body: { gearItemId: 'g1', photoPaths: { whole_bike: `${USER.id}/g1/a.jpg` } } }, res2);
    expect(res2.statusCode).toBe(400);
  });

  it('signs each shot, sends them with the catalogue prompt as structured output, stores the extraction', async () => {
    const reply = {
      bike: { brand: 'Specialized', model: 'Tarmac SL7', category: 'road', frame_material: 'carbon', color: 'black', brake_type: 'disc', confidence: 0.8, evidence: 'logo' },
      groupset: { brand: 'Shimano', tier: 'Ultegra', speeds: 12, electronic: true, confidence: 0.7, evidence: 'battery' },
      components: [
        { component_type: 'tires_road', brand: 'Continental', model: 'GP5000', metadata: { width_mm: 28, tubeless: true }, confidence: 0.9, evidence: '28-622', seen_in: ['front_wheel'] },
        { component_type: 'chain', brand: null, model: null, metadata: {}, confidence: 0.4, evidence: 'present', seen_in: ['drivetrain'] },
      ],
      unreadable: [],
    };
    messagesCreate.mockResolvedValue({
      model: 'claude-opus-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(reply) }],
      usage: { input_tokens: 3000, output_tokens: 400 },
    });

    const paths = { whole_bike: `${USER.id}/g1/whole.jpg`, front_wheel: `${USER.id}/g1/front.jpg` };
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { gearItemId: 'g1', photoPaths: paths } }, res);

    expect(res.statusCode).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledTimes(2);

    const call = messagesCreate.mock.calls[0][0];
    expect(call.model).toBe('claude-opus-5');
    expect(call.output_config.format.type).toBe('json_schema');
    expect(call.output_config.format.schema.properties.components).toBeTruthy();
    const content = call.messages[0].content;
    const images = content.filter((b) => b.type === 'image');
    expect(images).toHaveLength(2);
    expect(images[0].source).toEqual({ type: 'url', url: `https://signed/${paths.whole_bike}` });
    const prompt = content[content.length - 1].text;
    expect(prompt).toContain('Specialized SL7');
    expect(prompt).toContain('Photos provided: whole_bike, front_wheel');

    expect(res.body.extraction.components.map((c) => c.component_type)).toEqual(['chain', 'tires_road']);
    expect(res.body.extraction.components[1].prefill).toBe(true);
    expect(res.body.usage).toEqual({ input_tokens: 3000, output_tokens: 400 });
    expect(gearUpdateEq2).toHaveBeenCalled();
  });

  it('surfaces a refusal as 422 without writing', async () => {
    messagesCreate.mockResolvedValue({
      model: 'claude-opus-5',
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: null, explanation: 'nope' },
      content: [],
      usage: {},
    });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { gearItemId: 'g1', photoPaths: { whole_bike: `${USER.id}/g1/a.jpg` } } }, res);
    expect(res.statusCode).toBe(422);
    expect(gearUpdateEq2).not.toHaveBeenCalled();
  });
});
