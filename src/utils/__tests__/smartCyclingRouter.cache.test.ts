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

import {
  getSmartCyclingRoute as getSmartCyclingRouteRaw,
  clearSmartRouteCache,
} from '../smartCyclingRouter';
import { getStadiaMapsRoute } from '../stadiaMapsRouter';

// The router is JSDoc-typed JS; loosen for test ergonomics.
const getSmartCyclingRoute = getSmartCyclingRouteRaw as unknown as (
  waypoints: [number, number][],
  options?: { profile?: string; trainingGoal?: string },
) => Promise<{ coordinates: [number, number][] }>;

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
