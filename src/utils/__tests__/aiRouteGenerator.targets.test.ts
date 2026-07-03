import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../geocoding', () => ({
  geocodeWaypoint: vi.fn(),
}));

import { geocodeWaypoint } from '../geocoding';
import {
  hillsBiasForTarget,
  getTargetProximityScore,
  geocodeKeyRoads,
} from '../aiRouteGenerator';

const mockGeocode = vi.mocked(geocodeWaypoint as (n: string, p: [number, number]) => Promise<unknown>);

const START: [number, number] = [-105.27, 40.01];

beforeEach(() => {
  mockGeocode.mockReset();
});

describe('hillsBiasForTarget', () => {
  it('returns null without a usable target', () => {
    expect(hillsBiasForTarget(null, 40)).toBeNull();
    expect(hillsBiasForTarget(600, 0)).toBeNull();
    expect(hillsBiasForTarget(0, 40)).toBeNull();
  });

  it('maps gain-per-km bands to increasing use_hills', () => {
    expect(hillsBiasForTarget(100, 40)).toBe(0.15); // 2.5 m/km — flat
    expect(hillsBiasForTarget(300, 40)).toBe(0.35); // 7.5 m/km — rolling
    expect(hillsBiasForTarget(600, 40)).toBe(0.6); // 15 m/km — hilly
    expect(hillsBiasForTarget(1000, 40)).toBe(0.8); // 25 m/km
    expect(hillsBiasForTarget(1400, 40)).toBe(0.95); // 35 m/km — mountains
  });
});

describe('getTargetProximityScore', () => {
  it('is neutral with no target', () => {
    expect(getTargetProximityScore(42, null, 0.3)).toBe(0);
    expect(getTargetProximityScore(0, 40, 0.3)).toBe(0);
  });

  it('rewards on-target, decays with distance, punishes way-off', () => {
    expect(getTargetProximityScore(40, 40, 0.3)).toBe(0.3);
    expect(getTargetProximityScore(44, 40, 0.3)).toBe(0.3); // within 15%
    expect(getTargetProximityScore(50, 40, 0.3)).toBeCloseTo(0.12); // close band
    expect(getTargetProximityScore(60, 40, 0.3)).toBe(0); // meh band
    expect(getTargetProximityScore(90, 40, 0.3)).toBe(-0.3); // way off
    expect(getTargetProximityScore(10, 40, 0.3)).toBe(-0.3);
  });
});

describe('geocodeKeyRoads', () => {
  it('returns [] when Claude named nothing', async () => {
    expect(await geocodeKeyRoads([], START, 40)).toEqual([]);
    expect(await geocodeKeyRoads(undefined as never, START, 40)).toEqual([]);
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('keeps plausible vias and drops far/failed/crowded ones', async () => {
    mockGeocode
      // ~7km east — plausible
      .mockResolvedValueOnce({ coordinates: [-105.19, 40.01], name: 'Lee Hill Dr' })
      // geocoder miss
      .mockResolvedValueOnce(null)
      // ~200km away — rejected by radius (max = 40 * 0.6 = 24km)
      .mockResolvedValueOnce({ coordinates: [-103, 41], name: 'Far Rd' })
      // ~300m from the first via — rejected as crowded
      .mockResolvedValueOnce({ coordinates: [-105.187, 40.01], name: 'Lee Hill Spur' });

    const vias = await geocodeKeyRoads(
      ['Lee Hill Dr', 'Nowhere Ln', 'Far Rd', 'Lee Hill Spur'],
      START,
      40,
    );
    expect(vias).toEqual([[-105.19, 40.01]]);
  });

  it('caps at three vias', async () => {
    // Spread along the longitude axis, ~3km apart, all within radius.
    mockGeocode.mockImplementation(async (name: string) => {
      const i = ['A', 'B', 'C', 'D', 'E'].indexOf(name);
      return { coordinates: [-105.27 + 0.04 * (i + 1), 40.01], name };
    });
    const vias = await geocodeKeyRoads(['A', 'B', 'C', 'D', 'E'], START, 60);
    expect(vias).toHaveLength(3);
  });

  it('swallows geocoder throws', async () => {
    mockGeocode.mockRejectedValue(new Error('rate limited'));
    expect(await geocodeKeyRoads(['Anything'], START, 40)).toEqual([]);
  });
});
