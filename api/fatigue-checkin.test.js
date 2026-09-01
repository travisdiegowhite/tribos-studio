import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
let upsertPayload = null;
let checkinRow = null;

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));

vi.mock('./utils/supabaseAdmin.js', () => {
  const chain = (table) => {
    const obj = {
      _table: table,
      select: () => obj,
      eq: () => obj,
      gte: () => obj,
      lte: () => obj,
      not: () => obj,
      is: () => obj,
      or: () => obj,
      order: () => obj,
      limit: () => obj,
      upsert: (payload) => {
        upsertPayload = payload;
        return obj;
      },
      single: () => Promise.resolve({ data: { ...upsertPayload, id: 'row-1' }, error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: table === 'fatigue_checkins' ? checkinRow : table === 'user_profiles' ? { timezone: 'UTC' } : null,
          error: null,
        }),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return obj;
  };
  return { getSupabaseAdmin: () => ({ auth: { getUser }, from: (t) => chain(t) }) };
});

// The adapter is stubbed so a test can hand the endpoint a RiderState
// directly; the REAL rules engine then runs on it, which is the behaviour
// worth testing here (which rules reach the athlete, and which do not).
const riderState = vi.fn();
vi.mock('./utils/toRiderState.js', () => ({
  fetchRiderStateData: vi.fn().mockResolvedValue({}),
  toRiderState: () => riderState(),
}));

const { default: handler } = await import('./fatigue-checkin.js');

function makeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => res;
  res.end = () => res;
  return res;
}

const req = (over = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer tok' },
  body: {},
  ...over,
});

const EMPTY_STATE = {
  age: null, persona: 'hammer', goalType: 'general_fitness', weeksToEvent: null,
  weeklyHours4wkMean: null, fearOfFailureFlag: null, tfi: null, afi: null, fs: null,
  rss7d: null, rss3wkMean: null, midZoneShare4wk: null, hardSessions4wk: null,
  easySessions4wk: null, strengthSessions8wk: null, daysSinceLastRide: null,
  efTrend: null, pdShortTrend: null, pdLongTrend: null,
  freshVsFatiguedDrop5min: null, longRideDecoupling: null,
  wellness: null, wellnessLowStreak: null, hrvBelowBandDays: null, hrvReadings7d: null,
  illnessFlag: null, eventTempDeltaC: null,
};

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  riderState.mockReturnValue({ ...EMPTY_STATE });
  upsertPayload = null;
  checkinRow = null;
});

describe('auth', () => {
  it('rejects a request with no bearer token', async () => {
    const res = makeRes();
    await handler(req({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unknown method', async () => {
    const res = makeRes();
    await handler(req({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
  });
});

describe('POST validation', () => {
  const valid = { leg_feel: 3, energy: 3, motivation: 3 };

  it('requires the three original items', async () => {
    const res = makeRes();
    await handler(req({ body: { leg_feel: 3, energy: 3 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('accepts a body with no sleep, so pre-migration clients keep working', async () => {
    const res = makeRes();
    await handler(req({ body: valid }), res);
    expect(res.statusCode).toBe(200);
    // Absent means "not asked", stored as null — never as a middling 3.
    expect(upsertPayload.sleep).toBeNull();
    expect(upsertPayload.illness).toBeNull();
  });

  it('stores sleep and illness when given', async () => {
    const res = makeRes();
    await handler(req({ body: { ...valid, sleep: 2, illness: true } }), res);
    expect(res.statusCode).toBe(200);
    expect(upsertPayload.sleep).toBe(2);
    expect(upsertPayload.illness).toBe(true);
  });

  it('rejects an out-of-range sleep score', async () => {
    for (const sleep of [0, 6, 2.5, 'two']) {
      const res = makeRes();
      await handler(req({ body: { ...valid, sleep } }), res);
      expect(res.statusCode, `sleep=${sleep}`).toBe(400);
    }
  });

  it('rejects a non-boolean illness', async () => {
    const res = makeRes();
    await handler(req({ body: { ...valid, illness: 'yes' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('the readiness verdict', () => {
  it('is null when no rule fires', async () => {
    const res = makeRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.readiness).toBeNull();
  });

  it('answers the clearance question when a readiness rule fires', async () => {
    riderState.mockReturnValue({ ...EMPTY_STATE, illnessFlag: true });
    const res = makeRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.body.readiness.id).toBe('RDY-3-skip');
    expect(res.body.readiness.personaLine).toContain('Not today');
    expect(res.body.readiness.confidence).toBe('leaning');
  });

  it('does not answer it with a prescription', async () => {
    // A taper call is a real decision, but it is not an answer to "am I
    // cleared" — surfacing it here would put a prescription where the athlete
    // asked a yes/no question.
    riderState.mockReturnValue({
      ...EMPTY_STATE, weeksToEvent: 2, rss3wkMean: 400, weeklyHours4wkMean: 9,
    });
    const res = makeRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.body.readiness).toBeNull();
  });

  it('comes back on the POST too, so the survey answers itself', async () => {
    riderState.mockReturnValue({ ...EMPTY_STATE, illnessFlag: true });
    const res = makeRes();
    await handler(req({ body: { leg_feel: 1, energy: 1, motivation: 1, sleep: 1, illness: true } }), res);
    expect(res.body.status).toBe('saved');
    expect(res.body.readiness.id).toBe('RDY-3-skip');
  });

  it('never carries a citation or a raw metric into the payload', async () => {
    riderState.mockReturnValue({ ...EMPTY_STATE, illnessFlag: true });
    const res = makeRes();
    await handler(req({ method: 'GET' }), res);
    const text = JSON.stringify(res.body);
    for (const leak of ['citations', 'saw2016', 'hrvBelowBandDays', 'priority']) {
      expect(text).not.toContain(leak);
    }
  });

  it('still saves the check-in when the verdict blows up', async () => {
    riderState.mockImplementation(() => { throw new Error('boom'); });
    const res = makeRes();
    await handler(req({ body: { leg_feel: 3, energy: 3, motivation: 3, sleep: 3 } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('saved');
    expect(res.body.readiness).toBeNull();
  });
});

describe('GET', () => {
  it('returns today\'s check-in when there is one', async () => {
    checkinRow = { date: '2026-09-01', sleep: 4, leg_feel: 4, motivation: 4, illness: false };
    const res = makeRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.body.checkin.sleep).toBe(4);
    expect(res.body.date).toBeTruthy();
  });

  it('returns null rather than erroring when the athlete has not checked in', async () => {
    const res = makeRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.body.checkin).toBeNull();
  });
});
