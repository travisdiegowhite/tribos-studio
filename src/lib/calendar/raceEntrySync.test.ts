import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Same harness as calendarMutations.test.ts: the global setup mocks
 * `src/lib/supabase`; this drives that mock and asserts on the payloads and
 * filters the sync builds.
 */
type Op = { table: string; op: string; payload?: unknown; filters: Array<[string, ...unknown[]]> };
const state: { rows: Array<Record<string, unknown>>; ops: Op[]; failNext?: string } = { rows: [], ops: [] };

vi.mock('../supabase', () => {
  const makeBuilder = (table: string) => {
    const op: Op = { table, op: 'select', filters: [] };
    const push = (kind: string, ...args: unknown[]) => { op.filters.push([kind, ...args]); return builder; };
    const settle = () => {
      if (state.failNext) {
        const message = state.failNext;
        state.failNext = undefined;
        return { data: null, error: { message } };
      }
      if (op.op === 'select') {
        const date = op.filters.find((f) => f[0] === 'eq' && f[1] === 'date')?.[2];
        const id = op.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2];
        if (id) return { data: state.rows.find((r) => r.id === id) ?? null, error: null };
        return { data: state.rows.filter((r) => r.date === date), error: null };
      }
      return { data: { ...(op.payload as object ?? {}) }, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => { op.op = 'insert'; op.payload = payload; state.ops.push(op); return builder; },
      update: (payload: unknown) => { op.op = 'update'; op.payload = payload; state.ops.push(op); return builder; },
      delete: () => { op.op = 'delete'; state.ops.push(op); return builder; },
      eq: (...a: unknown[]) => push('eq', ...a),
      order: () => builder,
      maybeSingle: () => Promise.resolve(settle()),
      single: () => Promise.resolve(settle()),
      then: (resolve: (v: unknown) => unknown) => {
        if (op.op === 'select') state.ops.push(op);
        return Promise.resolve(resolve(settle()));
      },
    };
    return builder;
  };
  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

const { syncRaceEntry, deleteRaceEntry, raceGoalToEntryFields } = await import('./raceEntrySync');

const USER = 'user-1';
const RACE = 'race-1';
const race = {
  name: 'The Rad',
  race_date: '2026-12-05',
  race_type: 'cyclocross',
  distance_km: 40,
  elevation_gain_m: null,
  location: 'Boulder',
  priority: 'A',
  goal_time_minutes: 90,
  goal_power_watts: null,
  goal_placement: 'Podium',
  notes: 'bring mud tyres',
  course_description: null,
  route_id: null,
};

const writes = () => state.ops.filter((o) => o.op !== 'select');
const hasFilter = (op: Op, key: string, value: unknown) =>
  op.filters.some((f) => f[0] === 'eq' && f[1] === key && f[2] === value);

beforeEach(() => {
  state.rows = [];
  state.ops = [];
  state.failNext = undefined;
});

describe('raceGoalToEntryFields', () => {
  it('mirrors migration 115: race type, goal time, distance, notes, and stripped details', () => {
    const f = raceGoalToEntryFields(race);
    expect(f.type).toBe('race');
    expect(f.title).toBe('The Rad');
    expect(f.workout_type).toBe('cyclocross');
    expect(f.target_duration_min).toBe(90);
    expect(f.target_distance_km).toBe(40);
    expect(f.notes).toBe('bring mud tyres');
    expect(f.details).toEqual({
      priority: 'A', race_type: 'cyclocross', distance_km: 40, location: 'Boulder',
      goal_time_minutes: 90, goal_placement: 'Podium',
    });
  });

  it('falls back to "Race" for a blank name', () => {
    expect(raceGoalToEntryFields({ ...race, name: '  ' }).title).toBe('Race');
  });
});

describe('deleteRaceEntry', () => {
  it('deletes the calendar row by the race id, scoped to the athlete and to races', async () => {
    const res = await deleteRaceEntry(USER, RACE);
    expect(res.success).toBe(true);
    const [del] = writes();
    expect(del.table).toBe('calendar_entries');
    expect(del.op).toBe('delete');
    expect(hasFilter(del, 'id', RACE)).toBe(true);
    expect(hasFilter(del, 'user_id', USER)).toBe(true);
    expect(hasFilter(del, 'type', 'race')).toBe(true);
  });

  it('reports a failed delete instead of swallowing it', async () => {
    state.failNext = 'boom';
    const res = await deleteRaceEntry(USER, RACE);
    expect(res.success).toBe(false);
    expect(res.error).toBe('boom');
  });

  it('refuses without a user or race id', async () => {
    expect((await deleteRaceEntry('', RACE)).success).toBe(false);
    expect((await deleteRaceEntry(USER, '')).success).toBe(false);
    expect(writes()).toHaveLength(0);
  });
});

describe('syncRaceEntry', () => {
  it('inserts a pinned race row under the race_goals id when none exists', async () => {
    state.rows = [{ id: 'w-1', user_id: USER, date: '2026-12-05', slot: 0, type: 'workout' }];
    const res = await syncRaceEntry(USER, RACE, race);
    expect(res.success).toBe(true);
    const [ins] = writes();
    expect(ins.table).toBe('calendar_entries');
    expect(ins.op).toBe('insert');
    const payload = ins.payload as Record<string, unknown>;
    expect(payload.id).toBe(RACE);
    expect(payload.user_id).toBe(USER);
    expect(payload.date).toBe('2026-12-05');
    expect(payload.slot).toBe(1); // the workout already holds slot 0
    expect(payload.type).toBe('race');
    expect(payload.title).toBe('The Rad');
    expect(payload.pinned).toBe(true);
    expect(payload.status).toBe('planned');
    expect(payload.source).toBe('manual');
    expect(payload.plan_id).toBeNull();
  });

  it('updates in place, keeping the slot, when the date is unchanged', async () => {
    state.rows = [{ id: RACE, user_id: USER, date: '2026-12-05', slot: 2, type: 'race' }];
    const res = await syncRaceEntry(USER, RACE, { ...race, name: 'The Rad (renamed)', priority: 'B' });
    expect(res.success).toBe(true);
    const [upd] = writes();
    expect(upd.op).toBe('update');
    expect(hasFilter(upd, 'id', RACE)).toBe(true);
    expect(hasFilter(upd, 'user_id', USER)).toBe(true);
    const payload = upd.payload as Record<string, unknown>;
    expect(payload.title).toBe('The Rad (renamed)');
    expect(payload.date).toBe('2026-12-05');
    expect(payload.slot).toBe(2);
    expect(payload.pinned).toBe(true);
    expect((payload.details as Record<string, unknown>).priority).toBe('B');
  });

  it('takes the next free slot on the new day when the date changes', async () => {
    state.rows = [
      { id: RACE, user_id: USER, date: '2026-12-05', slot: 0, type: 'race' },
      { id: 'w-2', user_id: USER, date: '2026-12-12', slot: 0, type: 'workout' },
    ];
    const res = await syncRaceEntry(USER, RACE, { ...race, race_date: '2026-12-12' });
    expect(res.success).toBe(true);
    const [upd] = writes();
    expect(upd.op).toBe('update');
    const payload = upd.payload as Record<string, unknown>;
    expect(payload.date).toBe('2026-12-12');
    expect(payload.slot).toBe(1);
  });

  it('accepts a Date-like string and normalises it to a date key', async () => {
    const res = await syncRaceEntry(USER, RACE, { ...race, race_date: '2026-12-05T00:00:00' });
    expect(res.success).toBe(true);
    expect((writes()[0].payload as Record<string, unknown>).date).toBe('2026-12-05');
  });

  it('refuses a missing date and reports write failures', async () => {
    expect((await syncRaceEntry(USER, RACE, { ...race, race_date: '' })).success).toBe(false);
    expect(writes()).toHaveLength(0);

    state.failNext = 'nope';
    const res = await syncRaceEntry(USER, RACE, race);
    expect(res.success).toBe(false);
    expect(res.error).toBe('nope');
  });
});
