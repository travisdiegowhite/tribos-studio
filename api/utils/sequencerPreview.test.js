import { describe, it, expect } from 'vitest';
import { resolveRaceForAnchor } from './sequencerPreview.js';

// Minimal supabase stub: from('race_goals').select(...).eq('id', ...).maybeSingle()
// resolves to the configured race row.
function makeSupabase(race) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: race, error: null }),
        }),
      }),
    }),
  };
}

const FUTURE = '2999-08-15';
const PAST = '2000-01-01';

describe('resolveRaceForAnchor', () => {
  it('returns race + tier for a valid upcoming future race', async () => {
    const race = { id: 'r1', user_id: 'u1', name: 'Summer Vibes', race_date: FUTURE, priority: 'A', status: 'upcoming' };
    const out = await resolveRaceForAnchor(makeSupabase(race), 'u1', 'r1');
    expect(out.error).toBeUndefined();
    expect(out.tier).toBe('A');
    expect(out.race.id).toBe('r1');
  });

  it('defaults tier to B when priority is null', async () => {
    const race = { id: 'r1', user_id: 'u1', name: 'X', race_date: FUTURE, priority: null, status: 'upcoming' };
    const out = await resolveRaceForAnchor(makeSupabase(race), 'u1', 'r1');
    expect(out.tier).toBe('B');
  });

  it('404 when the race is not found', async () => {
    const out = await resolveRaceForAnchor(makeSupabase(null), 'u1', 'missing');
    expect(out).toMatchObject({ error: 'race_goal_not_found', status: 404 });
  });

  it('403 when the race belongs to another user', async () => {
    const race = { id: 'r1', user_id: 'someone_else', name: 'X', race_date: FUTURE, priority: 'A', status: 'upcoming' };
    const out = await resolveRaceForAnchor(makeSupabase(race), 'u1', 'r1');
    expect(out).toMatchObject({ error: 'race_goal_not_owned_by_user', status: 403 });
  });

  it('400 when the race is not upcoming', async () => {
    const race = { id: 'r1', user_id: 'u1', name: 'X', race_date: FUTURE, priority: 'A', status: 'completed' };
    const out = await resolveRaceForAnchor(makeSupabase(race), 'u1', 'r1');
    expect(out).toMatchObject({ error: 'race_goal_not_upcoming', status: 400 });
  });

  it('400 when the race date is in the past', async () => {
    const race = { id: 'r1', user_id: 'u1', name: 'X', race_date: PAST, priority: 'A', status: 'upcoming' };
    const out = await resolveRaceForAnchor(makeSupabase(race), 'u1', 'r1');
    expect(out).toMatchObject({ error: 'race_in_past', status: 400 });
  });
});
