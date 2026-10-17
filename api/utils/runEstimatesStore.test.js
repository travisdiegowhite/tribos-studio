import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeRunEstimates, resetRunEstimatesFallback } from './runEstimatesStore.js';

function fakeSupabase({ row = { estimated_threshold_pace_sec: null, estimated_lthr: null }, readError = null } = {}) {
  const updates = [];
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: readError ? null : row, error: readError }),
    update: (payload) => {
      updates.push(payload);
      return { eq: async () => ({ error: null }) };
    },
  };
  return { client: { from: () => q }, updates };
}

const NOW = new Date('2026-10-17T02:30:00Z');

describe('storeRunEstimates', () => {
  beforeEach(() => resetRunEstimatesFallback());

  it('writes only the estimate columns', async () => {
    const { client, updates } = fakeSupabase();
    const r = await storeRunEstimates(client, 'u1', { thresholdPaceSec: 270, estimated: { thresholdPaceSec: 281.6, lthr: 167 } }, { now: NOW });
    expect(r.written).toBe(true);
    expect(updates).toEqual([
      { estimated_threshold_pace_sec: 282, estimated_lthr: 167, run_estimates_at: NOW.toISOString() },
    ]);
  });

  it('skips an unchanged estimate and keeps a stored one when none is found', async () => {
    const { client, updates } = fakeSupabase({ row: { estimated_threshold_pace_sec: 282, estimated_lthr: 167 } });
    expect((await storeRunEstimates(client, 'u1', { estimated: { thresholdPaceSec: 282, lthr: 167 } })).written).toBe(false);
    expect((await storeRunEstimates(client, 'u1', { estimated: { thresholdPaceSec: null, lthr: null } })).written).toBe(false);
    expect(updates).toEqual([]);
  });

  it('stops asking once migration 136 is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, updates } = fakeSupabase({
      readError: { message: 'column user_profiles.estimated_threshold_pace_sec does not exist' },
    });
    const from = vi.spyOn(client, 'from');
    await storeRunEstimates(client, 'u1', { estimated: { thresholdPaceSec: 282, lthr: 167 } });
    await storeRunEstimates(client, 'u1', { estimated: { thresholdPaceSec: 282, lthr: 167 } });
    expect(from).toHaveBeenCalledTimes(1);
    expect(updates).toEqual([]);
  });
});
