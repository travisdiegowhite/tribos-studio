import { describe, it, expect } from 'vitest';
import { nearestInsertIndex } from '../lineInsert';
import type { Coordinate } from '../../../../types/geo';

// An 11-vertex dense line running east at lat 40. Waypoints sit on vertices
// 0, 5, and 10 — so a grab on the first half inserts at index 1, and a grab
// on the second half inserts at index 2.
const dense: Coordinate[] = Array.from({ length: 11 }, (_, i) => [-105 + i * 0.01, 40]);
const waypoints: Coordinate[] = [dense[0], dense[5], dense[10]];

describe('nearestInsertIndex', () => {
  it('inserts between the first pair when grabbing the first half', () => {
    expect(nearestInsertIndex(dense, waypoints, [-104.98, 40])).toBe(1); // ~vertex 2
  });

  it('inserts between the second pair when grabbing the second half', () => {
    expect(nearestInsertIndex(dense, waypoints, [-104.93, 40])).toBe(2); // ~vertex 7
  });

  it('clamps to a valid between-points index near the start', () => {
    expect(nearestInsertIndex(dense, waypoints, [-105.001, 40])).toBe(1);
  });

  it('clamps to a valid between-points index near the end', () => {
    expect(nearestInsertIndex(dense, waypoints, [-104.899, 40])).toBe(2);
  });

  it('falls back to append for degenerate input', () => {
    expect(nearestInsertIndex([], waypoints, [-105, 40])).toBe(waypoints.length);
    expect(nearestInsertIndex(dense, [dense[0]], [-105, 40])).toBe(1);
  });

  it('handles a 4-waypoint route — middle grab lands in the middle', () => {
    const wp4: Coordinate[] = [dense[0], dense[3], dense[7], dense[10]];
    // Grab near vertex 5 → after wp0 and wp1 (idx 0,3 ≤ 5), before wp2 (idx 7).
    expect(nearestInsertIndex(dense, wp4, [-104.95, 40])).toBe(2);
  });
});
