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
  getElevationData.mockResolvedValue([{ elevation: 1 }]);
  calculateElevationStats.mockReturnValue({ totalAscent: 500 });
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
      .mockReturnValueOnce({ totalAscent: 900 }) // stadia
      .mockReturnValueOnce({ totalAscent: 600 }) // brouter
      .mockReturnValue({ totalAscent: 900 }); // comparison

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
  it('regenerates a loop biased toward the bearing', async () => {
    getSmartCyclingRoute.mockResolvedValue({ coordinates: loop(0.03), source: 'stadia' });

    const res = await applyRouteEdit({
      routeGeometry: geom(loop()),
      routeProfile: 'road',
      routeStats: stats,
      editIntent: { intent: 'shift_direction', direction: 'west' },
    });

    expect(res.success).toBe(true);
    expect(getSmartCyclingRoute).toHaveBeenCalledTimes(1);
    // 5 waypoints: start, lobe-30, lobe, lobe+30, start
    expect(getSmartCyclingRoute.mock.calls[0][0]).toHaveLength(5);
    expect(res.message).toMatch(/toward the west/i);
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
