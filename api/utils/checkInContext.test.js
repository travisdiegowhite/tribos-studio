import { describe, it, expect } from 'vitest';
import { resolvePlannedWorkoutForActivity } from './checkInContext.js';

/**
 * Queue-based chainable supabase stub: each .from() call consumes the next
 * configured response; filter calls are recorded for assertions.
 */
function makeSupabase(responses) {
  const calls = [];
  let idx = 0;
  return {
    calls,
    from(table) {
      const call = { table, filters: [], select: null, limit: null };
      calls.push(call);
      const resp = responses[idx++] ?? { data: null, error: null };
      const chain = {
        select(sel) { call.select = sel; return chain; },
        eq(col, val) { call.filters.push(['eq', col, val]); return chain; },
        neq(col, val) { call.filters.push(['neq', col, val]); return chain; },
        limit(n) { call.limit = n; return chain; },
        maybeSingle() { return Promise.resolve(resp); },
        then(resolve, reject) { return Promise.resolve(resp).then(resolve, reject); },
      };
      return chain;
    },
  };
}

const TZ = 'America/Denver';

describe('resolvePlannedWorkoutForActivity', () => {
  it('uses the reverse pointer when set (single query)', async () => {
    const supabase = makeSupabase([{ data: { id: 'w9', target_rss: 55, target_tss: 50 } }]);
    const activity = { id: 'a1', matched_planned_workout_id: 'w9' };
    const workout = await resolvePlannedWorkoutForActivity(supabase, 'u1', activity, TZ);
    expect(workout?.id).toBe('w9');
    expect(supabase.calls).toHaveLength(1);
    expect(supabase.calls[0].filters).toContainEqual(['eq', 'id', 'w9']);
  });

  it("falls back to the calendar's forward link (planned_workouts.activity_id)", async () => {
    const supabase = makeSupabase([{ data: [{ id: 'w2', target_tss: 55 }] }]);
    const activity = { id: 'a1', matched_planned_workout_id: null };
    const workout = await resolvePlannedWorkoutForActivity(supabase, 'u1', activity, TZ);
    expect(workout?.id).toBe('w2');
    expect(supabase.calls[0].filters).toContainEqual(['eq', 'activity_id', 'a1']);
  });

  it('recovers via forward link when the reverse pointer is dangling', async () => {
    const supabase = makeSupabase([
      { data: null }, // reverse pointer resolves to nothing (workout deleted)
      { data: [{ id: 'w2' }] },
    ]);
    const activity = { id: 'a1', matched_planned_workout_id: 'gone' };
    const workout = await resolvePlannedWorkoutForActivity(supabase, 'u1', activity, TZ);
    expect(workout?.id).toBe('w2');
  });

  it('falls back to the same-LOCAL-day row, excluding rest days', async () => {
    const supabase = makeSupabase([
      { data: [] }, // no forward link
      { data: [{ id: 'w3', workout_type: 'endurance', completed: false, activity_id: null, scheduled_date: '2026-07-23' }] },
    ]);
    // Strava fake-UTC local string: Thu 19:30 local, UTC start_date is Friday.
    const activity = {
      id: 'a1',
      matched_planned_workout_id: null,
      start_date: '2026-07-24T01:30:00Z',
      start_date_local: '2026-07-23T19:30:00Z',
    };
    const workout = await resolvePlannedWorkoutForActivity(supabase, 'u1', activity, TZ);
    expect(workout?.id).toBe('w3');
    const dayCall = supabase.calls[1];
    expect(dayCall.filters).toContainEqual(['eq', 'user_id', 'u1']);
    expect(dayCall.filters).toContainEqual(['eq', 'scheduled_date', '2026-07-23']);
    expect(dayCall.filters).toContainEqual(['neq', 'workout_type', 'rest']);
  });

  it('prefers the row linked to this activity, then a completed row', async () => {
    const rows = [
      { id: 'w-open', completed: false, activity_id: null },
      { id: 'w-done', completed: true, activity_id: null },
      { id: 'w-mine', completed: true, activity_id: 'a1' },
    ];
    const supabase = makeSupabase([{ data: [] }, { data: rows }]);
    const activity = { id: 'a1', matched_planned_workout_id: null, start_date_local: '2026-07-23T19:30:00Z' };
    const workout = await resolvePlannedWorkoutForActivity(supabase, 'u1', activity, TZ);
    expect(workout?.id).toBe('w-mine');

    const supabase2 = makeSupabase([{ data: [] }, { data: rows.slice(0, 2) }]);
    const workout2 = await resolvePlannedWorkoutForActivity(supabase2, 'u1', activity, TZ);
    expect(workout2?.id).toBe('w-done');
  });

  it('derives the local date from the user timezone when start_date_local is absent (Wahoo)', async () => {
    const supabase = makeSupabase([{ data: [] }, { data: [{ id: 'w4' }] }]);
    // 01:30 UTC Jul 24 = Jul 23 evening in Denver.
    const activity = { id: 'a1', matched_planned_workout_id: null, start_date: '2026-07-24T01:30:00Z' };
    const workout = await resolvePlannedWorkoutForActivity(supabase, 'u1', activity, TZ);
    expect(workout?.id).toBe('w4');
    expect(supabase.calls[1].filters).toContainEqual(['eq', 'scheduled_date', '2026-07-23']);
  });

  it('returns null for a null activity or when nothing matches', async () => {
    expect(await resolvePlannedWorkoutForActivity(makeSupabase([]), 'u1', null, TZ)).toBeNull();
    const supabase = makeSupabase([{ data: [] }, { data: [] }]);
    const activity = { id: 'a1', matched_planned_workout_id: null, start_date_local: '2026-07-23T10:00:00Z' };
    expect(await resolvePlannedWorkoutForActivity(supabase, 'u1', activity, TZ)).toBeNull();
  });
});
