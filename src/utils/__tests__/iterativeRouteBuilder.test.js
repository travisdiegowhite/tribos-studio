import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the routing/naming/optimizer collaborators so the builder's geometry
// math runs against a deterministic straight-line router.
const getSmartCyclingRoute = vi.fn();
vi.mock('../smartCyclingRouter', () => ({
  getSmartCyclingRoute: (...a) => getSmartCyclingRoute(...a),
}));
vi.mock('../directions', () => ({
  fetchElevationProfile: vi.fn(),
  calculateElevationStats: vi.fn(),
}));
vi.mock('../routeNaming', () => ({
  generateSmartRouteName: ({ direction }) => `${direction} test route`,
}));
vi.mock('../routeOptimizer', () => ({
  optimizeLoopRoute: (coords) => coords,
}));

import {
  generateIterativeRoute,
  resolveBearing,
  getDirectionName,
} from '../iterativeRouteBuilder';

/** Bearing between two [lng, lat] points (matches the builder's math). */
function bearingBetween(start, end) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLon = toRad(end[0] - start[0]);
  const y = Math.sin(dLon) * Math.cos(toRad(end[1]));
  const x =
    Math.cos(toRad(start[1])) * Math.sin(toRad(end[1])) -
    Math.sin(toRad(start[1])) * Math.cos(toRad(end[1])) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angularDiff(a, b) {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** Straight-line mock router: returns ~20 points from start to end. */
function mockStraightLineRouter() {
  getSmartCyclingRoute.mockImplementation(async ([start, end]) => {
    const coords = Array.from({ length: 20 }, (_, i) => {
      const t = i / 19;
      return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    });
    // Rough planar distance in meters — only consistency matters here.
    const dx = (end[0] - start[0]) * 111000 * Math.cos((start[1] * Math.PI) / 180);
    const dy = (end[1] - start[1]) * 111000;
    return {
      coordinates: coords,
      distance: Math.sqrt(dx * dx + dy * dy),
      duration: 600,
      elevationGain: 25,
      source: 'mock',
    };
  });
}

beforeEach(() => {
  getSmartCyclingRoute.mockReset();
});

describe('resolveBearing', () => {
  it('maps single compass words and abbreviations', () => {
    expect(resolveBearing('northeast')).toBe(45);
    expect(resolveBearing('NE')).toBe(45);
    expect(resolveBearing('West')).toBe(270);
  });

  it('vector-averages compound phrases', () => {
    expect(resolveBearing('east and north')).toBe(45);
    expect(resolveBearing('north and west')).toBe(315);
    expect(resolveBearing('out west then south')).toBe(225);
  });

  it('tolerates dropped letters in connecting words ("east an north")', () => {
    expect(resolveBearing('east an north')).toBe(45);
  });

  it('ignores non-direction words ("heading west")', () => {
    expect(resolveBearing('heading west')).toBe(270);
  });

  it('matches direction words with trailing noise and truncations', () => {
    expect(resolveBearing('northeasterly')).toBe(45);
    expect(resolveBearing('southwes')).toBe(225);
  });

  it('passes numeric bearings through normalized', () => {
    expect(resolveBearing('135')).toBe(135);
    expect(resolveBearing(450)).toBe(90);
    expect(resolveBearing('-90')).toBe(270);
  });

  it('returns null for contradictory directions whose vectors cancel', () => {
    expect(resolveBearing('north and south')).toBeNull();
    expect(resolveBearing('east and west')).toBeNull();
  });

  it('returns null for garbage and empty input', () => {
    expect(resolveBearing('around the lake')).toBeNull();
    expect(resolveBearing('')).toBeNull();
    expect(resolveBearing(null)).toBeNull();
    expect(resolveBearing(undefined)).toBeNull();
  });
});

describe('getDirectionName', () => {
  it('names the eight compass sectors', () => {
    expect(getDirectionName(0)).toBe('North');
    expect(getDirectionName(45)).toBe('Northeast');
    expect(getDirectionName(180)).toBe('South');
    expect(getDirectionName(350)).toBe('North');
  });
});

describe('generateIterativeRoute — loop orientation', () => {
  const START = [-105, 40];

  async function quarterBearingsFor(direction, loopOrientation) {
    mockStraightLineRouter();
    const route = await generateIterativeRoute({
      startLocation: START,
      targetDistanceKm: 40,
      routeType: 'loop',
      direction,
      loopOrientation,
      trainingGoal: 'endurance',
    });
    expect(route).toBeTruthy();
    // First three quarters route start→target; the 4th closes the loop.
    return getSmartCyclingRoute.mock.calls
      .slice(0, 3)
      .map(([waypoints]) => bearingBetween(waypoints[0], waypoints[1]));
  }

  it('centers a clockwise loop on the requested bearing (first segment C−45)', async () => {
    const [q1, q2, q3] = await quarterBearingsFor('northeast', 'cw');
    // C = 45 → quarters head 0, 90, 180.
    expect(angularDiff(q1, 0)).toBeLessThan(5);
    expect(angularDiff(q2, 90)).toBeLessThan(5);
    expect(angularDiff(q3, 180)).toBeLessThan(5);
  });

  it('centers a counterclockwise loop on the requested bearing (first segment C+45)', async () => {
    const [q1, q2, q3] = await quarterBearingsFor('northeast', 'ccw');
    // C = 45 → quarters head 90, 0, 270.
    expect(angularDiff(q1, 90)).toBeLessThan(5);
    expect(angularDiff(q2, 0)).toBeLessThan(5);
    expect(angularDiff(q3, 270)).toBeLessThan(5);
  });

  it('honors compound directions ("east and north" loops span E + N quarters)', async () => {
    const [q1, q2] = await quarterBearingsFor('east and north', 'cw');
    expect(angularDiff(q1, 0)).toBeLessThan(5);
    expect(angularDiff(q2, 90)).toBeLessThan(5);
  });

  it('never picks an arbitrary bearing when direction text resolves', async () => {
    // Generate the same northeast loop several times — the first-quarter
    // bearing must be stable (≈0° for cw), proving the random fallback
    // is not consulted for parseable direction text.
    for (let i = 0; i < 3; i++) {
      getSmartCyclingRoute.mockReset();
      const [q1] = await quarterBearingsFor('east and north', 'cw');
      expect(angularDiff(q1, 0)).toBeLessThan(5);
    }
  });

  it('labels the route by the requested direction, not the first segment', async () => {
    mockStraightLineRouter();
    const route = await generateIterativeRoute({
      startLocation: START,
      targetDistanceKm: 40,
      routeType: 'loop',
      direction: 'east and north',
      loopOrientation: 'cw',
      trainingGoal: 'endurance',
    });
    expect(route.requestedBearing).toBe(45);
    expect(route.directionLabel).toBe('Northeast');
    expect(route.description).toContain('heading Northeast');
  });
});

describe('generateIterativeRoute — out-and-back direction', () => {
  it('heads straight along the requested bearing (no −45 offset)', async () => {
    mockStraightLineRouter();
    await generateIterativeRoute({
      startLocation: [-105, 40],
      targetDistanceKm: 30,
      routeType: 'out_and_back',
      direction: 'northeast',
      trainingGoal: 'endurance',
    });
    const [waypoints] = getSmartCyclingRoute.mock.calls[0];
    const outbound = bearingBetween(waypoints[0], waypoints[1]);
    expect(angularDiff(outbound, 45)).toBeLessThan(5);
  });
});
