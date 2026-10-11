import { describe, it, expect, vi, beforeEach } from 'vitest';

const messagesCreate = vi.fn();
const getUser = vi.fn();
const rateLimitByUser = vi.fn();
const enforceAiQuota = vi.fn();
let tableResults = {};
const queries = [];

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class FakeAnthropic {
    constructor() {
      this.messages = { create: messagesCreate };
    }
  }
  FakeAnthropic.RateLimitError = class extends APIError {};
  FakeAnthropic.AuthenticationError = class extends APIError {};
  FakeAnthropic.PermissionDeniedError = class extends APIError {};
  FakeAnthropic.BadRequestError = class extends APIError {};
  return { default: FakeAnthropic };
});
vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));
vi.mock('./utils/rateLimit.js', () => ({ rateLimitByUser: (...a) => rateLimitByUser(...a) }));
vi.mock('./utils/aiQuota.js', () => ({ enforceAiQuota: (...a) => enforceAiQuota(...a) }));

function chain(table) {
  const q = { table, ops: [] };
  queries.push(q);
  const result = () => (tableResults[table] ?? []).shift() ?? { data: null, error: null };
  const obj = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve) => Promise.resolve(result()).then(resolve);
        if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result());
        return (...args) => {
          q.ops.push([prop, ...args]);
          return obj;
        };
      },
    },
  );
  return obj;
}
vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: (t) => chain(t) }),
}));

const handler = (await import('./race-search.js')).default;

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {},
    end() {
      return this;
    },
  };
}
const req = (body, { auth = true } = {}) => ({ method: 'POST', headers: auth ? { authorization: 'Bearer tok' } : {}, body });

beforeEach(() => {
  messagesCreate.mockReset();
  getUser.mockReset();
  rateLimitByUser.mockReset().mockResolvedValue(null);
  enforceAiQuota.mockReset().mockResolvedValue(null);
  tableResults = {};
  queries.length = 0;
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('race-search gates', () => {
  it('rejects non-POST with 405', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 without auth', async () => {
    const res = makeRes();
    await handler(req({ action: 'directory', query: 'unbound' }, { auth: false }), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for an unknown action or a too-short query', async () => {
    const a = makeRes();
    await handler(req({ action: 'nope' }), a);
    expect(a.statusCode).toBe(400);
    const b = makeRes();
    await handler(req({ action: 'web', query: 'ab' }), b);
    expect(b.statusCode).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});

describe('directory', () => {
  it('searches the directory without touching the AI quota', async () => {
    tableResults.race_directory = [{ data: [{ id: 'd1', name: 'Unbound Gravel 200' }], error: null }];
    const res = makeRes();
    await handler(req({ action: 'directory', query: 'Unbound', today: '2026-10-11' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.races).toHaveLength(1);
    expect(enforceAiQuota).not.toHaveBeenCalled();
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});

describe('web', () => {
  it('applies the burst limit, the daily cap and the AI quota before searching', async () => {
    messagesCreate.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'report_races', input: { races: [] } }],
    });
    const res = makeRes();
    await handler(req({ action: 'web', query: 'Steamboat Gravel' }), res);
    expect(res.statusCode).toBe(200);
    expect(rateLimitByUser.mock.calls.map((c) => c[2])).toEqual(['RACE_SEARCH_WEB', 'RACE_SEARCH_WEB_DAY']);
    expect(enforceAiQuota).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ success: true, candidates: [] });
  });

  it('stops at the daily cap without calling Claude', async () => {
    rateLimitByUser.mockImplementation(async (_req, res, key) => (key === 'RACE_SEARCH_WEB_DAY' ? res.status(429).json({}) : null));
    const res = makeRes();
    await handler(req({ action: 'web', query: 'Steamboat Gravel' }), res);
    expect(res.statusCode).toBe(429);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('maps a Claude rate limit to 429', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    messagesCreate.mockRejectedValue(new Anthropic.RateLimitError('slow'));
    const res = makeRes();
    await handler(req({ action: 'web', query: 'Steamboat Gravel' }), res);
    expect(res.statusCode).toBe(429);
  });
});

describe('confirm', () => {
  it("reads the athlete's own saved race and adds it to the directory", async () => {
    tableResults.race_goals = [{ data: { id: 'rg1', name: 'Boulder Roubaix', race_date: '2027-04-25', race_type: 'road_race' }, error: null }];
    tableResults.race_directory = [{ data: [], error: null }, { data: { id: 'd9' }, error: null }];
    const res = makeRes();
    await handler(req({ action: 'confirm', raceGoalId: 'rg1', url: 'https://bikereg.com/x', source: 'web' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, action: 'added', id: 'd9' });
    const read = queries.find((q) => q.table === 'race_goals');
    expect(read.ops).toContainEqual(['eq', 'user_id', 'user-1']);
    const insert = queries.filter((q) => q.table === 'race_directory')[1].ops.find((o) => o[0] === 'insert')[1];
    expect(insert).toMatchObject({ source: 'web', url: 'https://bikereg.com/x' });
  });

  it("returns 404 for a race that isn't the athlete's", async () => {
    tableResults.race_goals = [{ data: null, error: null }];
    const res = makeRes();
    await handler(req({ action: 'confirm', raceGoalId: 'someone-elses' }), res);
    expect(res.statusCode).toBe(404);
    expect(queries.some((q) => q.table === 'race_directory')).toBe(false);
  });
});
