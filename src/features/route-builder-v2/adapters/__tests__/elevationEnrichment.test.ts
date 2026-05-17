import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutorResult, RouteSnapshot } from '../../../../routing/executor';

vi.mock('../../../../utils/elevation', () => ({
  getElevationData: vi.fn(),
  calculateElevationStats: vi.fn(),
}));

vi.mock('../../telemetry/trackRb2', () => ({
  trackRb2: vi.fn(),
}));

import { getElevationData, calculateElevationStats } from '../../../../utils/elevation';
import { trackRb2 } from '../../telemetry/trackRb2';
import {
  enrichElevation,
  enrichElevationBatch,
  clearElevationCache,
  __elevationCacheStats,
} from '../elevationEnrichment';

const mockGetElevationData = vi.mocked(getElevationData);
const mockCalculateStats = vi.mocked(calculateElevationStats);
const mockTrack = vi.mocked(trackRb2);

function makeSuccess(overrides: Partial<RouteSnapshot> = {}): ExecutorResult {
  const geometry: [number, number][] = [
    [-105.0, 40.0],
    [-105.01, 40.01],
    [-105.02, 40.02],
  ];
  return {
    ok: true,
    route: {
      geometry,
      waypoints: geometry.map((c) => ({ coordinate: c })),
      stats: {
        distance_km: 5,
        elevation_gain_m: 0,
        elevation_loss_m: 0,
        duration_s: 900,
      },
      ...overrides,
    },
    metadata: {
      provider_used: 'stadia',
      duration_ms: 100,
      cache_hit: false,
      attempts_tried: 1,
    },
  };
}

function makeFailure(): ExecutorResult {
  return {
    ok: false,
    reason: { kind: 'router_unavailable', providers_tried: ['stadia'] },
  };
}

function makeProfile(elevations: number[]): Array<{ elevation: number }> {
  return elevations.map((e) => ({ elevation: e }));
}

beforeEach(() => {
  clearElevationCache();
  mockGetElevationData.mockReset();
  mockCalculateStats.mockReset();
  mockTrack.mockReset();
});

afterEach(() => {
  clearElevationCache();
});

describe('enrichElevation — pass-through cases', () => {
  it('returns failed results unchanged without fetching', async () => {
    const failure = makeFailure();
    const out = await enrichElevation(failure);
    expect(out).toBe(failure);
    expect(mockGetElevationData).not.toHaveBeenCalled();
  });

  it('skips when geometry has fewer than 2 points', async () => {
    const result = makeSuccess({ geometry: [[-105, 40]] });
    const out = await enrichElevation(result);
    expect(out).toBe(result);
    expect(mockGetElevationData).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      'elevation_enrich_skipped',
      expect.objectContaining({ reason: 'no_geometry' }),
    );
  });

  it('passes through already-enriched routes (BRouter-style)', async () => {
    const result = makeSuccess({
      stats: {
        distance_km: 5,
        elevation_gain_m: 250,
        elevation_loss_m: 250,
        duration_s: 900,
      },
      elevations_m: [1500, 1600, 1500],
    });
    const out = await enrichElevation(result);
    expect(out).toBe(result);
    expect(mockGetElevationData).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      'elevation_enrich_skipped',
      expect.objectContaining({ reason: 'already_enriched' }),
    );
  });
});

describe('enrichElevation — fetch + apply', () => {
  it('fetches, applies stats, and populates per-point elevations', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([1500, 1620, 1580]));
    mockCalculateStats.mockReturnValue({ gain: 120, loss: 40, min: 1500, max: 1620 });

    const result = makeSuccess();
    const out = await enrichElevation(result);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.route.stats.elevation_gain_m).toBe(120);
    expect(out.route.stats.elevation_loss_m).toBe(40);
    expect(out.route.elevations_m).toEqual([1500, 1620, 1580]);
    expect(mockGetElevationData).toHaveBeenCalledTimes(1);
  });

  it('preserves unrelated stats and waypoints', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([100, 110, 105]));
    mockCalculateStats.mockReturnValue({ gain: 10, loss: 5, min: 100, max: 110 });

    const result = makeSuccess();
    const out = await enrichElevation(result);

    if (!out.ok) throw new Error('expected ok');
    expect(out.route.stats.distance_km).toBe(5);
    expect(out.route.stats.duration_s).toBe(900);
    expect(out.route.waypoints.length).toBe(3);
    expect(out.metadata.provider_used).toBe('stadia');
  });

  it('overwrites stats even when the provider already reported non-zero gain (regression: BRouter without elevations_m gets fresh API stats)', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([0, 50, 0]));
    mockCalculateStats.mockReturnValue({ gain: 50, loss: 50, min: 0, max: 50 });

    const result = makeSuccess({
      stats: {
        distance_km: 5,
        elevation_gain_m: 999,
        elevation_loss_m: 999,
        duration_s: 900,
      },
    });
    const out = await enrichElevation(result);
    if (!out.ok) throw new Error('expected ok');

    expect(out.route.stats.elevation_gain_m).toBe(50);
    expect(out.route.stats.elevation_loss_m).toBe(50);
  });
});

describe('enrichElevation — cache behavior', () => {
  it('caches successful enrichments per quantized geometry', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([10, 20, 15]));
    mockCalculateStats.mockReturnValue({ gain: 10, loss: 5, min: 10, max: 20 });

    const r1 = await enrichElevation(makeSuccess());
    const r2 = await enrichElevation(makeSuccess());

    expect(mockGetElevationData).toHaveBeenCalledTimes(1);
    expect(__elevationCacheStats().hits).toBe(1);
    expect(__elevationCacheStats().misses).toBe(1);

    if (!r1.ok || !r2.ok) throw new Error('expected ok');
    expect(r2.route.stats.elevation_gain_m).toBe(10);
    expect(r2.route.elevations_m).toEqual([10, 20, 15]);
  });

  it('skipCache bypasses the cache', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([1, 2, 3]));
    mockCalculateStats.mockReturnValue({ gain: 2, loss: 0, min: 1, max: 3 });

    await enrichElevation(makeSuccess());
    await enrichElevation(makeSuccess(), { skipCache: true });

    expect(mockGetElevationData).toHaveBeenCalledTimes(2);
  });

  it('clearElevationCache empties the cache', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([1, 2, 3]));
    mockCalculateStats.mockReturnValue({ gain: 2, loss: 0, min: 1, max: 3 });

    await enrichElevation(makeSuccess());
    expect(__elevationCacheStats().size).toBe(1);
    clearElevationCache();
    expect(__elevationCacheStats().size).toBe(0);

    await enrichElevation(makeSuccess());
    expect(mockGetElevationData).toHaveBeenCalledTimes(2);
  });

  it('treats 5-decimal-equivalent coordinates as cache hits', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([5, 10, 7]));
    mockCalculateStats.mockReturnValue({ gain: 5, loss: 3, min: 5, max: 10 });

    const r1 = makeSuccess();
    // Same coords with 7-decimal drift below the 5-decimal quantization.
    const r2 = makeSuccess({
      geometry: [
        [-105.0000001, 40.0000001],
        [-105.0100001, 40.0100001],
        [-105.0200001, 40.0200001],
      ],
    });

    await enrichElevation(r1);
    await enrichElevation(r2);

    expect(mockGetElevationData).toHaveBeenCalledTimes(1);
  });

  it('treats coords differing in the 4th decimal as distinct keys', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([5, 10, 7]));
    mockCalculateStats.mockReturnValue({ gain: 5, loss: 3, min: 5, max: 10 });

    const r1 = makeSuccess();
    const r2 = makeSuccess({
      geometry: [
        [-105.001, 40.001],
        [-105.011, 40.011],
        [-105.021, 40.021],
      ],
    });

    await enrichElevation(r1);
    await enrichElevation(r2);

    expect(mockGetElevationData).toHaveBeenCalledTimes(2);
  });
});

describe('enrichElevation — failure modes', () => {
  it('returns the original result when getElevationData returns null', async () => {
    mockGetElevationData.mockResolvedValue(null);

    const result = makeSuccess();
    const out = await enrichElevation(result);

    expect(out).toBe(result);
    expect(mockCalculateStats).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      'elevation_enrich_failed',
      expect.objectContaining({ error_message: 'null_profile' }),
    );
  });

  it('returns the original result when profile length mismatches geometry length', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([1, 2]));
    mockCalculateStats.mockReturnValue({ gain: 1, loss: 0, min: 1, max: 2 });

    const result = makeSuccess();
    const out = await enrichElevation(result);

    expect(out).toBe(result);
    expect(mockTrack).toHaveBeenCalledWith(
      'elevation_enrich_failed',
      expect.objectContaining({ error_message: 'length_mismatch' }),
    );
  });

  it('swallows thrown errors and returns the original result', async () => {
    mockGetElevationData.mockRejectedValue(new Error('boom'));

    const result = makeSuccess();
    const out = await enrichElevation(result);

    expect(out).toBe(result);
    expect(mockTrack).toHaveBeenCalledWith(
      'elevation_enrich_failed',
      expect.objectContaining({ error_message: 'boom' }),
    );
  });
});

describe('enrichElevationBatch', () => {
  it('enriches every result and deduplicates identical geometries via cache', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([0, 10, 5]));
    mockCalculateStats.mockReturnValue({ gain: 10, loss: 5, min: 0, max: 10 });

    const out = await enrichElevationBatch([
      makeSuccess(),
      makeSuccess(),
      makeSuccess({
        geometry: [
          [-100.0, 35.0],
          [-100.1, 35.1],
          [-100.2, 35.2],
        ],
      }),
    ]);

    // Two distinct geometries → two API calls (one cached for the
    // repeat).  Concurrency in Promise.all means both first-time
    // geometries can hit the network before either populates cache.
    expect(mockGetElevationData.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockGetElevationData.mock.calls.length).toBeLessThanOrEqual(3);
    expect(out.length).toBe(3);
    out.forEach((r) => expect(r.ok).toBe(true));
  });

  it('passes through failed results in the batch', async () => {
    mockGetElevationData.mockResolvedValue(makeProfile([0, 10, 5]));
    mockCalculateStats.mockReturnValue({ gain: 10, loss: 5, min: 0, max: 10 });

    const out = await enrichElevationBatch([makeFailure(), makeSuccess(), makeFailure()]);
    expect(out[0].ok).toBe(false);
    expect(out[1].ok).toBe(true);
    expect(out[2].ok).toBe(false);
  });
});
