import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../stadiaMapsRouter', () => ({
  getStadiaMapsRoute: vi.fn(),
  isStadiaMapsAvailable: vi.fn(() => true),
}));
vi.mock('../brouter', () => ({
  getBRouterDirections: vi.fn(),
  selectBRouterProfile: vi.fn(),
  BROUTER_PROFILES: { GRAVEL: 'gravel', MTB: 'mtb' },
}));
const gatherCandidates = vi.fn();
const pickCalmest = vi.fn();
vi.mock('../routeAlternates', () => ({
  gatherCandidates: (...a: unknown[]) => gatherCandidates(...a),
  pickCalmest: (...a: unknown[]) => pickCalmest(...a),
}));

import {
  getSmartCyclingRoute as getSmartCyclingRouteRaw,
  clearSmartRouteCache,
} from '../smartCyclingRouter';
import { getStadiaMapsRoute } from '../stadiaMapsRouter';

// The router is JSDoc-typed JS; loosen for test ergonomics.
const getSmartCyclingRoute = getSmartCyclingRouteRaw as unknown as (
  waypoints: [number, number][],
  options?: { profile?: string; trainingGoal?: string; alternates?: boolean; preferences?: unknown },
) => Promise<{
  coordinates: [number, number][];
  source?: string;
  alternate?: { chosen_index: number; source: string | null; extra_km: number };
  alternates?: unknown;
}>;

const mockStadia = vi.mocked(getStadiaMapsRoute);

const WAYPOINTS: [number, number][] = [
  [-105.27, 40.01],
  [-105.3, 40.05],
];

function fakeRoute() {
  return {
    coordinates: Array.from({ length: 20 }, (_, i) => [-105.27 - i * 0.001, 40.01 + i * 0.001]),
    distance_m: 5000,
    duration_s: 900,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSmartRouteCache();
  mockStadia.mockResolvedValue(fakeRoute() as never);
  gatherCandidates.mockReset();
  pickCalmest.mockReset();
});

describe('smartCyclingRouter cache', () => {
  it('serves an identical request from cache without re-hitting the provider', async () => {
    const first = await getSmartCyclingRoute(WAYPOINTS, { profile: 'road' });
    const second = await getSmartCyclingRoute(WAYPOINTS, { profile: 'road' });
    expect(mockStadia).toHaveBeenCalledTimes(1);
    expect(second.coordinates).toEqual(first.coordinates);
    // Fresh array each time — a caller appending must not poison the cache.
    expect(second.coordinates).not.toBe(first.coordinates);
  });

  it('dedupes concurrent identical requests into one provider call', async () => {
    const [a, b] = await Promise.all([
      getSmartCyclingRoute(WAYPOINTS, { profile: 'road' }),
      getSmartCyclingRoute(WAYPOINTS, { profile: 'road' }),
    ]);
    expect(mockStadia).toHaveBeenCalledTimes(1);
    expect(a.coordinates).toEqual(b.coordinates);
  });

  it('misses the cache when waypoints or options differ', async () => {
    await getSmartCyclingRoute(WAYPOINTS, { profile: 'road' });
    await getSmartCyclingRoute(WAYPOINTS, { profile: 'road', trainingGoal: 'hills' });
    await getSmartCyclingRoute(
      [
        [-106, 41],
        [-106.1, 41.1],
      ],
      { profile: 'road' },
    );
    expect(mockStadia).toHaveBeenCalledTimes(3);
  });
});

describe('smartCyclingRouter alternates re-rank', () => {
  const prefs = { trafficTolerance: 'low', routingPreferences: { trafficTolerance: 'low' } };

  it('is off by default: no gathering, no alternates on the result', async () => {
    mockStadia.mockResolvedValue({ ...fakeRoute(), alternates: [{ coordinates: [] }] } as never);
    const route = await getSmartCyclingRoute(WAYPOINTS, { profile: 'road', preferences: prefs });
    expect(gatherCandidates).not.toHaveBeenCalled();
    expect(route.alternate).toBeUndefined();
    expect(route.alternates).toBeUndefined();
    expect(mockStadia.mock.calls[0][1]).toMatchObject({ alternates: 0 });
  });

  it('with the flag: asks Stadia for alternates, gathers, and returns the calmest with metadata', async () => {
    const calmer = { coordinates: fakeRoute().coordinates.slice(0, 15), distance_m: 5400, source: 'brouter', profile: 'safety', stressSummary: { knownKm: 5 } };
    gatherCandidates.mockImplementation(async (_w: unknown, primary: { source: string }) => [primary, calmer]);
    pickCalmest.mockReturnValue({ index: 1, considered: 2, km_over_before: 2.1, km_over_after: 0.2, extra_km: 0.4 });
    const route = await getSmartCyclingRoute(WAYPOINTS, { profile: 'road', preferences: prefs, alternates: true });
    expect(mockStadia.mock.calls[0][1]).toMatchObject({ alternates: 2 });
    expect(gatherCandidates).toHaveBeenCalledWith(WAYPOINTS, expect.objectContaining({ source: 'stadia_maps' }), { tolerance: 'low' });
    expect(route.source).toBe('brouter');
    expect(route.alternate).toEqual({ chosen_index: 1, considered: 2, km_over_before: 2.1, km_over_after: 0.2, extra_km: 0.4, source: 'brouter' });
    expect(route.coordinates).toHaveLength(15);
  });

  it('keeps the primary when the pick stays at 0, and skips gathering for a direct rider', async () => {
    gatherCandidates.mockImplementation(async (_w: unknown, primary: unknown) => [primary]);
    pickCalmest.mockReturnValue({ index: 0, considered: 1, km_over_before: 1, km_over_after: 1, extra_km: 0 });
    const kept = await getSmartCyclingRoute(WAYPOINTS, { profile: 'road', preferences: prefs, alternates: true });
    expect(kept.source).toBe('stadia_maps');
    expect(kept.alternate?.chosen_index).toBe(0);

    clearSmartRouteCache();
    const direct = await getSmartCyclingRoute(WAYPOINTS, {
      profile: 'road',
      preferences: { trafficTolerance: 'high' },
      alternates: true,
    });
    expect(gatherCandidates).toHaveBeenCalledTimes(1);
    expect(direct.alternate).toBeUndefined();
  });

  it('the flag is part of the cache key', async () => {
    gatherCandidates.mockImplementation(async (_w: unknown, primary: unknown) => [primary]);
    pickCalmest.mockReturnValue({ index: 0, considered: 1, km_over_before: 0, km_over_after: 0, extra_km: 0 });
    await getSmartCyclingRoute(WAYPOINTS, { profile: 'road', preferences: prefs });
    await getSmartCyclingRoute(WAYPOINTS, { profile: 'road', preferences: prefs, alternates: true });
    expect(mockStadia).toHaveBeenCalledTimes(2);
  });
});
