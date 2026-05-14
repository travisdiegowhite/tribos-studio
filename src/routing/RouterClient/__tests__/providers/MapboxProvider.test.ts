import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MapboxProvider } from '../../providers/MapboxProvider';
import type { RouteConstraint, RouteContext } from '../../types';

vi.mock('../../../../utils/directions', () => ({
  getCyclingDirections: vi.fn(),
  mapMatchRoute: vi.fn(),
}));

import {
  getCyclingDirections,
  mapMatchRoute,
} from '../../../../utils/directions';

const mockDirs = getCyclingDirections as unknown as ReturnType<typeof vi.fn>;
const mockMatch = mapMatchRoute as unknown as ReturnType<typeof vi.fn>;

const baseConstraint: RouteConstraint = {
  waypoints: [
    [-105.1, 40.0],
    [-105.0, 40.1],
  ],
  profile: 'road',
  shape: 'point_to_point',
};

const baseContext: RouteContext = {
  training_goal: 'endurance',
  mapbox_token: 'mock-mapbox-token',
};

function fakeMapboxSuccess() {
  const coords: [number, number][] = Array.from({ length: 11 }, (_, i) => [
    -105.1 + i * 0.01,
    40.0 + i * 0.01,
  ]);
  return {
    coordinates: coords,
    distance: 12_000, // legacy Mapbox: bare 'distance' in meters
    duration: 1800,
    confidence: 0.9,
    profile: 'cycling',
  };
}

describe('MapboxProvider', () => {
  let provider: MapboxProvider;

  beforeEach(() => {
    provider = new MapboxProvider();
    mockDirs.mockReset();
    mockMatch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('supports', () => {
    it('supports all profiles (best-effort gravel)', () => {
      expect(provider.supports('road')).toBe(true);
      expect(provider.supports('gravel')).toBe(true);
      expect(provider.supports('mtb')).toBe(true);
      expect(provider.supports('commute')).toBe(true);
    });
  });

  describe('solve', () => {
    it('calls getCyclingDirections with the cycling profile', async () => {
      mockDirs.mockResolvedValue(fakeMapboxSuccess());
      await provider.solve(baseConstraint, baseContext);
      expect(mockDirs).toHaveBeenCalledTimes(1);
      expect(mockDirs.mock.calls[0][1]).toBe('mock-mapbox-token');
      expect(mockDirs.mock.calls[0][2].profile).toBe('cycling');
    });

    it('returns http_error when token is missing', async () => {
      const result = await provider.solve(baseConstraint, {
        ...baseContext,
        mapbox_token: undefined,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('http_error');
    });

    it('translates distance/duration to km/s', async () => {
      mockDirs.mockResolvedValue(fakeMapboxSuccess());
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.stats.distance_km).toBeCloseTo(12, 3);
      expect(result.route.stats.duration_s).toBe(1800);
    });

    it('always reports elevation as 0 (Mapbox does not provide it)', async () => {
      mockDirs.mockResolvedValue(fakeMapboxSuccess());
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.stats.elevation_gain_m).toBe(0);
      expect(result.route.stats.elevation_loss_m).toBe(0);
    });

    it('flags gravel by passing surfaceType="gravel" to legacy', async () => {
      mockDirs.mockResolvedValue(fakeMapboxSuccess());
      await provider.solve({ ...baseConstraint, profile: 'gravel' }, baseContext);
      const prefs = mockDirs.mock.calls[0][2].preferences;
      expect(prefs.surfaceType).toBe('gravel');
    });

    it('returns no_route_found for short geometry', async () => {
      mockDirs.mockResolvedValue({
        coordinates: [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        distance: 0,
        duration: 0,
      });
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
    });
  });

  describe('connect', () => {
    it('calls mapMatchRoute', async () => {
      mockMatch.mockResolvedValue(fakeMapboxSuccess());
      await provider.connect(
        [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        baseContext,
      );
      expect(mockMatch).toHaveBeenCalledTimes(1);
    });

    it('rejects > 100 waypoints with invalid_response', async () => {
      const tooMany: [number, number][] = Array.from({ length: 101 }, (_, i) => [
        -105 + i * 0.0001,
        40,
      ]);
      const result = await provider.connect(tooMany, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('invalid_response');
      expect(mockMatch).not.toHaveBeenCalled();
    });

    it('returns http_error when token missing', async () => {
      const result = await provider.connect(
        [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        { ...baseContext, mapbox_token: undefined },
      );
      expect(result.ok).toBe(false);
    });
  });
});
