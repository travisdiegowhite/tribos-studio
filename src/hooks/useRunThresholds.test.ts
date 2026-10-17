import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  main: { data: null as unknown, error: null as unknown },
  est: { data: null as unknown, error: null as unknown },
}));

vi.mock('../lib/supabase', () => {
  const from = () => {
    let columns = '';
    const q = {
      select: (c: string) => {
        columns = c;
        return q;
      },
      eq: () => q,
      maybeSingle: async () => (columns.includes('estimated_') ? db.est : db.main),
    };
    return q;
  };
  return { supabase: { from, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } };
});

import { loadRunThresholds, resetRunThresholdsCache } from './useRunThresholds';

beforeEach(() => {
  resetRunThresholdsCache();
  db.main = { data: { threshold_pace_sec: null, lthr: null, max_hr: 190, resting_hr: 50 }, error: null };
  db.est = { data: { estimated_threshold_pace_sec: 282, estimated_lthr: 167 }, error: null };
});

describe('loadRunThresholds', () => {
  it('falls back to the stored history estimate', async () => {
    expect(await loadRunThresholds()).toMatchObject({
      thresholdPaceSec: 282,
      paceFrom: 'estimated',
      lthr: 167,
      lthrFrom: 'estimated',
      maxHr: 190,
    });
  });

  it("prefers the athlete's own values", async () => {
    db.main = { data: { threshold_pace_sec: 270, lthr: 170, max_hr: null, resting_hr: null }, error: null };
    expect(await loadRunThresholds()).toMatchObject({
      thresholdPaceSec: 270,
      paceFrom: 'profile',
      lthr: 170,
      lthrFrom: 'profile',
      estimatedPaceSec: 282,
    });
  });

  it('ignores a missing estimate column', async () => {
    db.est = { data: null, error: { message: 'column user_profiles.estimated_threshold_pace_sec does not exist' } };
    expect(await loadRunThresholds()).toMatchObject({ thresholdPaceSec: null, paceFrom: null, maxHr: 190 });
  });
});
