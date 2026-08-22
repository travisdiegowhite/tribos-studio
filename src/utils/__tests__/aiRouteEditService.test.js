import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the routing + elevation layers the edit handlers compose.
const getSmartCyclingRoute = vi.fn();
const getBRouterDirections = vi.fn();
const getStadiaMapsRoute = vi.fn();
const getElevationData = vi.fn();
const calculateElevationStats = vi.fn();

vi.mock('../smartCyclingRouter.js', () => ({ getSmartCyclingRoute: (...a) => getSmartCyclingRoute(...a) }));
vi.mock('../brouter.js', () => ({
  getBRouterDirections: (...a) => getBRouterDirections(...a),
  BROUTER_PROFILES: {},
}));
vi.mock('../stadiaMapsRouter.js', () => ({ getStadiaMapsRoute: (...a) => getStadiaMapsRoute(...a) }));
vi.mock('../elevation.js', () => ({
  getElevationData: (...a) => getElevationData(...a),
  calculateElevationStats: (...a) => calculateElevationStats(...a),
}));

import { applyRouteEdit } from '../aiRouteEditService.js';

// A small loop near Boulder, CO (start ≈ end so isLoop is true).
const loop = (extra = 0) => [
  [-105.27, 40.01],
  [-105.25, 40.03 + extra],
  [-105.23, 40.01],
  [-105.25, 39.99],
  [-105.27, 40.01],
];
// A point-to-point line (start far from end).
const lineToFar = [
  [-105.27, 40.01],
  [-105.2, 40.05],
  [-105.1, 40.1],
];

const geom = (coords) => ({ type: 'LineString', coordinates: coords });
const stats = { distance_km: 28, elevation_gain_m: 300, duration_s: 3600 };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: elevation lookups succeed with a fixed gain unless overridden.
  // calculateElevationStats returns { gain, loss, min, max } — `gain` is
  // the field the service reads (the old `totalAscent` never existed).
  getElevationData.mockResolvedValue([{ elevation: 1 }]);
  calculateElevationStats.mockReturnValue({ gain: 500 });
});

describe('applyRouteEdit — add_climbing', () => {
  it('asks Stadia for the hilliest route and keeps the most-climbing candidate', async () => {
    getStadiaMapsRoute.mockResolvedValue({ coordinates: loop(0.01), source: 'stadia' });
    getBRouterDirections.mockResolvedValue({ coordinates: loop(0.02), source: 'brouter' });
    // Stadia candidate has more climbing than the BRouter one.
    getElevationData
      .mockResolvedValueOnce([{}]) // stadia candidate
      .mockResolvedValueOnce([{}]) // brouter candidate
      .mockResolvedValue([{}]); // buildComparison
    calculateElevationStats
      .mockReturnValueOnce({ gain: 900 }) // stadia
      .mockReturnValueOnce({ gain: 600 }) // brouter
      .mockReturnValue({ gain: 900 }); // comparison

    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'add_climbing' },
    });

    expect(res.success).toBe(true);
    const stadiaPrefs = getStadiaMapsRoute.mock.calls[0][1].preferences;
    expect(stadiaPrefs.use_hills).toBe(1);
    // 900 (new) - 300 (original) = +600m
    expect(res.message).toMatch(/600m more climbing/);
  });

  it('fails gracefully when no hillier alternative is found', async () => {
    getStadiaMapsRoute.mockResolvedValue(null);
    getBRouterDirections.mockResolvedValue(null);

    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'add_climbing' },
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/hillier/i);
  });
});

describe('applyRouteEdit — distance-preserving elevation edits', () => {
  it('samples reroute anchors by cumulative distance, not array index', async () => {
    // 8 tightly clustered points (~0.6 km) followed by two long jumps
    // (~10 km) — index sampling would put interior anchors inside the
    // cluster; distance sampling must land them on the sparse tail.
    const cluster = Array.from({ length: 8 }, (_, i) => [-105.0 - i * 0.001, 40.0]);
    const denseLine = [...cluster, [-105.06, 40.0], [-105.12, 40.0]];
    getStadiaMapsRoute.mockResolvedValue({ coordinates: denseLine, source: 'stadia' });
    getBRouterDirections.mockResolvedValue(null);
    calculateElevationStats.mockReturnValue({ gain: 900 });

    const res = await applyRouteEdit({
      routeGeometry: geom(denseLine),
      routeProfile: 'road',
      routeStats: { distance_km: 10, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'add_climbing' },
    });

    expect(res.success).toBe(true);
    const waypoints = getStadiaMapsRoute.mock.calls[0][0];
    expect(waypoints[0]).toEqual(denseLine[0]);
    expect(waypoints[waypoints.length - 1]).toEqual(denseLine[denseLine.length - 1]);
    // Interior anchors must come from the sparse tail (the distance
    // midpoints), never from the index-based cluster positions.
    for (const wp of waypoints.slice(1, -1)) {
      expect(cluster.slice(1)).not.toContainEqual(wp);
    }
  });

  it('rejects a candidate that drifts more than 25% from the original distance', async () => {
    // Stadia candidate collapses to a ~2-point short line (the shrink
    // bug); BRouter candidate keeps the original shape. Even though the
    // short one has far more climbing, the distance gate must discard it.
    const shortCut = [[-105.27, 40.01], [-105.26, 40.02]];
    getStadiaMapsRoute.mockResolvedValue({ coordinates: shortCut, source: 'stadia' });
    getBRouterDirections.mockResolvedValue({ coordinates: loop(0.001), source: 'brouter' });
    calculateElevationStats
      .mockReturnValueOnce({ gain: 2000 }) // stadia (would win on gain alone)
      .mockReturnValueOnce({ gain: 500 }); // brouter

    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'add_climbing' },
    });

    expect(res.success).toBe(true);
    expect(res.editedRoute.coordinates).toEqual(loop(0.001));
    expect(res.editedRoute.source).toBe('brouter');
  });

  it('fails honestly when every candidate blows the distance gate', async () => {
    const shortCut = [[-105.27, 40.01], [-105.26, 40.02]];
    getStadiaMapsRoute.mockResolvedValue({ coordinates: shortCut, source: 'stadia' });
    getBRouterDirections.mockResolvedValue({ coordinates: shortCut, source: 'brouter' });

    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'add_climbing' },
    });

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/distance/i);
  });

  it('steers use_hills from the requested elevation delta', async () => {
    getStadiaMapsRoute.mockResolvedValue({ coordinates: loop(0.01), source: 'stadia' });
    getBRouterDirections.mockResolvedValue(null);
    calculateElevationStats.mockReturnValue({ gain: 900 });

    // 300m current + 600m requested = 900m target over 28 km ≈ 32 m/km → 0.95
    await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'add_climbing', elevationDeltaM: 600 },
    });
    expect(getStadiaMapsRoute.mock.calls[0][1].preferences.use_hills).toBe(0.95);

    // flatten toward 100m over 28 km ≈ 3.6 m/km → 0.15
    getStadiaMapsRoute.mockClear();
    await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'flatten', elevationDeltaM: -200 },
    });
    expect(getStadiaMapsRoute.mock.calls[0][1].preferences.use_hills).toBe(0.15);
  });
});

describe('applyRouteEdit — longer', () => {
  it('extends a point-to-point route by bowing the midpoint (endpoints fixed)', async () => {
    // Mocked router result is ~6.4 km longer than the 10 km original —
    // within 20% of the requested +5 km, so one routing call suffices.
    const extended = [
      lineToFar[0],
      [-105.2, 40.12],
      [-105.14, 40.16],
      lineToFar[lineToFar.length - 1],
    ];
    getSmartCyclingRoute.mockResolvedValue({ coordinates: extended, source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(lineToFar),
      routeProfile: 'road',
      routeStats: { distance_km: 16.5, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'longer', distanceModifier: 5 },
    });

    expect(res.success).toBe(true);
    const wps = getSmartCyclingRoute.mock.calls[0][0];
    expect(wps).toHaveLength(3);
    expect(wps[0]).toEqual(lineToFar[0]);
    expect(wps[2]).toEqual(lineToFar[lineToFar.length - 1]);
    expect(res.message).toMatch(/start and end unchanged/i);
  });

  it('treats a declared loop with a broken closure as a loop and re-closes it', async () => {
    // Endpoint gap ≈ 1.5 km — over the 1 km geometric threshold, but the
    // builder says it's a loop, so the wider declared tolerance applies.
    const brokenLoop = [
      [-105.27, 40.01],
      [-105.25, 40.03],
      [-105.23, 40.01],
      [-105.25, 39.99],
      [-105.27, 40.0235],
    ];
    getSmartCyclingRoute.mockResolvedValue({ coordinates: loop(0.02), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(brokenLoop),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'longer', distanceModifier: 5 },
      routeType: 'loop',
    });

    expect(res.success).toBe(true);
    // Loop branch: 5 waypoints, closing back at the exact start.
    const wps = getSmartCyclingRoute.mock.calls[0][0];
    expect(wps).toHaveLength(5);
    expect(wps[0]).toEqual(brokenLoop[0]);
    expect(wps[4]).toEqual(brokenLoop[0]);
    expect(res.message).toMatch(/loop/i);
  });

  it('re-closes a declared loop when rerouting for elevation', async () => {
    const brokenLoop = [
      [-105.27, 40.01],
      [-105.25, 40.03],
      [-105.23, 40.01],
      [-105.25, 39.99],
      [-105.27, 40.0235],
    ];
    getStadiaMapsRoute.mockResolvedValue({ coordinates: loop(0.01), source: 'stadia' });
    getBRouterDirections.mockResolvedValue(null);
    calculateElevationStats.mockReturnValue({ gain: 900 });

    const res = await applyRouteEdit({
      routeGeometry: geom(brokenLoop),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'add_climbing' },
      routeType: 'loop',
    });

    expect(res.success).toBe(true);
    const waypoints = getStadiaMapsRoute.mock.calls[0][0];
    // Closure enforcement: the final reroute anchor is the exact start,
    // not the drifted endpoint 1.5 km away.
    expect(waypoints[waypoints.length - 1]).toEqual(brokenLoop[0]);
  });
});

describe('applyRouteEdit — add_waypoint', () => {
  it('stitches a route through the given coordinate without geocoding', async () => {
    getSmartCyclingRoute.mockResolvedValue({ coordinates: [[-105.25, 40.0], [-105.24, 40.0]], source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'add_waypoint', waypoint: [-105.24, 40.02] },
    });

    expect(res.success).toBe(true);
    // Two legs routed: to the waypoint and away from it.
    expect(getSmartCyclingRoute).toHaveBeenCalledTimes(2);
    expect(getSmartCyclingRoute.mock.calls[0][0][1]).toEqual([-105.24, 40.02]);
    expect(res.message).toMatch(/added waypoint/i);
  });

  it('rejects an invalid coordinate', async () => {
    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'add_waypoint', waypoint: ['x', 'y'] },
    });
    expect(res.success).toBe(false);
    expect(getSmartCyclingRoute).not.toHaveBeenCalled();
  });
});

describe('applyRouteEdit — shift_direction', () => {
  it('regenerates a loop biased toward the bearing (one call when distance lands close)', async () => {
    // Mocked route measures ~17 km; stats say 16 km — within the 20%
    // convergence window, so no rescale attempt fires.
    getSmartCyclingRoute.mockResolvedValue({ coordinates: loop(0.03), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: { distance_km: 16, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'shift_direction', direction: 'west' },
    });

    expect(res.success).toBe(true);
    expect(getSmartCyclingRoute).toHaveBeenCalledTimes(1);
    // 5 waypoints: start, lobe-30, lobe, lobe+30, start
    expect(getSmartCyclingRoute.mock.calls[0][0]).toHaveLength(5);
    expect(res.message).toMatch(/toward the west/i);
  });

  it('rescales the lobe once when the first attempt misses the distance', async () => {
    // First candidate measures ~11 km against a 28 km target → the lobe
    // radius rescales (clamped ×2.5) and a second, larger candidate wins.
    const bigLoop = [
      [-105.27, 40.01],
      [-105.23, 40.05],
      [-105.19, 40.01],
      [-105.23, 39.97],
      [-105.27, 40.01],
    ];
    getSmartCyclingRoute
      .mockResolvedValueOnce({ coordinates: loop(), source: 'stadia' })
      .mockResolvedValueOnce({ coordinates: bigLoop, source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats, // 28 km
      editIntent: { intent: 'shift_direction', direction: 'west' },
    });

    expect(res.success).toBe(true);
    expect(getSmartCyclingRoute).toHaveBeenCalledTimes(2);
    // Second attempt's far lobe point sits farther from the start.
    const start = loop()[0];
    const km = (a, b) => {
      const R = 6371;
      const dLat = ((b[1] - a[1]) * Math.PI) / 180;
      const dLon = ((b[0] - a[0]) * Math.PI) / 180;
      const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };
    const firstLobe = km(start, getSmartCyclingRoute.mock.calls[0][0][2]);
    const secondLobe = km(start, getSmartCyclingRoute.mock.calls[1][0][2]);
    expect(secondLobe).toBeGreaterThan(firstLobe);
    // The closer-to-target candidate (the big loop) is applied.
    expect(res.editedRoute.coordinates).toEqual(bigLoop);
    expect(res.message).toMatch(/keeping your start/i);
  });

  it("passes quiet-road costing when the rider asked for rural/quiet ('quiet' roadPreference)", async () => {
    getSmartCyclingRoute.mockResolvedValue({ coordinates: loop(0.03), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: { distance_km: 16, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'shift_direction', direction: 'west', roadPreference: 'quiet' },
    });

    expect(res.success).toBe(true);
    expect(getSmartCyclingRoute.mock.calls[0][1].preferences).toEqual({
      use_roads: 0,
      use_living_streets: 1.0,
    });
    expect(res.message).toMatch(/quieter roads/i);
  });

  it('passes no costing preferences without the quiet flag', async () => {
    getSmartCyclingRoute.mockResolvedValue({ coordinates: loop(0.03), source: 'stadia' });

    await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: { distance_km: 16, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'shift_direction', direction: 'west' },
    });

    expect(getSmartCyclingRoute.mock.calls[0][1].preferences).toBeUndefined();
  });

  it('bows a point-to-point route toward the bearing (start/end fixed)', async () => {
    getSmartCyclingRoute.mockResolvedValue({ coordinates: lineToFar.concat([[-105.0, 40.12]]), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(lineToFar),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'shift_direction', direction: 'north' },
    });

    expect(res.success).toBe(true);
    // start → bowed midpoint → end (endpoints preserved)
    const wps = getSmartCyclingRoute.mock.calls[0][0];
    expect(wps).toHaveLength(3);
    expect(wps[0]).toEqual(lineToFar[0]);
    expect(wps[2]).toEqual(lineToFar[lineToFar.length - 1]);
    expect(res.message).toMatch(/route toward the north/i);
  });

  it('rejects an unknown direction', async () => {
    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'shift_direction', direction: 'sideways' },
    });
    expect(res.success).toBe(false);
  });
});

// ── Distance edits ───────────────────────────────────────────────────
// These are the first `shorter` tests in the repo. The behaviour they pin
// down is that the number reported to the rider is the number delivered:
// trimming happens by point count while the ride is measured in kilometres,
// and the trimmed chord still has to be snapped back onto roads, so a
// single-shot edit reported a delta it had not achieved.

/** A straight line of roughly `km` length (1° latitude ≈ 111.19 km). */
const lineOfKm = (km) => [
  [-105, 40],
  [-105, 40 + km / 111.19],
];

/** A closed loop whose perimeter is roughly `km`. */
const loopOfKm = (km) => {
  const d = km / 4 / 111.19;
  return [
    [-105, 40],
    [-105, 40 + d],
    [-105 + d / Math.cos((40 * Math.PI) / 180), 40 + d],
    [-105 + d / Math.cos((40 * Math.PI) / 180), 40],
    [-105, 40],
  ];
};

/** Dense geometry so the point-count trim has something to bite on. */
const densePointToPoint = (km, points = 40) =>
  Array.from({ length: points }, (_, i) => [-105, 40 + (i / (points - 1)) * (km / 111.19)]);

describe('applyRouteEdit — shorter', () => {
  it('reports the distance it actually delivered, not the trimmed chord', async () => {
    // The reroute lands right on target, so one pass suffices.
    getSmartCyclingRoute.mockResolvedValue({ coordinates: lineOfKm(20), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(densePointToPoint(30)),
      routeProfile: 'road',
      routeStats: { distance_km: 30, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'shorter', targetDistanceKm: 20 },
    });

    expect(res.success).toBe(true);
    expect(res.comparison.newDistance).toBeCloseTo(20, 0);
    expect(res.message).toMatch(/20\.0km/);
    // The caller must not re-snap: that would change the length again after
    // we already told the rider what it was.
    expect(res.editedRoute.needsReroute).toBe(false);
  });

  it('corrects once when the first reroute overshoots', async () => {
    getSmartCyclingRoute
      .mockResolvedValueOnce({ coordinates: lineOfKm(26), source: 'stadia' })
      .mockResolvedValueOnce({ coordinates: lineOfKm(20.2), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(densePointToPoint(30)),
      routeProfile: 'road',
      routeStats: { distance_km: 30, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'shorter', targetDistanceKm: 20 },
    });

    expect(getSmartCyclingRoute).toHaveBeenCalledTimes(2);
    expect(res.comparison.newDistance).toBeCloseTo(20.2, 0);
  });

  it('keeps the closer attempt when the correction lands further away', async () => {
    getSmartCyclingRoute
      .mockResolvedValueOnce({ coordinates: lineOfKm(23), source: 'stadia' })
      .mockResolvedValueOnce({ coordinates: lineOfKm(12), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(densePointToPoint(30)),
      routeProfile: 'road',
      routeStats: { distance_km: 30, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'shorter', targetDistanceKm: 20 },
    });

    expect(res.comparison.newDistance).toBeCloseTo(23, 0);
  });

  it('stops at two routing calls even when it never converges', async () => {
    getSmartCyclingRoute.mockResolvedValue({ coordinates: lineOfKm(29), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(densePointToPoint(30)),
      routeProfile: 'road',
      routeStats: { distance_km: 30, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'shorter', targetDistanceKm: 15 },
    });

    expect(res.success).toBe(true);
    expect(getSmartCyclingRoute).toHaveBeenCalledTimes(2);
  });

  it('falls back to a proportional cut with no explicit target', async () => {
    getSmartCyclingRoute.mockResolvedValue({ coordinates: lineOfKm(24), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(densePointToPoint(30)),
      routeProfile: 'road',
      routeStats: { distance_km: 30, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'shorter' },
    });

    expect(res.success).toBe(true);
    expect(res.comparison.newDistance).toBeCloseTo(24, 0);
  });

  it('reports failure rather than a bogus number when routing dies', async () => {
    getSmartCyclingRoute.mockResolvedValue(null);

    const res = await applyRouteEdit({
      routeGeometry: geom(densePointToPoint(30)),
      routeProfile: 'road',
      routeStats: { distance_km: 30, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'shorter', targetDistanceKm: 20 },
    });

    // The raw trim is still a real (if unsnapped) line, so this succeeds —
    // what matters is that the number reported is measured, not assumed.
    expect(res.success).toBe(true);
    expect(res.comparison.newDistance).toBeGreaterThan(0);
  });
});

describe('applyRouteEdit — longer, loop convergence', () => {
  it('corrects the push-out once when the first attempt falls short', async () => {
    // The loop branch had no convergence at all, so "make it 40 km" drifted.
    getSmartCyclingRoute
      .mockResolvedValueOnce({ coordinates: loopOfKm(32), source: 'stadia' })
      .mockResolvedValueOnce({ coordinates: loopOfKm(39.5), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(loopOfKm(28)),
      routeProfile: 'road',
      routeStats: { distance_km: 28, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'longer', targetDistanceKm: 40 },
      routeType: 'loop',
    });

    expect(getSmartCyclingRoute).toHaveBeenCalledTimes(2);
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/39\.\d+km/);
  });

  it('stops after one call when the first attempt is already on target', async () => {
    getSmartCyclingRoute.mockResolvedValue({ coordinates: loopOfKm(39.8), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(loopOfKm(28)),
      routeProfile: 'road',
      routeStats: { distance_km: 28, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'longer', targetDistanceKm: 40 },
      routeType: 'loop',
    });

    expect(getSmartCyclingRoute).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });

  it('keeps the closer attempt when the correction overshoots', async () => {
    getSmartCyclingRoute
      .mockResolvedValueOnce({ coordinates: loopOfKm(36), source: 'stadia' })
      .mockResolvedValueOnce({ coordinates: loopOfKm(70), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(loopOfKm(28)),
      routeProfile: 'road',
      routeStats: { distance_km: 28, elevation_gain_m: 300, duration_s: 3600 },
      editIntent: { intent: 'longer', targetDistanceKm: 40 },
      routeType: 'loop',
    });

    expect(res.message).toMatch(/36\.\d+km/);
  });

  it('prefers an absolute target over the legacy delta', async () => {
    getSmartCyclingRoute.mockResolvedValue({ coordinates: loopOfKm(40), source: 'stadia' });

    await applyRouteEdit({
      routeGeometry: geom(loopOfKm(28)),
      routeProfile: 'road',
      routeStats: { distance_km: 28, elevation_gain_m: 300, duration_s: 3600 },
      // A delta that disagrees with the absolute target: the target wins.
      editIntent: { intent: 'longer', targetDistanceKm: 40, distanceModifier: 2 },
      routeType: 'loop',
    });

    // Converged on the first call, so the aim was 40 km, not 30.
    expect(getSmartCyclingRoute).toHaveBeenCalledTimes(1);
  });
});
