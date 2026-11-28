import { describe, it, expect } from 'vitest';
import {
  categorizeClimb,
  climbLabel,
  climbTcxPointType,
  climbFitPointType,
  detectClimbs,
  detectClimbsFromCoordinates,
  climbCoursePointName,
} from '../climbs';

/** A flat km, a 4 km climb at 6%, a flat km (profile in 100 m steps). */
function profile() {
  const pts: Array<{ distance_km: number; elevation: number }> = [];
  let ele = 1600;
  for (let i = 0; i <= 60; i++) {
    const km = i / 10;
    if (km > 1 && km <= 5) ele += 6; // 6 m per 100 m = 6%
    pts.push({ distance_km: km, elevation: ele });
  }
  return pts;
}

describe('climb categories', () => {
  it('scores length × grade into the usual categories', () => {
    expect(categorizeClimb(4000, 6)).toBe('3'); // 24,000
    expect(categorizeClimb(10_000, 7)).toBe('1'); // 70,000
    expect(categorizeClimb(15_000, 7)).toBe('HC'); // 105,000
    expect(categorizeClimb(1000, 4)).toBeNull(); // 4,000
    expect(climbLabel('HC')).toBe('HC');
    expect(climbLabel('2')).toBe('Cat 2');
    expect(climbLabel(null)).toBe('Climb');
  });

  it('maps to TCX and FIT course point types', () => {
    expect(climbTcxPointType('4')).toBe('4th Category');
    expect(climbTcxPointType('HC')).toBe('Hors Category');
    expect(climbFitPointType('1')).toBe('firstCategory');
    expect(climbFitPointType(null)).toBe('generic');
  });
});

describe('detectClimbs', () => {
  it('finds the climb, in route order, with its category', () => {
    const climbs = detectClimbs(profile());
    expect(climbs).toHaveLength(1);
    const c = climbs[0];
    expect(c.start_km).toBeCloseTo(1, 0);
    expect(c.length_km).toBeCloseTo(4, 0);
    expect(c.avg_grade_pct).toBeCloseTo(6, 0);
    expect(c.category).toBe('3');
    expect(c.start_coordinate).toBeNull();
  });

  it('accepts the RB2 profile shape (elevation_m)', () => {
    const rb2 = profile().map((p) => ({ distance_km: p.distance_km, elevation_m: p.elevation }));
    expect(detectClimbs(rb2)).toHaveLength(1);
  });

  it('works from elevation-filled coordinates and places the climb on the line', () => {
    // ~100 m per step due north along a meridian.
    const coords = profile().map((p, i) => [-105, 40 + i * 0.0008993, p.elevation]);
    const climbs = detectClimbsFromCoordinates(coords);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].start_coordinate?.[0]).toBeCloseTo(-105, 5);
    expect(climbs[0].top_coordinate?.[1]).toBeGreaterThan(climbs[0].start_coordinate![1]);
    expect(climbCoursePointName(climbs[0], 16)).toMatch(/^Cat 3 \d\.\dkm$/);
    expect(climbCoursePointName(climbs[0], 10)).toBe('Cat 3');
  });

  it('returns nothing without elevation', () => {
    expect(detectClimbsFromCoordinates([[-105, 40], [-105, 40.1]])).toEqual([]);
    expect(detectClimbs(null)).toEqual([]);
  });
});
