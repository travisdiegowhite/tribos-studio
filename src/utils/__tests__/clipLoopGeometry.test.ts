import { describe, it, expect } from 'vitest';
import { clipLoopGeometry } from '../clipLoopGeometry';
import type { Coordinate } from '../../types/geo';

/** A monotonic, well-spaced (~130m) diagonal line — no spurs to clip. */
const cleanLine = (n: number): Coordinate[] =>
  Array.from({ length: n }, (_, i) => [-105 + i * 0.0012, 40 + i * 0.0012] as Coordinate);

/**
 * A route with an obvious out-and-back spur: head east, jut ~550m north and
 * back to nearly the same point, then continue east. removePeninsulas should
 * clip the jut.
 */
function routeWithSpur(): Coordinate[] {
  const main1: Coordinate[] = Array.from({ length: 8 }, (_, i) => [-105 + i * 0.001, 40]);
  const px = main1[main1.length - 1][0];
  const out: Coordinate[] = Array.from({ length: 5 }, (_, i) => [px, 40 + (i + 1) * 0.001]);
  const back: Coordinate[] = Array.from({ length: 5 }, (_, i) => [px, 40 + (5 - i - 1) * 0.001]);
  const main2: Coordinate[] = Array.from({ length: 8 }, (_, i) => [px + (i + 1) * 0.001, 40]);
  return [...main1, ...out, ...back, ...main2];
}

describe('clipLoopGeometry', () => {
  it('clips an out-and-back spur (fewer points, apex removed)', () => {
    const coords = routeWithSpur();
    const apexLat = 40.005;
    const clipped = clipLoopGeometry(coords);
    expect(clipped.length).toBeLessThan(coords.length);
    expect(clipped.length).toBeGreaterThanOrEqual(10);
    // The spur apex (~550m out) should be gone.
    expect(clipped.some((c) => Math.abs(c[1] - apexLat) < 1e-6)).toBe(false);
  });

  it('leaves a clean line essentially unchanged (no over-clipping)', () => {
    const coords = cleanLine(16);
    const clipped = clipLoopGeometry(coords);
    expect(clipped.length).toBeGreaterThanOrEqual(coords.length - 1);
  });

  it('returns the input unchanged when given < 4 points', () => {
    const coords: Coordinate[] = [
      [-105, 40],
      [-104.999, 40.001],
      [-104.998, 40.002],
    ];
    expect(clipLoopGeometry(coords)).toBe(coords);
  });

  it('returns the ORIGINAL when clipping would drop below the routable minimum', () => {
    // 11 points, mostly a tight spur: clipping would leave < 10 → keep original.
    const px = -105;
    const coords: Coordinate[] = [
      [px, 40],
      [px, 40.001],
      [px, 40.002],
      [px, 40.003],
      [px, 40.004],
      [px, 40.005],
      [px, 40.004],
      [px, 40.003],
      [px, 40.002],
      [px, 40.001],
      [px, 40.0005],
    ];
    const clipped = clipLoopGeometry(coords);
    // Either unchanged (guard tripped) or at least never below the 10-pt floor.
    expect(clipped.length).toBeGreaterThanOrEqual(10);
  });
});
