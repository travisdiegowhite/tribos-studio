import { describe, it, expect } from 'vitest';
import type { Coordinate } from '../../types/geo';
import { loopWaypoints, destinationPoint, rescaleRoadFactor, DEFAULT_ROAD_FACTOR } from '../loopWaypoints';
import { haversineKm } from '../distanceUnits';

const START: Coordinate = [-105.279, 40.0176];

function perimeterKm(pts: Coordinate[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += haversineKm(pts[i - 1][1], pts[i - 1][0], pts[i][1], pts[i][0]);
  return t;
}

describe('loopWaypoints', () => {
  it('starts and ends at the start', () => {
    const w = loopWaypoints(START, 48);
    expect(w[0]).toEqual(START);
    expect(w[w.length - 1]).toEqual(START);
    expect(w).toHaveLength(5);
  });

  it('polygon perimeter is target ÷ road factor', () => {
    for (const km of [24, 48, 80, 120]) {
      expect(perimeterKm(loopWaypoints(START, km))).toBeCloseTo(km / DEFAULT_ROAD_FACTOR, 0);
    }
  });

  it('is deterministic', () => {
    expect(loopWaypoints(START, 48, { bearingDeg: 90 })).toEqual(loopWaypoints(START, 48, { bearingDeg: 90 }));
  });

  it('puts the loop in the bearing direction', () => {
    const north = loopWaypoints(START, 48, { bearingDeg: 0 });
    expect(north.slice(1, -1).every((p) => p[1] > START[1] - 1e-9)).toBe(true);
    const east = loopWaypoints(START, 48, { bearingDeg: 90 });
    expect(east.slice(1, -1).every((p) => p[0] > START[0] - 1e-9)).toBe(true);
  });

  it('counter-clockwise reverses the vertex order', () => {
    const cw = loopWaypoints(START, 48, { clockwise: true });
    const ccw = loopWaypoints(START, 48, { clockwise: false });
    expect(ccw[1][0]).toBeCloseTo(cw[cw.length - 2][0], 6);
  });

  it('destinationPoint round-trips distance', () => {
    const p = destinationPoint(START, 10, 45);
    expect(haversineKm(START[1], START[0], p[1], p[0])).toBeCloseTo(10, 3);
  });
});

describe('rescaleRoadFactor', () => {
  it('grows the factor when the road came out long, clamped', () => {
    expect(rescaleRoadFactor(1.3, 50, 60)).toBeCloseTo(1.56, 2);
    expect(rescaleRoadFactor(1.3, 50, 500)).toBeCloseTo(1.3 * 1.6, 5);
    expect(rescaleRoadFactor(1.3, 50, 0)).toBe(1.3);
  });
});
