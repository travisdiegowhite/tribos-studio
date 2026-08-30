import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * fetchPlannedSessions is a query builder, so what is worth testing is the
 * FILTERS it builds, not the rows a mock hands back. Every bug this reader
 * exists to fix was a filter: a plan-scoped `.in('plan_id', ...)` that could
 * never see a coach-created entry, a `.eq('completed', false)` against a column
 * that no longer exists, a race counted once from `calendar_entries` and again
 * from `race_goals`.
 */
const state: {
  rows: Array<Record<string, unknown>>;
  calls: Array<{ table: string; filters: Array<[string, ...unknown[]]>; limit?: number }>;
  error?: string;
} = { rows: [], calls: [] };

vi.mock('../supabase', () => {
  const makeBuilder = (table: string) => {
    const call: { table: string; filters: Array<[string, ...unknown[]]>; limit?: number } = {
      table,
      filters: [],
    };
    state.calls.push(call);
    const push = (kind: string, ...args: unknown[]) => {
      call.filters.push([kind, ...args]);
      return builder;
    };
    const settle = () =>
      state.error ? { data: null, error: { message: state.error } } : { data: state.rows, error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (...a: unknown[]) => push('eq', ...a),
      neq: (...a: unknown[]) => push('neq', ...a),
      gte: (...a: unknown[]) => push('gte', ...a),
      lte: (...a: unknown[]) => push('lte', ...a),
      in: (...a: unknown[]) => push('in', ...a),
      order: (...a: unknown[]) => push('order', ...a),
      limit: (n: number) => {
        call.limit = n;
        return builder;
      },
      maybeSingle: () =>
        Promise.resolve(
          state.error
            ? { data: null, error: { message: state.error } }
            : { data: state.rows[0] ?? null, error: null },
        ),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(settle())),
    };
    return builder;
  };
  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

const { fetchPlannedSessions, fetchSessionOn, fetchEntryById } = await import(
  './readPlannedSessions'
);

const USER = 'aaaaaaaa-0000-4000-8000-00000000000a';

/** A calendar_entries row as PostgREST would return it. */
const row = (over: Record<string, unknown> = {}) => ({
  id: '1af3bc12-0000-4000-8000-000000000001',
  user_id: USER,
  date: '2026-09-15',
  slot: 0,
  type: 'workout',
  title: 'Sweet Spot 3x12',
  workout_id: 'three_by_ten_sst',
  workout_type: 'sweet_spot',
  target_load: 78,
  target_duration_min: 75,
  target_distance_km: null,
  actual_load: null,
  actual_duration_min: null,
  actual_distance_km: null,
  status: 'planned',
  completed_at: null,
  skipped_reason: null,
  activity_id: null,
  notes: null,
  coach_rationale: null,
  details: null,
  provenance: null,
  source: 'coach',
  plan_id: null,
  generation_id: null,
  pinned: false,
  ...over,
});

/** The filters of the single query the call made. */
const filtersOf = (i = 0) => state.calls[i].filters;
const has = (kind: string, col: string, val?: unknown) =>
  filtersOf().some(
    (f) => f[0] === kind && f[1] === col && (val === undefined || f[2] === val),
  );

beforeEach(() => {
  state.rows = [];
  state.calls = [];
  state.error = undefined;
});

describe('fetchPlannedSessions — the filters it builds', () => {
  it('reads calendar_entries, scoped to the athlete', async () => {
    await fetchPlannedSessions(USER);
    expect(state.calls[0].table).toBe('calendar_entries');
    expect(has('eq', 'user_id', USER)).toBe(true);
  });

  it('EXCLUDES races by default, so a race read from race_goals is not doubled', async () => {
    await fetchPlannedSessions(USER);
    expect(has('neq', 'type', 'race')).toBe(true);
  });

  it('includes races only when asked', async () => {
    await fetchPlannedSessions(USER, { includeRaces: true });
    expect(has('neq', 'type', 'race')).toBe(false);
  });

  it('an explicit type list overrides includeRaces either way', async () => {
    await fetchPlannedSessions(USER, { types: ['workout', 'rest'] });
    expect(has('in', 'type')).toBe(true);
    expect(has('neq', 'type', 'race')).toBe(false);
  });

  it('does NOT scope by plan unless a plan is named', async () => {
    // The bug this replaces: a `.in('plan_id', planIds)` query can never see an
    // entry the coach or the calendar created, because those carry no plan_id.
    // Production had 45 such entries — a whole cyclocross season.
    await fetchPlannedSessions(USER);
    expect(filtersOf().some((f) => f[1] === 'plan_id')).toBe(false);

    state.calls = [];
    await fetchPlannedSessions(USER, { planId: 'plan-1' });
    expect(has('eq', 'plan_id', 'plan-1')).toBe(true);
  });

  it('bounds by date inclusively on both ends', async () => {
    await fetchPlannedSessions(USER, { from: '2026-09-01', to: '2026-09-30' });
    expect(has('gte', 'date', '2026-09-01')).toBe(true);
    expect(has('lte', 'date', '2026-09-30')).toBe(true);
  });

  it('filters completion by status, not by a `completed` column that no longer exists', async () => {
    await fetchPlannedSessions(USER, { includeCompleted: false });
    expect(has('neq', 'status', 'done')).toBe(true);
    expect(filtersOf().some((f) => f[1] === 'completed')).toBe(false);
  });

  it('orders by date then slot, so a double day comes back in calendar order', async () => {
    await fetchPlannedSessions(USER);
    const orders = filtersOf().filter((f) => f[0] === 'order');
    expect(orders[0][1]).toBe('date');
    expect(orders[1][1]).toBe('slot');
  });

  it('passes the limit through', async () => {
    await fetchPlannedSessions(USER, { limit: 20 });
    expect(state.calls[0].limit).toBe(20);
  });

  it('returns nothing, and queries nothing, without a user', async () => {
    expect(await fetchPlannedSessions(null)).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });
});

describe('fetchPlannedSessions — the shape it returns', () => {
  it('hands back the legacy field names its callers already destructure', async () => {
    state.rows = [row()];
    const [got] = await fetchPlannedSessions(USER);
    expect(got.scheduled_date).toBe('2026-09-15');
    expect(got.name).toBe('Sweet Spot 3x12');
    expect(got.target_duration).toBe(75);
    // Dual-named per the metrics freeze: callers fall back rss ?? tss.
    expect(got.target_rss).toBe(78);
    expect(got.target_tss).toBe(78);
    expect(got.completed).toBe(false);
  });

  it('maps status done onto completed', async () => {
    state.rows = [row({ status: 'done', completed_at: '2026-09-15T18:00:00Z' })];
    const [got] = await fetchPlannedSessions(USER);
    expect(got.completed).toBe(true);
    expect(got.completed_at).toBe('2026-09-15T18:00:00Z');
  });

  it('carries entry_type through, so a caller can tell a race from a session', async () => {
    state.rows = [row({ type: 'race', title: 'CycloX - Longmont' })];
    const [got] = await fetchPlannedSessions(USER, { includeRaces: true });
    expect(got.entry_type).toBe('race');
  });

  it('returns an empty list on a query error rather than throwing', async () => {
    // Every caller renders a surface that has to survive a failed read, and
    // each one already treated an error as an empty list.
    state.error = 'boom';
    await expect(fetchPlannedSessions(USER)).resolves.toEqual([]);
  });
});

describe('fetchSessionOn', () => {
  it('bounds both ends to the one day and takes a single row', async () => {
    state.rows = [row()];
    const got = await fetchSessionOn(USER, '2026-09-15');
    expect(has('gte', 'date', '2026-09-15')).toBe(true);
    expect(has('lte', 'date', '2026-09-15')).toBe(true);
    expect(state.calls[0].limit).toBe(1);
    expect(got?.name).toBe('Sweet Spot 3x12');
  });

  it('is null on an empty day', async () => {
    expect(await fetchSessionOn(USER, '2026-09-16')).toBeNull();
  });
});

describe('fetchEntryById', () => {
  it('scopes to the athlete as well as the id', async () => {
    state.rows = [row()];
    await fetchEntryById(USER, '1af3bc12-0000-4000-8000-000000000001');
    expect(has('eq', 'user_id', USER)).toBe(true);
    expect(has('eq', 'id', '1af3bc12-0000-4000-8000-000000000001')).toBe(true);
  });

  it('is null for a missing id, and queries nothing without one', async () => {
    expect(await fetchEntryById(USER, '')).toBeNull();
    expect(state.calls).toHaveLength(0);
  });
});
