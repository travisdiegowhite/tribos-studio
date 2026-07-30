import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { coordinateAtDistanceKm, getElevationData, clearElevationCache, summarizeClimbs } from '../elevation';

describe('coordinateAtDistanceKm', () => {
  // A straight east-west segment near the equator. Two coords; the geometric
  // midpoint sits at half the total distance.
  const SEGMENT = [
    [-105.0, 40.0],
    [-105.1, 40.0],
  ];

  it('returns null for empty input', () => {
    expect(coordinateAtDistanceKm([], 1)).toBeNull();
    expect(coordinateAtDistanceKm(null, 1)).toBeNull();
  });

  it('returns null for non-finite distance', () => {
    expect(coordinateAtDistanceKm(SEGMENT, NaN)).toBeNull();
    expect(coordinateAtDistanceKm(SEGMENT, Infinity)).toBeNull();
  });

  it('returns the sole coordinate for a single-point array', () => {
    expect(coordinateAtDistanceKm([[-105, 40]], 3)).toEqual([-105, 40]);
  });

  it('clamps to the first coordinate at or below zero distance', () => {
    expect(coordinateAtDistanceKm(SEGMENT, 0)).toEqual(SEGMENT[0]);
    expect(coordinateAtDistanceKm(SEGMENT, -5)).toEqual(SEGMENT[0]);
  });

  it('clamps to the last coordinate beyond the total distance', () => {
    expect(coordinateAtDistanceKm(SEGMENT, 99999)).toEqual(SEGMENT[1]);
  });

  it('interpolates the midpoint at half the total distance', () => {
    // Determine total length, then ask for the halfway point.
    const last = coordinateAtDistanceKm(SEGMENT, 99999); // = end
    expect(last).toEqual(SEGMENT[1]);
    // Halfway by distance should be the lng midpoint (lat constant).
    // Total ~8.5km at this latitude; 4.25km is the midpoint, but rather than
    // hardcode the haversine total we probe with a value we compute relatively:
    // use a tiny helper — half of a known total.
    const half = coordinateAtDistanceKm(SEGMENT, totalKm(SEGMENT) / 2);
    expect(half[0]).toBeCloseTo(-105.05, 4);
    expect(half[1]).toBeCloseTo(40.0, 6);
  });

  it('interpolates into the correct segment of an L-shaped polyline', () => {
    // Leg A: west along lat 40. Leg B: north along lng -105.1.
    const L = [
      [-105.0, 40.0],
      [-105.1, 40.0],
      [-105.1, 40.1],
    ];
    const total = totalKm(L);
    const legA = totalKm([L[0], L[1]]);
    // A distance past leg A lands on leg B (lng pinned at -105.1, lat climbing).
    const p = coordinateAtDistanceKm(L, legA + (total - legA) / 2);
    expect(p[0]).toBeCloseTo(-105.1, 4);
    expect(p[1]).toBeGreaterThan(40.0);
    expect(p[1]).toBeLessThan(40.1);
  });
});

describe('getElevationData caching + retry', () => {
  const ROUTE = [
    [-105.0, 40.0],
    [-105.01, 40.001],
    [-105.02, 40.002],
  ];

  const okResponse = (coords) => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      results: coords.map(([lon, lat]) => ({ lat, lon, elevation: 1600 })),
    }),
  });

  beforeEach(() => {
    clearElevationCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    clearElevationCache();
  });

  it('dedupes concurrent identical requests into a single fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(ROUTE));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([getElevationData(ROUTE), getElevationData(ROUTE)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b); // both callers share the one in-flight result
    expect(a).toHaveLength(ROUTE.length);
    expect(a[0].elevation).toBe(1600);
  });

  it('serves a cached result for a repeat request (no second fetch)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(ROUTE));
    vi.stubGlobal('fetch', fetchMock);

    const first = await getElevationData(ROUTE);
    const second = await getElevationData(ROUTE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('retries on a 429 then succeeds (no dropped batch)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce(okResponse(ROUTE));
    vi.stubGlobal('fetch', fetchMock);

    const promise = getElevationData(ROUTE);
    await vi.advanceTimersByTimeAsync(1100); // clear the 1s backoff
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(ROUTE.length);
    expect(result[2].elevation).toBe(1600);
  });
});

describe('summarizeClimbs', () => {
  // Build a profile from (km, elevation) pairs using the canonical field name.
  const profile = (pairs) => pairs.map(([km, elevation]) => ({ distance_km: km, elevation }));

  it('returns [] for empty, null, or single-point input', () => {
    expect(summarizeClimbs(null)).toEqual([]);
    expect(summarizeClimbs([])).toEqual([]);
    expect(summarizeClimbs(profile([[0, 100]]))).toEqual([]);
  });

  it('returns [] for a flat course', () => {
    expect(summarizeClimbs(profile([[0, 100], [5, 100], [10, 101]]))).toEqual([]);
  });

  it('detects a single clean climb with correct position, length, gain, and grade', () => {
    // Flat to km 5, then 2 km at a steady 5% (100 m gain), then flat.
    const climbs = summarizeClimbs(profile([[0, 100], [5, 100], [7, 200], [10, 200]]));
    expect(climbs).toHaveLength(1);
    const c = climbs[0];
    expect(c.start_km).toBeCloseTo(5, 0);
    expect(c.length_km).toBeCloseTo(2, 0);
    expect(c.gain_m).toBeGreaterThanOrEqual(95);
    expect(c.gain_m).toBeLessThanOrEqual(105);
    expect(c.avg_grade_pct).toBeGreaterThanOrEqual(4.5);
    expect(c.avg_grade_pct).toBeLessThanOrEqual(5.5);
    expect(c.max_grade_pct).toBeGreaterThanOrEqual(c.avg_grade_pct);
  });

  it('sorts two climbs by gain, descending', () => {
    // Small climb: 1 km at 4% (40 m). Big climb: 2 km at 6% (120 m).
    const climbs = summarizeClimbs(
      profile([[0, 100], [2, 100], [3, 140], [6, 140], [8, 260], [10, 260]])
    );
    expect(climbs).toHaveLength(2);
    expect(climbs[0].gain_m).toBeGreaterThan(climbs[1].gain_m);
    expect(climbs[0].start_km).toBeCloseTo(6, 0);
    expect(climbs[1].start_km).toBeCloseTo(2, 0);
  });

  it('ignores a spike shorter than minLengthKm', () => {
    // 0.1 km bump of 15 m: steep but too short to count as a climb.
    const climbs = summarizeClimbs(profile([[0, 100], [5, 100], [5.1, 115], [5.2, 100], [10, 100]]));
    expect(climbs).toEqual([]);
  });

  it('merges a short mid-climb dip into one climb', () => {
    // 1 km at 6%, a 0.1 km flat shelf, then another 1 km at 6% — one climb.
    const climbs = summarizeClimbs(
      profile([[0, 100], [4, 100], [5, 160], [5.1, 160], [6.1, 220], [10, 220]])
    );
    expect(climbs).toHaveLength(1);
    expect(climbs[0].gain_m).toBeGreaterThanOrEqual(110);
    expect(climbs[0].length_km).toBeGreaterThanOrEqual(2);
  });

  it('caps the result at maxClimbs, keeping the biggest', () => {
    // Four separated climbs of increasing gain.
    const pairs = [[0, 0]];
    let km = 1;
    let elev = 0;
    for (const gain of [40, 60, 80, 100]) {
      pairs.push([km, elev]); // flat approach
      km += 1;
      elev += gain;
      pairs.push([km, elev]); // climb of `gain` m over 1 km
      km += 2;
      pairs.push([km - 1, elev]); // flat recovery
    }
    pairs.push([km, elev]);
    const climbs = summarizeClimbs(profile(pairs));
    expect(climbs).toHaveLength(3);
    expect(climbs.map((c) => c.gain_m).every((g) => g >= 55)).toBe(true);
  });

  it('reads the legacy `distance` alias when `distance_km` is absent', () => {
    const legacy = [
      { distance: 0, elevation: 100 },
      { distance: 5, elevation: 100 },
      { distance: 7, elevation: 200 },
      { distance: 10, elevation: 200 },
    ];
    expect(summarizeClimbs(legacy)).toHaveLength(1);
  });
});

// Local haversine total so the test doesn't depend on internal exports.
function totalKm(coords) {
  const R = 6371;
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    sum += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return sum;
}
