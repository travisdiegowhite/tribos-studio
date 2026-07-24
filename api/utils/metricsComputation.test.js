import { describe, it, expect } from 'vitest';
import { tryAutoMatchWorkout } from './metricsComputation.js';

/** Queue-based chainable supabase stub recording filters per .from() call. */
function makeSupabase(responses) {
  const calls = [];
  let idx = 0;
  return {
    calls,
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const resp = responses[idx++] ?? { data: null, error: null };
      const chain = {};
      for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'is', 'order', 'limit']) {
        chain[m] = (...args) => {
          call.filters.push([m, ...args]);
          return chain;
        };
      }
      chain.maybeSingle = () => Promise.resolve(resp);
      chain.then = (resolve, reject) => Promise.resolve(resp).then(resolve, reject);
      return chain;
    },
  };
}

const PLANS = { data: [{ id: 'p1' }] };

describe('tryAutoMatchWorkout — local-date basis', () => {
  // Thu 19:30 Denver ride: UTC start_date is Friday. Target 55, actual 90 RSS
  // (63% off → 0 TSS pts), no target_duration (+10). UTC basis: 20 date pts
  // + 0 + 10 = 30 → below the 40 threshold → no match (the reported bug).
  // Local basis: 40 + 0 + 10 = 50 → matched.
  const workout = {
    id: 'w1',
    scheduled_date: '2026-07-23',
    target_rss: null,
    target_tss: 55,
    target_duration: null,
    workout_type: 'endurance',
  };

  it('matches an evening ride to its LOCAL day workout (UTC basis would fail)', async () => {
    const supabase = makeSupabase([PLANS, { data: [workout] }]);
    const activity = {
      start_date: '2026-07-24T01:30:00Z',
      start_date_local: '2026-07-23T19:30:00Z', // Strava fake-UTC local string
      rss: 90,
      moving_time: 4440,
    };
    const matched = await tryAutoMatchWorkout(supabase, 'u1', activity);
    expect(matched).toBe('w1');
    // Candidate window derived from the LOCAL date.
    expect(supabase.calls[1].filters).toContainEqual(['gte', 'scheduled_date', '2026-07-22']);
    expect(supabase.calls[1].filters).toContainEqual(['lte', 'scheduled_date', '2026-07-24']);
  });

  it('reads canonical target_rss before legacy target_tss for the load score', async () => {
    // target_rss 75 vs actual 75 → exact TSS match (30 pts). If legacy
    // target_tss (30) were used, the diff would be 150% → 0 pts.
    const canonical = { ...workout, target_rss: 75, target_tss: 30 };
    const supabase = makeSupabase([PLANS, { data: [canonical] }]);
    const activity = { start_date_local: '2026-07-23T19:30:00Z', rss: 75, moving_time: 4440 };
    expect(await tryAutoMatchWorkout(supabase, 'u1', activity)).toBe('w1');
  });

  it('falls back to the UTC date when start_date_local is absent (Wahoo)', async () => {
    const supabase = makeSupabase([PLANS, { data: [] }]);
    const activity = { start_date: '2026-07-24T01:30:00Z', rss: 90, moving_time: 4440 };
    await tryAutoMatchWorkout(supabase, 'u1', activity);
    expect(supabase.calls[1].filters).toContainEqual(['gte', 'scheduled_date', '2026-07-23']);
    expect(supabase.calls[1].filters).toContainEqual(['lte', 'scheduled_date', '2026-07-25']);
  });

  it('returns null with no active plans or no candidates', async () => {
    const noPlans = makeSupabase([{ data: [] }]);
    expect(await tryAutoMatchWorkout(noPlans, 'u1', { start_date_local: '2026-07-23T10:00:00Z', rss: 80 })).toBeNull();
    const noCandidates = makeSupabase([PLANS, { data: [] }]);
    expect(await tryAutoMatchWorkout(noCandidates, 'u1', { start_date_local: '2026-07-23T10:00:00Z', rss: 80 })).toBeNull();
  });
});
