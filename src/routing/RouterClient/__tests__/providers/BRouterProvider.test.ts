import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BRouterProvider } from '../../providers/BRouterProvider';
import type { RouteConstraint, RouteContext } from '../../types';

vi.mock('../../../../utils/brouter', () => ({
  getBRouterDirections: vi.fn(),
  selectBRouterProfile: vi.fn((goal: string) => {
    // Mirror legacy selectBRouterProfile behavior for assertion clarity.
    if (goal === 'intervals' || goal === 'tempo') return 'fastbike';
    if (goal === 'hills') return 'mtb';
    if (goal === 'recovery') return 'safety';
    return 'trekking';
  }),
  BROUTER_PROFILES: {
    GRAVEL: 'gravel',
    TREKKING: 'trekking',
    FASTBIKE: 'fastbike',
    MTB: 'mtb',
    SAFETY: 'safety',
  },
}));

import { getBRouterDirections } from '../../../../utils/brouter';

const mockGet = getBRouterDirections as unknown as ReturnType<typeof vi.fn>;

const baseConstraint: RouteConstraint = {
  waypoints: [
    [-105.1, 40.0],
    [-105.0, 40.1],
  ],
  profile: 'road',
  shape: 'point_to_point',
};

const baseContext: RouteContext = { training_goal: 'endurance' };

function fakeBRouterSuccess() {
  const coords: [number, number][] = Array.from({ length: 11 }, (_, i) => [
    -105.1 + i * 0.01,
    40.0 + i * 0.01,
  ]);
  return {
    coordinates: coords,
    distance_m: 12_000,
    duration_s: 1800,
    elevationGain: 100,
    elevationLoss: 80,
    elevation: { ascent: 100, descent: 80 },
    profile: 'trekking',
  };
}

describe('BRouterProvider', () => {
  let provider: BRouterProvider;

  beforeEach(() => {
    provider = new BRouterProvider();
    mockGet.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('profile selection', () => {
    it('uses GRAVEL profile for gravel constraint', async () => {
      mockGet.mockResolvedValue(fakeBRouterSuccess());
      await provider.solve({ ...baseConstraint, profile: 'gravel' }, baseContext);
      expect(mockGet.mock.calls[0][1].profile).toBe('gravel');
    });

    it('uses MTB profile for mtb constraint', async () => {
      mockGet.mockResolvedValue(fakeBRouterSuccess());
      await provider.solve({ ...baseConstraint, profile: 'mtb' }, baseContext);
      expect(mockGet.mock.calls[0][1].profile).toBe('mtb');
    });

    it('uses selectBRouterProfile for road + training goal', async () => {
      mockGet.mockResolvedValue(fakeBRouterSuccess());
      await provider.solve(baseConstraint, { ...baseContext, training_goal: 'intervals' });
      expect(mockGet.mock.calls[0][1].profile).toBe('fastbike');
    });

    it('uses TREKKING profile for connect path', async () => {
      mockGet.mockResolvedValue(fakeBRouterSuccess());
      await provider.connect(
        [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        baseContext,
      );
      expect(mockGet.mock.calls[0][1].profile).toBe('trekking');
    });
  });

  describe('waypoint limit', () => {
    it('rejects ≥30 waypoints with invalid_response', async () => {
      const tooMany: [number, number][] = Array.from({ length: 30 }, (_, i) => [
        -105 + i * 0.001,
        40,
      ]);
      const result = await provider.solve(
        { ...baseConstraint, waypoints: tooMany },
        baseContext,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('invalid_response');
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('accepts 29 waypoints', async () => {
      mockGet.mockResolvedValue(fakeBRouterSuccess());
      const okWaypoints: [number, number][] = Array.from({ length: 29 }, (_, i) => [
        -105 + i * 0.001,
        40,
      ]);
      const result = await provider.solve(
        { ...baseConstraint, waypoints: okWaypoints },
        baseContext,
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('response translation', () => {
    it('produces a snapshot with km distance', async () => {
      mockGet.mockResolvedValue(fakeBRouterSuccess());
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.stats.distance_km).toBeCloseTo(12, 3);
      expect(result.route.stats.elevation_gain_m).toBe(100);
    });

    it('returns no_route_found when result is null', async () => {
      mockGet.mockResolvedValue(null);
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('no_route_found');
    });

    it('returns no_route_found when geometry too short', async () => {
      mockGet.mockResolvedValue({
        ...fakeBRouterSuccess(),
        coordinates: Array.from({ length: 5 }, (_, i) => [-105 - i * 0.01, 40]),
      });
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
    });

    it('returns network_error when legacy rejects', async () => {
      mockGet.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await provider.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('network_error');
    });
  });
});
