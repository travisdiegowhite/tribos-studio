import { describe, it, expect } from 'vitest';

import { activateTrainingPlan } from './coachPlanActivation';

// Minimal controllable Supabase stub. The builder is thenable so `await update().eq().eq()`
// and `await insert(...)` resolve; `single()` returns the created plan row. Inserts are
// captured for assertions.
function makeSupabase() {
  const calls = { inserts: [], updates: [] };
  const supabase = {
    from(table) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        update(payload) {
          calls.updates.push({ table, payload });
          return builder;
        },
        insert(payload) {
          calls.inserts.push({ table, payload });
          return builder;
        },
        single: () => Promise.resolve({ data: { id: 'plan-1' }, error: null }),
        then: (resolve) => resolve({ data: null, error: null }),
      };
      return builder;
    },
  };
  return { supabase, calls };
}

const plan = {
  name: 'Summer Vibes Final Block',
  methodology: 'sweet_spot',
  goal: 'racing',
  duration_weeks: 3,
  start_date: '2026-06-08',
  workouts: [
    { week_number: 1, day_of_week: 1, scheduled_date: '2026-06-08', workout_type: 'sweet_spot', workout_id: 'three_by_ten_sst', name: '3x10 SST', target_tss: 80, duration_minutes: 60 },
    { week_number: 1, day_of_week: 2, scheduled_date: '2026-06-09', workout_type: 'rest', workout_id: null, name: 'Rest' },
    { week_number: 1, day_of_week: 3, scheduled_date: '2026-06-10', workout_type: 'recovery', workout_id: 'recovery_spin', name: 'Recovery Spin', target_rss: 20, duration_minutes: 30 },
  ],
};

describe('activateTrainingPlan', () => {
  it('creates the plan, counts only non-rest workouts, and dual-writes RSS+TSS', async () => {
    const { supabase, calls } = makeSupabase();

    const result = await activateTrainingPlan(supabase, { userId: 'u1', plan });

    expect(result.success).toBe(true);
    expect(result.planId).toBe('plan-1');
    expect(result.workoutCount).toBe(2); // rest day excluded from the count

    // training_plans insert reflects the non-rest total.
    const planInsert = calls.inserts.find((c) => c.table === 'training_plans');
    expect(planInsert.payload.workouts_total).toBe(2);
    expect(planInsert.payload.status).toBe('active');

    // planned_workouts insert carries every row (including rest) with dual-written load.
    const workoutInsert = calls.inserts.find((c) => c.table === 'planned_workouts');
    expect(workoutInsert.payload).toHaveLength(3);
    const sst = workoutInsert.payload.find((w) => w.workout_id === 'three_by_ten_sst');
    expect(sst.target_rss).toBe(80);
    expect(sst.target_tss).toBe(80);
    const recovery = workoutInsert.payload.find((w) => w.workout_id === 'recovery_spin');
    expect(recovery.target_rss).toBe(20);
    expect(recovery.target_tss).toBe(20);
  });

  it('returns an error result for an empty plan instead of throwing', async () => {
    const { supabase } = makeSupabase();
    const result = await activateTrainingPlan(supabase, { userId: 'u1', plan: { workouts: [] } });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no workouts/i);
  });
});
