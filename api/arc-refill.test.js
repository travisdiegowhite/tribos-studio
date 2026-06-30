import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildArc, generateArcWorkouts } from './utils/arcBuilder.js';

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));

const getUser = vi.fn();
let handlers = {};
let updateCalls = [];

function makeChain(table) {
  const cfg = handlers[table] || {};
  const obj = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'is', 'or', 'gte', 'lte', 'not', 'insert', 'upsert']) {
    obj[m] = () => obj;
  }
  obj.update = (payload) => { updateCalls.push({ table, payload }); return obj; };
  obj.maybeSingle = () => Promise.resolve({ data: cfg.single ?? null, error: null });
  obj.single = () => Promise.resolve({ data: cfg.single ?? null, error: null });
  obj.then = (resolve) => Promise.resolve({ data: cfg.rows ?? [], error: null }).then(resolve);
  return obj;
}

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser },
    from: (table) => makeChain(table),
  }),
}));

const handler = (await import('./arc-refill.js')).default;

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    end() { return this; },
  };
}
const makeReq = (body, auth = true) => ({
  method: 'POST',
  headers: auth ? { authorization: 'Bearer tok' } : {},
  body,
});

// Build a real arc + canonical window rows for the happy-path test.
const TODAY = '2026-06-29';
const RACE = '2026-09-26';
const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
const canonical = generateArcWorkouts(arc.blocks, {
  ctx: { coefficients: undefined, upcoming_events: [{ tier: 'A', date: RACE }] },
  arcStart: TODAY,
});
const firstQuality = canonical.find(
  (r) => ['threshold', 'vo2', 'tempo'].includes(r.session_type) && r.scheduled_date > TODAY,
);
const WINDOW_START = firstQuality.scheduled_date;
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const windowRows = canonical
  .filter((r) => r.scheduled_date >= WINDOW_START && r.scheduled_date <= addDays(WINDOW_START, 6))
  .map((r) => ({
    id: `row-${r.scheduled_date}`,
    scheduled_date: r.scheduled_date,
    source: 'arc',
    completed: false,
    workout_type: r.workout_type,
    name: r.name,
    target_rss: r.target_rss,
    target_duration: r.target_duration,
    duration_minutes: r.duration_minutes,
    notes: r.notes,
    adjustment_reason: null,
    phase: r.phase,
  }));

const highFatigueStats = [
  { date: WINDOW_START, form_score: -18, tfi: 80, afi: 95 },
  { date: addDays(WINDOW_START, -1), form_score: -16, tfi: 80, afi: 90 },
  { date: addDays(WINDOW_START, -2), form_score: -14, tfi: 80, afi: 85 },
  { date: addDays(WINDOW_START, -3), form_score: -12, tfi: 80, afi: 80 },
  { date: addDays(WINDOW_START, -4), form_score: -10, tfi: 80, afi: 75 },
];

beforeEach(() => {
  handlers = {};
  updateCalls = [];
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
});

describe('api/arc-refill', () => {
  it('401s without a bearer token', async () => {
    const res = makeRes();
    await handler(makeReq({}, false), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns skipped when the athlete has no active arc', async () => {
    handlers = { training_plans: { single: null } };
    const res = makeRes();
    await handler(makeReq({ userLocalDate: TODAY }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBe('no_active_arc');
    expect(res.body.count).toBe(0);
  });

  it('eases the upcoming quality session and writes only changed rows', async () => {
    handlers = {
      training_plans: {
        single: { id: 'plan-1', start_date: TODAY, target_event_date: RACE, tier: 'A', blocks: arc.blocks, last_refill_at: null },
      },
      training_load_daily: { rows: highFatigueStats }, // overlay → drives FS -18 today
      activities: { rows: [] },
      user_profiles: { single: { recovery_mode: 'standard', ftp: 250 } },
      user_day_availability: { rows: [] },
      user_training_preferences: { single: null },
      planned_workouts: { rows: windowRows },
    };

    const res = makeRes();
    await handler(makeReq({ userLocalDate: WINDOW_START }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    // The first-day quality session was eased.
    const easedChange = res.body.changes.find((c) => c.scheduled_date === WINDOW_START);
    expect(easedChange?.reason).toMatch(/FS/);
    // It issued planned_workouts updates (one per changed row) + a last_refill_at stamp.
    const pwUpdates = updateCalls.filter((u) => u.table === 'planned_workouts');
    expect(pwUpdates.length).toBe(res.body.count);
    expect(pwUpdates[0].payload).toHaveProperty('adjustment_reason');
    expect(pwUpdates[0].payload).toHaveProperty('target_tss'); // dual-write
    expect(updateCalls.some((u) => u.table === 'training_plans' && u.payload.last_refill_at)).toBe(true);
  });

  it('honours the recent-refill guard unless forced', async () => {
    handlers = {
      training_plans: {
        single: { id: 'plan-1', start_date: TODAY, target_event_date: RACE, tier: 'A', blocks: arc.blocks, last_refill_at: new Date().toISOString() },
      },
    };
    const res = makeRes();
    await handler(makeReq({ userLocalDate: WINDOW_START }), res);
    expect(res.body.skipped).toBe('recently_refilled');
    expect(updateCalls.length).toBe(0);
  });
});
