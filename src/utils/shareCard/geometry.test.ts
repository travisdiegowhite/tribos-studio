import { describe, expect, it } from 'vitest';
import {
  decodePolyline,
  downsampleCoords,
  encodePolyline,
  trimPolylineEnds,
  type LngLat,
} from './geometry';

/** Build a straight north-south line of points `spacing_m` apart. */
function straightLine(points: number, spacing_m: number): LngLat[] {
  const degPerMeterLat = 1 / 111320;
  const coords: LngLat[] = [];
  for (let i = 0; i < points; i++) {
    coords.push([-105.27, 40.0 + i * spacing_m * degPerMeterLat]);
  }
  return coords;
}

describe('trimPolylineEnds', () => {
  it('removes ~trim_m meters of points from each end', () => {
    const coords = straightLine(51, 100); // 5 km route
    const trimmed = trimPolylineEnds(coords, 250);
    // First point with cumulative distance >= 250 m is index 3 (300 m).
    expect(trimmed.length).toBe(45);
    expect(trimmed[0]).toEqual(coords[3]);
    expect(trimmed[trimmed.length - 1]).toEqual(coords[47]);
  });

  it('clamps an oversized trim so the route never collapses', () => {
    const coords = straightLine(51, 100); // 5 km route
    const trimmed = trimPolylineEnds(coords, 10_000);
    expect(trimmed.length).toBeGreaterThanOrEqual(2);
    // Both ends must have moved inward.
    expect(trimmed[0]).not.toEqual(coords[0]);
    expect(trimmed[trimmed.length - 1]).not.toEqual(coords[coords.length - 1]);
  });

  it('returns short routes unchanged (below the 500 m survival floor)', () => {
    const coords = straightLine(4, 100); // 300 m route
    expect(trimPolylineEnds(coords, 200)).toEqual(coords);
  });

  it('returns input unchanged for zero/negative trim and degenerate inputs', () => {
    const coords = straightLine(10, 100);
    expect(trimPolylineEnds(coords, 0)).toEqual(coords);
    expect(trimPolylineEnds(coords, -5)).toEqual(coords);
    expect(trimPolylineEnds([], 100)).toEqual([]);
    const single: LngLat[] = [[-105.27, 40.0]];
    expect(trimPolylineEnds(single, 100)).toEqual(single);
  });
});

describe('downsampleCoords', () => {
  it('respects the point budget and preserves endpoints', () => {
    const coords = straightLine(1000, 10);
    const sampled = downsampleCoords(coords, 60);
    expect(sampled.length).toBe(60);
    expect(sampled[0]).toEqual(coords[0]);
    expect(sampled[sampled.length - 1]).toEqual(coords[coords.length - 1]);
  });

  it('returns input unchanged when already within budget', () => {
    const coords = straightLine(30, 10);
    expect(downsampleCoords(coords, 60)).toEqual(coords);
  });
});

describe('encodePolyline', () => {
  it('round-trips through the canonical decoder within 1e-5', () => {
    const coords: LngLat[] = [
      [-105.2705, 40.015],
      [-105.2691, 40.0187],
      [-105.251, 40.0274],
      [-105.2438, 40.0399],
    ];
    const encoded = encodePolyline(coords);
    expect(encoded).toBeTruthy();
    const decoded = decodePolyline(encoded as string);
    expect(decoded.length).toBe(coords.length);
    decoded.forEach(([lng, lat], i) => {
      expect(Math.abs(lng - coords[i][0])).toBeLessThan(1e-5);
      expect(Math.abs(lat - coords[i][1])).toBeLessThan(1e-5);
    });
  });

  it('returns null for fewer than 2 points', () => {
    expect(encodePolyline([])).toBeNull();
    expect(encodePolyline([[-105.27, 40.0]])).toBeNull();
  });
});
