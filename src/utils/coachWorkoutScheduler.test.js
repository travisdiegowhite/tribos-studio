import { describe, it, expect, vi } from 'vitest';

// getWorkoutById returns a known workout for one id, null otherwise (so we can
// exercise both the library-backed and recommendation-fallback paths).
vi.mock('../data/workoutLibrary', () => ({
  getWorkoutById: (id) =>
    id === 'three_by_ten_sst'
      ? { name: 'SST 3x10', workoutType: 'sweet_spot', targetTSS: 75, duration: 60 }
      : null,
}));

import { scheduleCoachWorkout } from './coachWorkoutScheduler';

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

    // The workout upsert dual-writes both load columns from the library targetTSS.
    expect(calls.upserts).toHaveLength(1);
    const w = calls.upserts[0].payload;
    expect(w.target_rss).toBe(75);
    expect(w.target_tss).toBe(75);
    expect(w.workout_type).toBe('sweet_spot');
    expect(w.plan_id).toBe('plan-created');
    expect(w.scheduled_date).toBe('2026-07-01');
  });

  it('uses the existing active plan without creating a new one', async () => {
    const { supabase, calls } = makeSupabase({ activePlan: { id: 'plan-1' } });

    const result = await scheduleCoachWorkout(supabase, {
      userId: 'u1',
      recommendation: { workout_id: 'three_by_ten_sst', scheduled_date: '2026-07-02', reason: 'x' },
    });

    expect(result.success).toBe(true);
    expect(calls.inserts.find((c) => c.table === 'training_plans')).toBeUndefined();
    expect(calls.upserts[0].payload.plan_id).toBe('plan-1');
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
    const w = calls.upserts[0].payload;
    expect(w.target_rss).toBe(50);
    expect(w.target_tss).toBe(50);
    expect(w.workout_type).toBe('endurance');
  });

  it('returns a failure result instead of throwing on missing input', async () => {
    const { supabase } = makeSupabase();
    const result = await scheduleCoachWorkout(supabase, { userId: 'u1', recommendation: {} });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
