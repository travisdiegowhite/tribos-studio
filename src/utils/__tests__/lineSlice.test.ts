import { describe, it, expect } from 'vitest';
import { sliceLineByDistance } from '../lineSlice';
import { haversineMeters } from '../distanceUnits';

// Three points due east along the equator, ~1112 m apart.
const LINE: [number, number][] = [
  [0, 0],
  [0.01, 0],
  [0.02, 0],
];
const SEG_M = haversineMeters(0, 0, 0, 0.01);

describe('sliceLineByDistance', () => {
  it('returns the stretch between two distances, interpolating the cut points', () => {
    const part = sliceLineByDistance(LINE, SEG_M / 2, SEG_M * 1.5);
    expect(part[0][0]).toBeCloseTo(0.005, 6);
    expect(part[part.length - 1][0]).toBeCloseTo(0.015, 6);
    expect(part).toContainEqual([0.01, 0]);
  });

  it('clamps to the line and tolerates reversed bounds', () => {
    const part = sliceLineByDistance(LINE, SEG_M * 10, -5);
    expect(part[0]).toEqual([0, 0]);
    expect(part[part.length - 1][0]).toBeCloseTo(0.02, 6);
  });

  it('is empty for a degenerate line', () => {
    expect(sliceLineByDistance([[0, 0]], 0, 10)).toEqual([]);
  });
});
