import { describe, it, expect, vi, beforeEach } from 'vitest';

// getWorkoutById returns a known workout for one id, null otherwise (so we can
// exercise both the library-backed and recommendation-fallback paths).
vi.mock('../data/workoutLibrary', () => ({
  getWorkoutById: (id) =>
    id === 'three_by_ten_sst'
      ? { name: 'SST 3x10', workoutType: 'sweet_spot', targetTSS: 75, duration: 60 }
      : null,
}));

/**
 * The calendar write goes through upsertSessionOnDate now, which binds the
 * browser Supabase singleton rather than the client this function is handed.
 * That split is deliberate — plan resolution is still done with the passed
 * client, so both are exercised: the stub for the plan lookup, this mock for
 * the write.
 */
const upsertMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/calendar/calendarMutations', () => ({
  upsertSessionOnDate: (...a) => upsertMock(...a),
}));

import { scheduleCoachWorkout } from './coachWorkoutScheduler';

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ success: true, data: { id: 'entry-1' }, replacedName: null });
});

/** The draft handed to the calendar on the Nth write. */
const written = (n = 0) => upsertMock.mock.calls[n][2];
/** The options (planId) handed to the calendar on the Nth write. */
const writeOpts = (n = 0) => upsertMock.mock.calls[n][3];

// Minimal controllable Supabase stub. `activePlan` decides whether the
// training_plans lookup finds a plan; inserts/upserts are captured for asserts.
function makeSupabase({ activePlan = null } = {}) {
  const calls = { inserts: [], upserts: [], orders: [] };
  const supabase = {
    from(table) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: (column, opts) => {
          calls.orders.push({ table, column, opts });
          return builder;
        },
        limit: () => builder,
        gte: () => builder,
        lte: () => builder,
        is: () => builder,
        maybeSingle: () =>
          Promise.resolve({
            // training_plans lookup → the configured active plan (or null)
            // planned_workouts existing-check → always null (no clash)
            data: table === 'training_plans' ? activePlan : null,
            error: null,
          }),
        single: () => Promise.resolve({ data: { id: 'plan-created' }, error: null }),
        insert(payload) {
          calls.inserts.push({ table, payload });
          return builder; // supports .insert().select('id').single()
        },
        upsert(payload, opts) {
          calls.upserts.push({ table, payload, opts });
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  };
  return { supabase, calls };
}

describe('scheduleCoachWorkout', () => {
  it('auto-creates a plan when none is active and dual-writes target_rss + target_tss', async () => {
    const { supabase, calls } = makeSupabase({ activePlan: null });

    const result = await scheduleCoachWorkout(supabase, {
      userId: 'u1',
      recommendation: { workout_id: 'three_by_ten_sst', scheduled_date: '2026-07-01', reason: 'build threshold' },
    });

    expect(result.success).toBe(true);
    // A coach_recommended plan was created because none existed.
    const planInsert = calls.inserts.find((c) => c.table === 'training_plans');
    expect(planInsert).toBeTruthy();
    expect(planInsert.payload.template_id).toBe('coach_recommended');

    // The calendar has ONE load column, so the dual-write the old table needed
    // does not arise; readers still see both names via the adapter.
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(written()).toMatchObject({ target_load: 75, workout_type: 'sweet_spot' });
    expect(upsertMock.mock.calls[0][1]).toBe('2026-07-01');
    expect(writeOpts()).toMatchObject({ planId: 'plan-created' });
  });

  it('uses the existing active plan without creating a new one', async () => {
    const { supabase, calls } = makeSupabase({ activePlan: { id: 'plan-1' } });

    const result = await scheduleCoachWorkout(supabase, {
      userId: 'u1',
      recommendation: { workout_id: 'three_by_ten_sst', scheduled_date: '2026-07-02', reason: 'x' },
    });

    expect(result.success).toBe(true);
    expect(calls.inserts.find((c) => c.table === 'training_plans')).toBeUndefined();
    expect(writeOpts()).toMatchObject({ planId: 'plan-1' });
  });

  it('resolves the active plan by the canonical sort (started_at, then created_at)', async () => {
    // This ordering must match the dashboard/planner resolvers so the coach
    // writes to the SAME plan those surfaces display.
    const { supabase, calls } = makeSupabase({ activePlan: { id: 'plan-1' } });

    await scheduleCoachWorkout(supabase, {
      userId: 'u1',
      recommendation: { workout_id: 'three_by_ten_sst', scheduled_date: '2026-07-02', reason: 'x' },
    });

    const planOrders = calls.orders.filter((o) => o.table === 'training_plans');
    expect(planOrders.map((o) => o.column)).toEqual(['started_at', 'created_at']);
    expect(planOrders.every((o) => o.opts?.ascending === false)).toBe(true);
  });

  it('falls back to recommendation load + endurance type when the workout is unknown', async () => {
    const { supabase, calls } = makeSupabase({ activePlan: { id: 'plan-1' } });

    const result = await scheduleCoachWorkout(supabase, {
      userId: 'u1',
      recommendation: { workout_id: 'mystery_ride', scheduled_date: '2026-07-03', target_rss: 50 },
    });

    expect(result.success).toBe(true);
    expect(written()).toMatchObject({ target_load: 50, workout_type: 'endurance' });
  });

  it('returns a failure result instead of throwing on missing input', async () => {
    const { supabase } = makeSupabase();
    const result = await scheduleCoachWorkout(supabase, { userId: 'u1', recommendation: {} });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
