import { describe, it, expect } from 'vitest';
import {
  approxEqual,
  distinctPositionCount,
  resamplePositionsFromGeometry,
} from '../waypointResample';
import type { Coordinate } from '../../../types/geo';

describe('distinctPositionCount', () => {
  it('counts coincident points as one (the generated-loop case)', () => {
    const p: Coordinate = [-105, 40];
    expect(distinctPositionCount([p, [p[0], p[1]]])).toBe(1);
  });
  it('counts genuinely distinct endpoints', () => {
    expect(distinctPositionCount([[-105, 40], [-105.1, 40.1]])).toBe(2);
  });
});

describe('resamplePositionsFromGeometry', () => {
  // A square loop: start == end, with elevation as a 3rd element.
  const loop: number[][] = [
    [-105.0, 40.0, 1500],
    [-105.0, 40.05, 1510],
    [-104.95, 40.05, 1520],
    [-104.95, 40.0, 1505],
    [-105.0, 40.0, 1500],
  ];

  it('strips elevation — every result is 2-element', () => {
    const out = resamplePositionsFromGeometry(loop);
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (const p of out) expect(p).toHaveLength(2);
  });

  it('produces ≥2 distinct points for a loop and closes it', () => {
    const out = resamplePositionsFromGeometry(loop);
    expect(distinctPositionCount(out)).toBeGreaterThanOrEqual(3);
    expect(approxEqual(out[0], out[out.length - 1])).toBe(true); // closed loop
  });

  it('handles a point-to-point line without forcing a closure', () => {
    const line: number[][] = [
      [-105.0, 40.0, 1500],
      [-105.05, 40.0, 1490],
      [-105.1, 40.0, 1480],
    ];
    const out = resamplePositionsFromGeometry(line);
    expect(approxEqual(out[0], out[out.length - 1])).toBe(false);
    expect(out[0]).toEqual([-105.0, 40.0]);
    expect(out[out.length - 1]).toEqual([-105.1, 40.0]);
  });

  it('returns [] for degenerate geometry', () => {
    expect(resamplePositionsFromGeometry([])).toEqual([]);
    expect(resamplePositionsFromGeometry([[-105, 40]])).toEqual([]);
  });

  it('never exceeds the requested sample count', () => {
    const out = resamplePositionsFromGeometry(loop, 4);
    // 4 samples + possible closing point.
    expect(out.length).toBeLessThanOrEqual(5);
  });
});
