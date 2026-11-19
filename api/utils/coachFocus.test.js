import { describe, it, expect } from 'vitest';
import { buildFocusContext, segmentStats, streamDistancesKm } from './coachFocus.js';

// Straight track north, 0.001° latitude per sample (~0.111 km).
const coords = Array.from({ length: 21 }, (_, i) => [-105, 40 + i * 0.001]);
const streams = {
  coords,
  power: coords.map((_, i) => (i < 10 ? 200 : 300)),
  heartRate: coords.map((_, i) => (i < 10 ? 140 : 165)),
  speed: coords.map(() => 5), // m/s
  elevation: coords.map((_, i) => 1600 + i * 5), // +5 m per ~111 m ≈ 4.5 %
};

describe('streamDistancesKm', () => {
  it('accumulates along the track', () => {
    const d = streamDistancesKm(streams);
    expect(d[0]).toBe(0);
    expect(d[20]).toBeCloseTo(2.224, 2);
  });
  it('is empty without coords', () => {
    expect(streamDistancesKm({ power: [1, 2] })).toEqual([]);
  });
});

describe('segmentStats', () => {
  it('measures just the selected stretch', () => {
    const s = segmentStats(streams, [1.2, 2.3]);
    expect(s.avg_power_w).toBe(300);
    expect(s.avg_hr_bpm).toBe(165);
    expect(s.avg_grade_pct).toBeGreaterThan(4);
    expect(s.avg_grade_pct).toBeLessThan(5);
    // 5 m/s → 18 km/h
    expect(s.avg_speed_kmh).toBeCloseTo(18, 0);
    expect(s.text).toMatch(/avg 300 W/);
  });

  it('ignores FIT sentinel values', () => {
    const noisy = { ...streams, power: streams.power.map((p, i) => (i === 15 ? 65535 : p)) };
    expect(segmentStats(noisy, [1.2, 2.3]).max_power_w).toBe(300);
  });

  it('returns null when the range holds fewer than two samples', () => {
    expect(segmentStats(streams, [10, 11])).toBeNull();
  });
});

function fakeSupabase(rows) {
  return {
    from() {
      let r = [...rows];
      const q = {
        select: () => q,
        eq: (col, val) => ((r = r.filter((x) => x[col] === val)), q),
        maybeSingle: () => Promise.resolve({ data: r[0] ?? null, error: null }),
      };
      return q;
    },
  };
}

describe('buildFocusContext', () => {
  const rows = [{ id: 'a1', user_id: 'u1', name: 'Hill reps', start_date: '2026-11-15T08:00:00Z', activity_streams: streams }];

  it("is null for another athlete's activity", async () => {
    const ctx = await buildFocusContext(fakeSupabase(rows), 'u2', {
      kind: 'ride_segment',
      activity_id: 'a1',
      range_km: [1, 2],
    });
    expect(ctx).toBeNull();
  });

  it('describes the stretch from the stored streams', async () => {
    const ctx = await buildFocusContext(fakeSupabase(rows), 'u1', {
      kind: 'ride_segment',
      activity_id: 'a1',
      range_km: [1.2, 2.3],
    });
    expect(ctx).toMatch(/Hill reps/);
    expect(ctx).toMatch(/avg 300 W/);
  });

  it('ignores malformed focus', async () => {
    expect(await buildFocusContext(fakeSupabase(rows), 'u1', { kind: 'ride_segment', activity_id: 'a1', range_km: [2, 1] })).toBeNull();
    expect(await buildFocusContext(fakeSupabase(rows), 'u1', { kind: 'nope' })).toBeNull();
  });
});
