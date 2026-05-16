import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StadiaProvider } from '../../providers/StadiaProvider';
import type { RouteConstraint, RouteContext } from '../../types';

// Mock the legacy module. The provider adapter must NOT re-implement
// Stadia routing logic — these tests verify the adapter calls the
// legacy module correctly and translates its output.
vi.mock('../../../../utils/stadiaMapsRouter', () => ({
  getStadiaMapsRoute: vi.fn(),
  isStadiaMapsAvailable: vi.fn(() => true),
}));

import {
  getStadiaMapsRoute,
  isStadiaMapsAvailable,
} from '../../../../utils/stadiaMapsRouter';

const mockGet = getStadiaMapsRoute as unknown as ReturnType<typeof vi.fn>;
const mockAvail = isStadiaMapsAvailable as unknown as ReturnType<typeof vi.fn>;

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
};

function fakeStadiaSuccess(overrides: Partial<{ distance_m: number; duration_s: number; elevationGain: number }> = {}) {
  // 11 coordinates so it passes the >10 validity check.
  const coords: [number, number][] = Array.from({ length: 11 }, (_, i) => [
    -105.1 + i * 0.01,
    40.0 + i * 0.01,
  ]);
  return {
    coordinates: coords,
    distance_m: overrides.distance_m ?? 12_000,
    duration_s: overrides.duration_s ?? 1800,
    elevationGain: overrides.elevationGain ?? 120,
    elevationLoss: 80,
    confidence: 1.0,
    source: 'stadia_maps',
    profile: 'road',
  };
}

describe('StadiaProvider', () => {
  let provider: StadiaProvider;

  beforeEach(() => {
    provider = new StadiaProvider();
    mockGet.mockReset();
    mockAvail.mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('supports', () => {
    it('supports all four canonical profiles', () => {
      expect(provider.supports('road')).toBe(true);
      expect(provider.supports('gravel')).toBe(true);
      expect(provider.supports('mtb')).toBe(true);
      expect(provider.supports('commute')).toBe(true);
    });
  });

  describe('solve — success', () => {
    it('translates a successful response into a RouteSnapshot with km distance', async () => {
      mockGet.mockResolvedValue(fakeStadiaSuccess({ distance_m: 12_345 }));
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.stats.distance_km).toBeCloseTo(12.345, 3);
      expect(result.route.stats.duration_s).toBe(1800);
      expect(result.route.stats.elevation_gain_m).toBe(120);
      expect(result.route.stats.elevation_loss_m).toBe(80);
      expect(result.route.geometry.length).toBe(11);
      expect(result.route.waypoints).toEqual([
        { coordinate: [-105.1, 40.0] },
        { coordinate: [-105.0, 40.1] },
      ]);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('translates mtb profile to legacy mountain', async () => {
      mockGet.mockResolvedValue(fakeStadiaSuccess());
      await provider.solve({ ...baseConstraint, profile: 'mtb' }, baseContext);
      expect(mockGet).toHaveBeenCalledTimes(1);
      const callArg = mockGet.mock.calls[0][1];
      expect(callArg.profile).toBe('mountain');
    });

    it('translates commute profile to legacy commuting', async () => {
      mockGet.mockResolvedValue(fakeStadiaSuccess());
      await provider.solve({ ...baseConstraint, profile: 'commute' }, baseContext);
      const callArg = mockGet.mock.calls[0][1];
      expect(callArg.profile).toBe('commuting');
    });

    it('passes through training_goal from context', async () => {
      mockGet.mockResolvedValue(fakeStadiaSuccess());
      await provider.solve(baseConstraint, { ...baseContext, training_goal: 'intervals' });
      expect(mockGet.mock.calls[0][1].trainingGoal).toBe('intervals');
    });

    it('passes user_speed_kph as userSpeed', async () => {
      mockGet.mockResolvedValue(fakeStadiaSuccess());
      await provider.solve(baseConstraint, { ...baseContext, user_speed_kph: 28 });
      expect(mockGet.mock.calls[0][1].userSpeed).toBe(28);
    });

    it('translates traffic_preference="low" into legacy trafficTolerance="low"', async () => {
      mockGet.mockResolvedValue(fakeStadiaSuccess());
      await provider.solve(
        { ...baseConstraint, traffic_preference: 'low' },
        baseContext,
      );
      const prefs = mockGet.mock.calls[0][1].preferences;
      expect(prefs.routingPreferences.trafficTolerance).toBe('low');
    });

    it('translates traffic_preference="minimal" into trafficTolerance="low" + avoidTraffic="high"', async () => {
      mockGet.mockResolvedValue(fakeStadiaSuccess());
      await provider.solve(
        { ...baseConstraint, traffic_preference: 'minimal' },
        baseContext,
      );
      const prefs = mockGet.mock.calls[0][1].preferences;
      expect(prefs.routingPreferences.trafficTolerance).toBe('low');
      expect(prefs.avoidTraffic).toBe('high');
    });
  });

  describe('solve — failure cases', () => {
    it('returns no_route_found when the legacy module returns null', async () => {
      mockGet.mockResolvedValue(null);
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('no_route_found');
    });

    it('returns no_route_found when geometry has ≤10 points', async () => {
      mockGet.mockResolvedValue({
        ...fakeStadiaSuccess(),
        coordinates: Array.from({ length: 5 }, (_, i) => [-105 - i * 0.01, 40]),
      });
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('no_route_found');
    });

    it('returns http_error when key is missing', async () => {
      mockAvail.mockReturnValue(false);
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('http_error');
    });

    it('returns http_error when legacy throws a Stadia 4xx', async () => {
      mockGet.mockRejectedValue(new Error('Stadia Maps API error: 400'));
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('http_error');
      if (result.reason.kind !== 'http_error') return;
      expect(result.reason.status).toBe(400);
    });

    it('returns timeout when legacy throws an AbortError', async () => {
      const err = new Error('Request aborted');
      (err as { name?: string }).name = 'AbortError';
      mockGet.mockRejectedValue(err);
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('timeout');
    });

    it('returns no_route_found when legacy throws "No route found"', async () => {
      mockGet.mockRejectedValue(new Error('No route found between waypoints'));
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('no_route_found');
    });

    it('records duration_ms even on failure', async () => {
      mockGet.mockResolvedValue(null);
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('connect', () => {
    it('calls legacy with the road profile and null preferences', async () => {
      mockGet.mockResolvedValue(fakeStadiaSuccess());
      await provider.connect(
        [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        baseContext,
      );
      const opts = mockGet.mock.calls[0][1];
      expect(opts.profile).toBe('road');
      expect(opts.preferences).toBeNull();
    });

    it('does not pass training_goal layering', async () => {
      mockGet.mockResolvedValue(fakeStadiaSuccess());
      await provider.connect(
        [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        { ...baseContext, training_goal: 'intervals' },
      );
      // connect uses endurance default (no training-specific costing).
      const opts = mockGet.mock.calls[0][1];
      expect(opts.trainingGoal).toBe('endurance');
    });

    it('returns http_error when key missing', async () => {
      mockAvail.mockReturnValue(false);
      const result = await provider.connect(
        [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        baseContext,
      );
      expect(result.ok).toBe(false);
    });
  });
});
