import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../stadiaMapsRouter', () => ({
  getStadiaMapsRoute: vi.fn(),
  isStadiaMapsAvailable: vi.fn(() => true),
}));
vi.mock('../brouter', () => ({
  getBRouterDirections: vi.fn(),
  selectBRouterProfile: vi.fn(),
  BROUTER_PROFILES: { GRAVEL: 'gravel', MTB: 'mtb' },
}));
vi.mock('../routeAlternates', () => ({
  gatherCandidates: vi.fn(),
  pickCalmest: vi.fn(),
}));

import { computeRunRoute } from '../smartRunningRouter';
import {
  getSmartCyclingRoute as getSmartCyclingRouteRaw,
  clearSmartRouteCache,
} from '../smartCyclingRouter';
import { getStadiaMapsRoute, isStadiaMapsAvailable } from '../stadiaMapsRouter';
import { getBRouterDirections } from '../brouter';
import { gatherCandidates } from '../routeAlternates';

const getSmartCyclingRoute = getSmartCyclingRouteRaw as unknown as (
  waypoints: [number, number][],
  options?: Record<string, unknown>,
) => Promise<{ source?: string; profile?: string; coordinates: [number, number][] } | null>;
const runRoute = computeRunRoute as unknown as (
  waypoints: [number, number][],
  options?: Record<string, unknown>,
) => Promise<{
  source: string;
  profile: string;
  coordinates: [number, number][];
  distance_m: number;
  duration_s: number;
  distance: number;
  alternates: unknown[];
} | null>;

const mockStadia = vi.mocked(getStadiaMapsRoute);
const mockAvailable = vi.mocked(isStadiaMapsAvailable);

const WAYPOINTS: [number, number][] = [
  [-105.27, 40.01],
  [-105.28, 40.02],
];
const LINE: [number, number][] = Array.from({ length: 12 }, (_, i) => [-105.27 - i * 0.001, 40.01 + i * 0.001]);

const fetchMock = vi.fn();

beforeEach(() => {
  mockStadia.mockReset();
  mockAvailable.mockReturnValue(true);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  clearSmartRouteCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('computeRunRoute', () => {
  it('uses Stadia pedestrian first, with the run profile and running speed', async () => {
    mockStadia.mockResolvedValue({ coordinates: LINE, distance_m: 1500, duration_s: 540 } as never);
    const route = await runRoute(WAYPOINTS, { profile: 'trail_run', userSpeed: 9, mapboxToken: 't' });
    expect(route?.source).toBe('stadia_pedestrian');
    expect(route?.profile).toBe('trail_run');
    expect(route?.distance_m).toBe(1500);
    expect(route?.distance).toBe(1500);
    expect(route?.alternates).toEqual([]);
    expect(mockStadia).toHaveBeenCalledWith(WAYPOINTS, expect.objectContaining({ profile: 'trail_run', userSpeed: 9 }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to Mapbox walking, never cycling or driving', async () => {
    mockStadia.mockRejectedValue(new Error('down'));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ geometry: { coordinates: LINE }, distance: 1400, duration: 1000 }] }),
    });
    const route = await runRoute(WAYPOINTS, { profile: 'run', mapboxToken: 'tok' });
    expect(route?.source).toBe('mapbox_walking');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/mapbox/walking/');
    expect(url).not.toContain('/cycling/');
    expect(url).not.toContain('/driving');
    // Canonical [lng, lat] passes through untouched.
    expect(route?.coordinates[0]).toEqual(LINE[0]);
  });

  it('returns null when every provider fails', async () => {
    mockAvailable.mockReturnValue(false);
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await runRoute(WAYPOINTS, { profile: 'run', mapboxToken: 'tok' })).toBeNull();
  });

  it('coerces a non-run profile to run', async () => {
    mockStadia.mockResolvedValue({ coordinates: LINE, distance_m: 1500, duration_s: 540 } as never);
    const route = await runRoute(WAYPOINTS, { profile: 'road' });
    expect(route?.profile).toBe('run');
  });
});

describe('getSmartCyclingRoute delegates run profiles', () => {
  it('a run never calls BRouter or the bike alternates', async () => {
    mockStadia.mockResolvedValue({ coordinates: LINE, distance_m: 1500, duration_s: 540 } as never);
    const route = await getSmartCyclingRoute(WAYPOINTS, { profile: 'run', alternates: true });
    expect(route?.source).toBe('stadia_pedestrian');
    expect(getBRouterDirections).not.toHaveBeenCalled();
    expect(gatherCandidates).not.toHaveBeenCalled();
  });

  it('caches a run apart from a ride on the same waypoints', async () => {
    mockStadia.mockResolvedValue({ coordinates: LINE, distance_m: 1500, duration_s: 540 } as never);
    await getSmartCyclingRoute(WAYPOINTS, { profile: 'run' });
    mockStadia.mockResolvedValue({ coordinates: LINE, distance_m: 2000, duration_s: 300 } as never);
    const ride = await getSmartCyclingRoute(WAYPOINTS, { profile: 'road' });
    expect(ride?.source).not.toBe('stadia_pedestrian');
    const rideProfileCalls = mockStadia.mock.calls.filter(([, o]) => (o as { profile?: string }).profile === 'road');
    expect(rideProfileCalls.length).toBeGreaterThan(0);
  });
});
