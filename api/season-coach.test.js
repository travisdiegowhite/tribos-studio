import { describe, it, expect, vi, beforeEach } from 'vitest';

const messagesCreate = vi.fn();
const getUser = vi.fn();
const inserts = [];
let coachSettings = null;

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class FakeAnthropic {
    constructor() {
      this.beta = { messages: { create: messagesCreate } };
    }
  }
  FakeAnthropic.RateLimitError = class extends APIError {};
  FakeAnthropic.AuthenticationError = class extends APIError {};
  FakeAnthropic.PermissionDeniedError = class extends APIError {};
  FakeAnthropic.BadRequestError = class extends APIError {};
  return { default: FakeAnthropic };
});

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));
vi.mock('./utils/rateLimit.js', () => ({ rateLimitByUser: vi.fn().mockResolvedValue(null) }));
vi.mock('./utils/aiQuota.js', () => ({ enforceAiQuota: vi.fn().mockResolvedValue(null) }));

function chain(table) {
  const obj = {
    select: () => obj,
    eq: () => obj,
    maybeSingle: () => Promise.resolve({ data: table === 'user_coach_settings' ? coachSettings : null, error: null }),
    insert: (rows) => {
      inserts.push({ table, rows });
      return Promise.resolve({ error: null });
    },
  };
  return obj;
}

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: (t) => chain(t) }),
}));

const Anthropic = (await import('@anthropic-ai/sdk')).default;
const handler = (await import('./season-coach.js')).default;

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

const PAYLOAD = {
  today: 'Sun, Oct 11, 2026',
  season: { from: 'Mon, Aug 17, 2026', to: 'Sun, Oct 10, 2027', typicalHours: 8 },
  races: [
    {
      name: 'Boulder Roubaix',
      role: 'Goal',
      date: 'Sun, Apr 25, 2027',
      sport: 'bike',
      effort: 'medium',
      verdict: 'Tight',
      reason: 'Only 3 weeks of build.',
      buildWeeks: 3,
      blockNote: null,
    },
  ],
  firstLook: false,
  changes: [{ kind: 'moved', text: 'Boulder Roubaix moved 1 week earlier, from Sun, May 2, 2027 to Sun, Apr 25, 2027.' }],
  question: 'Is that OK?',
};

const makeReq = (body, { auth = true } = {}) => ({ method: 'POST', headers: auth ? { authorization: 'Bearer tok' } : {}, body });
const reply = (text, extra = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], ...extra });

beforeEach(() => {
  messagesCreate.mockReset();
  getUser.mockReset();
  inserts.length = 0;
  coachSettings = null;
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('season-coach handler — gates', () => {
  it('rejects non-POST with 405', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 without an auth header', async () => {
    const res = makeRes();
    await handler(makeReq({ payload: PAYLOAD }, { auth: false }), res);
    expect(res.statusCode).toBe(401);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('returns 413 for an oversized body', async () => {
    const res = makeRes();
    await handler(makeReq({ payload: { ...PAYLOAD, padding: 'x'.repeat(40_000) } }), res);
    expect(res.statusCode).toBe(413);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('returns 400 without a payload', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('season-coach handler — reply', () => {
  it('returns the reply, passes no tools, and logs both sides of the exchange', async () => {
    coachSettings = { coaching_persona: 'pragmatist', user_preferred_name: 'Travis' };
    messagesCreate.mockResolvedValue(reply('Moving Roubaix up costs you a week of build. Keep it, but treat BWR as the one that matters.'));
    const res = makeRes();
    await handler(makeReq({ payload: PAYLOAD, seasonPlanId: 'plan-1' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Roubaix/);
    expect(res.body.personaName).toBeTruthy();

    const params = messagesCreate.mock.calls[0][0];
    expect(params.tools).toBeUndefined();
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.messages[0].content).toContain('Sun, Apr 25, 2027');
    expect(params.messages[0].content).toContain('The athlete asks: Is that OK?');
    expect(params.system).toContain('Travis');

    expect(inserts).toHaveLength(1);
    const { table, rows } = inserts[0];
    expect(table).toBe('coach_conversations');
    expect(rows.map((r) => r.role)).toEqual(['user', 'coach']);
    expect(rows[0].context_snapshot).toMatchObject({ surface: 'season_planner', season_plan_id: 'plan-1', verdict_counts: { Tight: 1 } });
  });

  it('maps a Claude rate limit to 429', async () => {
    messagesCreate.mockRejectedValue(new Anthropic.RateLimitError('slow down'));
    const res = makeRes();
    await handler(makeReq({ payload: PAYLOAD }), res);
    expect(res.statusCode).toBe(429);
    expect(inserts).toHaveLength(0);
  });

  it('turns a refusal into a 502 without logging', async () => {
    messagesCreate.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const res = makeRes();
    await handler(makeReq({ payload: PAYLOAD }), res);
    expect(res.statusCode).toBe(502);
    expect(inserts).toHaveLength(0);
  });
});
