import { describe, it, expect } from 'vitest';
import {
  computeTFIComposition,
  buildTFICompositionForUser,
} from './fitnessSnapshots.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Build a Supabase client mock whose `.from('activities').select(...)...`
 * chain resolves to `{ data, error }`. Every chained filter method returns
 * the same builder so any ordering works.
 */
function mockSupabase({ data = [], error = null } = {}) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    or: () => builder,
    is: () => builder,
    gte: () => builder,
    lt: () => builder,
    lte: () => builder,
    not: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve) => Promise.resolve({ data, error }).then(resolve),
  };
  return {
    from: () => builder,
  };
}

function makeActivity({
  start_date = '2026-04-10T12:00:00.000Z',
  rss = 100,
  duration_seconds = 3600,
  power_zone_distribution = null,
} = {}) {
  return {
    start_date,
    rss,
    fit_coach_context: power_zone_distribution == null && duration_seconds == null
      ? null
      : {
          schema_version: 1,
          duration_seconds,
          power_zone_distribution,
        },
  };
}

// ─── computeTFIComposition ────────────────────────────────────────────────

describe('computeTFIComposition', () => {
  it('returns null for empty input', () => {
    expect(computeTFIComposition([])).toBeNull();
    expect(computeTFIComposition(null)).toBeNull();
    expect(computeTFIComposition(undefined)).toBeNull();
  });

  it('returns null when all entries have rss <= 0', () => {
    expect(
      computeTFIComposition([
        { rss: 0, aerobic_seconds: 100, threshold_seconds: 0, high_intensity_seconds: 0 },
        { rss: -5, aerobic_seconds: 200, threshold_seconds: 0, high_intensity_seconds: 0 },
      ])
    ).toBeNull();
  });

  it('returns null when all zone-seconds are 0', () => {
    expect(
      computeTFIComposition([
        { rss: 100, aerobic_seconds: 0, threshold_seconds: 0, high_intensity_seconds: 0 },
      ])
    ).toBeNull();
  });

  it('produces fractions that sum to ~1', () => {
    const result = computeTFIComposition([
      {
        rss: 100,
        aerobic_seconds: 1800,
        threshold_seconds: 900,
        high_intensity_seconds: 900,
      },
    ]);
    const sum =
      result.aerobic_fraction +
      result.threshold_fraction +
      result.high_intensity_fraction;
    expect(sum).toBeGreaterThan(0.99);
    expect(sum).toBeLessThan(1.01);
  });

  it('weights by rss across multiple days', () => {
    // Day A: high rss, 100% aerobic.
    // Day B: low rss, 100% high_intensity.
    // Expect aerobic_fraction ≈ 0.9, high_intensity ≈ 0.1.
    const result = computeTFIComposition([
      { rss: 90, aerobic_seconds: 3600, threshold_seconds: 0, high_intensity_seconds: 0 },
      { rss: 10, aerobic_seconds: 0, threshold_seconds: 0, high_intensity_seconds: 3600 },
    ]);
    expect(result.aerobic_fraction).toBeCloseTo(0.9, 2);
    expect(result.threshold_fraction).toBeCloseTo(0.0, 2);
    expect(result.high_intensity_fraction).toBeCloseTo(0.1, 2);
  });
});

// ─── buildTFICompositionForUser ───────────────────────────────────────────

describe('buildTFICompositionForUser', () => {
  it('returns null when the activities query is empty', async () => {
    const supabase = mockSupabase({ data: [] });
    const result = await buildTFICompositionForUser(
      supabase,
      'user-1',
      '2026-04-15',
      42
    );
    expect(result).toBeNull();
  });

  it('returns null when the query errors', async () => {
    const supabase = mockSupabase({ data: null, error: new Error('boom') });
    const result = await buildTFICompositionForUser(
      supabase,
      'user-1',
      '2026-04-15',
      42
    );
    expect(result).toBeNull();
  });

  it('returns null when activities lack power_zone_distribution', async () => {
    const supabase = mockSupabase({
      data: [
        { start_date: '2026-04-10T10:00:00Z', rss: 80, fit_coach_context: { duration_seconds: 3600 } },
      ],
    });
    const result = await buildTFICompositionForUser(
      supabase,
      'user-1',
      '2026-04-15',
      42
    );
    expect(result).toBeNull();
  });

  it('skips activities missing duration_seconds', async () => {
    const supabase = mockSupabase({
      data: [
        {
          start_date: '2026-04-10T10:00:00Z',
          rss: 80,
          fit_coach_context: {
            power_zone_distribution: { z1: 50, z2: 50 },
            // duration_seconds missing
          },
        },
      ],
    });
    const result = await buildTFICompositionForUser(
      supabase,
      'user-1',
      '2026-04-15',
      42
    );
    expect(result).toBeNull();
  });

  it('buckets zones per spec §3.4 (Z1+Z2 / Z3+Z4 / Z5-Z7)', async () => {
    // 50% Z1 + 50% Z4 → aerobic 0.5, threshold 0.5, high_intensity 0
    const supabase = mockSupabase({
      data: [
        makeActivity({
          rss: 100,
          duration_seconds: 3600,
          power_zone_distribution: {
            z1: 50, z2: 0, z3: 0, z4: 50, z5: 0, z6: 0, z7: 0,
          },
        }),
      ],
    });
    const result = await buildTFICompositionForUser(
      supabase,
      'user-1',
      '2026-04-15',
      42
    );
    expect(result.aerobic_fraction).toBeCloseTo(0.5, 2);
    expect(result.threshold_fraction).toBeCloseTo(0.5, 2);
    expect(result.high_intensity_fraction).toBeCloseTo(0.0, 2);
  });

  it('treats Z5, Z6, Z7 as high_intensity', async () => {
    const supabase = mockSupabase({
      data: [
        makeActivity({
          rss: 50,
          duration_seconds: 1800,
          power_zone_distribution: {
            z1: 0, z2: 0, z3: 0, z4: 0, z5: 30, z6: 40, z7: 30,
          },
        }),
      ],
    });
    const result = await buildTFICompositionForUser(
      supabase,
      'user-1',
      '2026-04-15',
      42
    );
    expect(result.aerobic_fraction).toBeCloseTo(0.0, 2);
    expect(result.threshold_fraction).toBeCloseTo(0.0, 2);
    expect(result.high_intensity_fraction).toBeCloseTo(1.0, 2);
  });

  it('aggregates multiple activities on the same day by time', async () => {
    // Same day, two rides — both summed into one daily entry. Fractions
    // within a day are weighted by seconds, not rss (rss only weights
    // how the day contributes across days).
    // Ride 1: 3600s of Z1 (aerobic). Ride 2: 1800s of Z3 (threshold).
    // Day totals: aerobic_sec=3600, threshold_sec=1800, total=5400.
    // Expect aerobic_fraction=2/3, threshold_fraction=1/3.
    const supabase = mockSupabase({
      data: [
        makeActivity({
          start_date: '2026-04-10T06:00:00Z',
          rss: 60,
          duration_seconds: 3600,
          power_zone_distribution: {
            z1: 100, z2: 0, z3: 0, z4: 0, z5: 0, z6: 0, z7: 0,
          },
        }),
        makeActivity({
          start_date: '2026-04-10T18:00:00Z',
          rss: 40,
          duration_seconds: 1800,
          power_zone_distribution: {
            z1: 0, z2: 0, z3: 100, z4: 0, z5: 0, z6: 0, z7: 0,
          },
        }),
      ],
    });
    const result = await buildTFICompositionForUser(
      supabase,
      'user-1',
      '2026-04-15',
      42
    );
    expect(result.aerobic_fraction).toBeCloseTo(2 / 3, 2);
    expect(result.threshold_fraction).toBeCloseTo(1 / 3, 2);
    expect(result.high_intensity_fraction).toBeCloseTo(0.0, 2);
  });

  it('falls back to tau=42 when passed null or non-finite', async () => {
    // Verifies no throw; the query mock is inert so both still return null.
    const supabase = mockSupabase({ data: [] });
    await expect(
      buildTFICompositionForUser(supabase, 'user-1', '2026-04-15', null)
    ).resolves.toBeNull();
    await expect(
      buildTFICompositionForUser(supabase, 'user-1', '2026-04-15', NaN)
    ).resolves.toBeNull();
    await expect(
      buildTFICompositionForUser(supabase, 'user-1', '2026-04-15', 0)
    ).resolves.toBeNull();
  });

  it('returns null for an invalid date string', async () => {
    const supabase = mockSupabase({ data: [] });
    const result = await buildTFICompositionForUser(
      supabase,
      'user-1',
      'not-a-date',
      42
    );
    expect(result).toBeNull();
  });
});
