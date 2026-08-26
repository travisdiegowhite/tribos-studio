/**
 * Executor tests, with the Supabase admin client mocked.
 *
 * Two properties matter here beyond "does it write the row":
 *
 *   1. EVERY statement is scoped to the athlete. On the service-role client RLS
 *      does not apply, so `.eq('user_id', …)` is the only thing standing
 *      between a resolved handle and someone else's calendar. A test that only
 *      checked the happy path would not notice its removal.
 *
 *   2. A failing op does NOT roll back the ones before it. That is deliberate
 *      for a list already validated whole: a tenth race that collides on a slot
 *      must not un-create the nine that landed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { rows: [], failInsertAfter: Infinity, insertCount: 0 };

function makeBuilder(table) {
  const filters = {};
  const builder = {
    _table: table,
    _op: null,
    _payload: null,
    select() { builder._op = builder._op || 'select'; return builder; },
    eq(col, val) { filters[col] = val; return builder; },
    insert(payload) { builder._op = 'insert'; builder._payload = payload; return builder; },
    update(payload) { builder._op = 'update'; builder._payload = payload; return builder; },
    delete() { builder._op = 'delete'; return builder; },
    single() { return builder.then.call(builder, (r) => r); },
    _filters: filters,
    then(resolve) {
      calls.push({ table, op: builder._op, payload: builder._payload, filters: { ...filters } });
      if (builder._op === 'insert') {
        state.insertCount += 1;
        if (state.insertCount > state.failInsertAfter) {
          return Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint' } }).then(resolve);
        }
        state.rows.push(builder._payload);
        return Promise.resolve({ data: builder._payload, error: null }).then(resolve);
      }
      if (builder._op === 'select') {
        const matching = state.rows.filter((r) =>
          Object.entries(filters).every(([k, v]) => r[k] === v));
        return Promise.resolve({ data: matching, error: null }).then(resolve);
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  return builder;
}

let calls = [];
vi.mock('./supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({ from: (table) => makeBuilder(table) }),
}));

const { applyCalendarOps, snapshot, expandBlock } = await import('./calendarChangeApply.js');

const USER = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000b';

const entry = (over = {}) => ({
  id: '1af3bc12-0000-4000-8000-000000000001', date: '2026-09-01', slot: 0,
  type: 'workout', title: 'Sweet Spot', status: 'planned', pinned: false, ...over,
});

beforeEach(() => {
  calls = [];
  state.rows = [];
  state.insertCount = 0;
  state.failInsertAfter = Infinity;
});

describe('applyCalendarOps', () => {
  it('creates an entry, unpinned, stamped as coach, with the reason as rationale', async () => {
    const r = await applyCalendarOps(USER, [
      { op: 'create', date: '2026-10-04', title: 'Boulder CX #3', type: 'race', reason: 'Season opener.' },
    ]);

    expect(r.success).toBe(true);
    expect(r.applied).toBe(1);
    const insert = calls.find((c) => c.op === 'insert');
    expect(insert.payload).toMatchObject({
      user_id: USER, date: '2026-10-04', type: 'race',
      title: 'Boulder CX #3', source: 'coach',
      coach_rationale: 'Season opener.',
      // A coach entry the athlete has not touched stays reshapeable.
      pinned: false,
    });
  });

  it('creates ten races without any of them stepping on each other', async () => {
    const ops = Array.from({ length: 10 }, (_, i) => ({
      op: 'create', date: `2026-10-0${(i % 9) + 1}`, title: `CX #${i + 1}`,
      type: 'race', reason: 'Cyclocross season.',
    }));
    const r = await applyCalendarOps(USER, ops);
    expect(r.applied).toBe(10);
    expect(r.failed).toBe(0);
  });

  it('allocates the next free slot on an occupied day', async () => {
    state.rows.push({ id: 'x', user_id: USER, date: '2026-10-04', slot: 0 });
    await applyCalendarOps(USER, [
      { op: 'create', date: '2026-10-04', title: 'Second thing', reason: 'Double day.' },
    ]);
    const insert = calls.find((c) => c.op === 'insert');
    expect(insert.payload.slot).toBe(1);
  });

  it('PINS an entry it updates — an approved coach edit is a human decision', async () => {
    await applyCalendarOps(USER, [
      { op: 'update', handle: 'sess_1af3bc12', entry: entry(), title: 'Renamed', reason: 'Clearer name.' },
    ]);
    const update = calls.find((c) => c.op === 'update');
    expect(update.payload.pinned).toBe(true);
    expect(update.payload.title).toBe('Renamed');
  });

  it('scopes EVERY write to the athlete', async () => {
    await applyCalendarOps(USER, [
      { op: 'update', handle: 'sess_1af3bc12', entry: entry(), title: 'x', reason: 'r' },
      { op: 'delete', handle: 'sess_1af3bc12', entry: entry(), reason: 'r' },
      { op: 'move', handle: 'sess_1af3bc12', entry: entry(), date: '2026-09-05', reason: 'r' },
    ]);
    const writes = calls.filter((c) => ['update', 'delete'].includes(c.op));
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w.filters.user_id).toBe(USER);
      expect(w.filters.user_id).not.toBe(OTHER);
    }
  });

  it('drops fields the model is not allowed to write', async () => {
    await applyCalendarOps(USER, [{
      op: 'update', handle: 'sess_1af3bc12', entry: entry(),
      title: 'Fine', pinned: false, user_id: OTHER, status: 'done', id: 'nope',
      reason: 'r',
    }]);
    const update = calls.find((c) => c.op === 'update');
    expect(update.payload.user_id).toBeUndefined();
    expect(update.payload.id).toBeUndefined();
    // status is only settable through set_status, not a blanket update.
    expect(update.payload.status).toBeUndefined();
    expect(update.payload.pinned).toBe(true);
  });

  it('sets completed_at when marking done, and clears it when un-marking', async () => {
    await applyCalendarOps(USER, [
      { op: 'set_status', handle: 'sess_1af3bc12', entry: entry(), status: 'done', reason: 'Rode it.' },
    ]);
    expect(calls.find((c) => c.op === 'update').payload.completed_at).toBeTruthy();

    calls = [];
    await applyCalendarOps(USER, [
      { op: 'set_status', handle: 'sess_1af3bc12', entry: entry({ status: 'done' }), status: 'planned', reason: 'Mis-marked.' },
    ]);
    expect(calls.find((c) => c.op === 'update').payload.completed_at).toBeNull();
  });

  it('does NOT undo earlier successes when a later op fails', async () => {
    state.failInsertAfter = 2; // third insert onwards fails
    const ops = Array.from({ length: 4 }, (_, i) => ({
      op: 'create', date: `2026-10-0${i + 1}`, title: `CX #${i + 1}`, reason: 'r',
    }));
    const r = await applyCalendarOps(USER, ops);

    expect(r.success).toBe(false);
    expect(r.applied).toBe(2);
    expect(r.failed).toBe(2);
    // The two that landed are reversible, and no rollback was attempted.
    expect(r.undo).toHaveLength(2);
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(0);
  });

  it('refuses without a user id', async () => {
    const r = await applyCalendarOps(null, [{ op: 'create', date: '2026-10-04', title: 'x', reason: 'r' }]);
    expect(r.success).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('snapshot', () => {
  it('captures enough to reverse a change', () => {
    const snap = snapshot(entry({ title: 'Before', pinned: true }));
    expect(snap).toMatchObject({ title: 'Before', pinned: true, date: '2026-09-01', slot: 0 });
  });

  it('is null for a create, which has no before', () => {
    expect(snapshot(null)).toBeNull();
  });
});

/**
 * REGRESSION: the season that came back as races only.
 *
 * On 2026-08-25 the athlete asked for "my cyclocross season, planned out with
 * training". The coach created the nine races correctly and delivered no
 * training whatsoever. Nothing errored — it simply ran out of room.
 *
 * The coach's reply is capped at 4096 tokens (1024 by default). Nine races as
 * individual operations is ~550 tokens and fits. A season of training is ~70
 * operations at ~80 tokens each — roughly 5,600 tokens — and does not. The
 * previous change had removed create_training_plan, which was one compact call
 * the SERVER expanded into many rows, and left only one-operation-per-session
 * behind: a generator replaced by a typewriter.
 *
 * generate_block restores the property that matters — the size of a training
 * block is bounded by the calendar, not by the model's output budget.
 */
describe('expandBlock', () => {
  const SEASON = {
    op: 'generate_block',
    from: '2026-08-31',
    to: '2026-12-05',
    weekly_pattern: [
      { day: 'tue', title: 'Threshold Intervals', workout_type: 'threshold', target_load: 90, target_duration_min: 75 },
      { day: 'thu', title: 'VO2 Max', workout_type: 'vo2max', target_load: 95, target_duration_min: 70 },
      { day: 'sat', title: 'Long Endurance', workout_type: 'endurance', target_load: 146, target_duration_min: 180 },
    ],
  };

  const RACE_DAYS = new Set([
    '2026-09-19', '2026-10-03', '2026-10-17', '2026-10-24', '2026-10-31',
    '2026-11-07', '2026-11-14', '2026-11-15', '2026-12-05',
  ]);

  it('expands a whole season from one compact spec', () => {
    const { entries } = expandBlock({ ...SEASON }, new Set());
    // 14 weeks x 3 sessions, minus nothing — the point is that it is dozens of
    // rows from a spec the model could actually afford to emit.
    expect(entries.length).toBeGreaterThan(35);
    expect(entries[0].date).toBe('2026-09-01');
  });

  it('SKIPS race days instead of burying them', () => {
    const { entries, skipped } = expandBlock({ ...SEASON }, new Set(RACE_DAYS));
    const generatedDates = new Set(entries.map((e) => e.date));
    for (const race of RACE_DAYS) {
      expect(generatedDates.has(race)).toBe(false);
    }
    // Only the race days that fall on a pattern weekday are reported.
    expect(skipped.length).toBeGreaterThan(0);
    for (const s of skipped) expect(RACE_DAYS.has(s.date)).toBe(true);
  });

  it('is safe to re-run — a second pass over the same range adds nothing', () => {
    const occupied = new Set();
    const first = expandBlock({ ...SEASON }, occupied);
    expect(first.entries.length).toBeGreaterThan(0);
    // occupied has been mutated to include everything the first pass wrote.
    const second = expandBlock({ ...SEASON }, occupied);
    expect(second.entries).toHaveLength(0);
  });

  it('applies load progression cumulatively per week, not per day', () => {
    const { entries } = expandBlock(
      { ...SEASON, from: '2026-08-31', to: '2026-09-20', load_progression: 0.1 },
      new Set()
    );
    const thresholds = entries.filter((e) => e.title === 'Threshold Intervals');
    expect(thresholds.map((e) => e.target_load)).toEqual([90, 99, 108]);
  });

  it('leaves load null when the pattern gives none, rather than inventing one', () => {
    const { entries } = expandBlock(
      { op: 'generate_block', from: '2026-09-01', to: '2026-09-07',
        weekly_pattern: [{ day: 'tue', title: 'Ride' }], load_progression: 0.1 },
      new Set()
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].target_load).toBeNull();
  });

  it('steps in UTC so a DST boundary neither duplicates nor drops a day', () => {
    // US DST ends 2026-11-01. A local-time loop would produce a 25-hour day.
    const { entries } = expandBlock(
      { op: 'generate_block', from: '2026-10-26', to: '2026-11-08',
        weekly_pattern: [{ day: 'sun', title: 'Long Ride' }] },
      new Set()
    );
    expect(entries.map((e) => e.date)).toEqual(['2026-11-01', '2026-11-08']);
  });

  it('returns nothing for an inverted range instead of looping', () => {
    const { entries } = expandBlock({ ...SEASON, from: '2026-12-05', to: '2026-08-31' }, new Set());
    expect(entries).toHaveLength(0);
  });
});
