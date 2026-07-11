import { describe, it, expect } from 'vitest';
import {
  GRADE_RAMP,
  GRADE_RAMP_MAX_PCT,
  gradeToColor,
  quantizeGradePct,
  computeGradeSegmentation,
  niceTicks,
} from '../elevationGrade';
import type { ElevationPoint } from '../../../../hooks/route-builder';

/** Profile sampled every 100m: 1km flat, 1km at 5%, 1km at 12%. */
function threeSectionProfile(): ElevationPoint[] {
  const points: ElevationPoint[] = [];
  let elev = 100;
  for (let i = 0; i <= 30; i++) {
    const km = i / 10;
    if (i > 0) {
      if (km <= 1) elev += 0;
      else if (km <= 2) elev += 5; // 5% over 100m
      else elev += 12; // 12% over 100m
    }
    points.push({ distance_km: km, elevation_m: elev });
  }
  return points;
}

describe('gradeToColor', () => {
  it('gives descents and flats the base color', () => {
    expect(gradeToColor(-12)).toBe(GRADE_RAMP[0].color);
    expect(gradeToColor(0)).toBe(GRADE_RAMP[0].color);
    expect(gradeToColor(0.5)).toBe(GRADE_RAMP[0].color);
  });

  it('returns the anchor color exactly at each ramp stop', () => {
    for (const stop of GRADE_RAMP) {
      expect(gradeToColor(stop.pct)).toBe(stop.color);
    }
  });

  it('clamps to the steepest color above the ramp top', () => {
    expect(gradeToColor(GRADE_RAMP_MAX_PCT + 10)).toBe(GRADE_RAMP[GRADE_RAMP.length - 1].color);
  });

  it('blends between stops so gentle rollers still pick up tint', () => {
    const flat = gradeToColor(0);
    const gentle = gradeToColor(2);
    const anchored = gradeToColor(3);
    expect(gentle).not.toBe(flat);
    expect(gentle).not.toBe(anchored);
    expect(gentle).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('quantizeGradePct', () => {
  it('snaps to 0.5% steps and clamps to the ramp', () => {
    expect(quantizeGradePct(-4)).toBe(0);
    expect(quantizeGradePct(0.2)).toBe(0);
    expect(quantizeGradePct(2.3)).toBe(2.5);
    expect(quantizeGradePct(7.74)).toBe(7.5);
    expect(quantizeGradePct(25)).toBe(GRADE_RAMP_MAX_PCT);
  });
});

describe('computeGradeSegmentation', () => {
  it('returns null for fewer than two points', () => {
    expect(computeGradeSegmentation([])).toBeNull();
    expect(computeGradeSegmentation([{ distance_km: 0, elevation_m: 0 }])).toBeNull();
  });

  it('produces a single flat run for a gentle constant climb', () => {
    const profile: ElevationPoint[] = [];
    for (let i = 0; i <= 10; i++) {
      profile.push({ distance_km: i, elevation_m: i * 10 }); // 1%
    }
    const seg = computeGradeSegmentation(profile);
    expect(seg).not.toBeNull();
    expect(seg!.runs).toHaveLength(1);
    expect(seg!.runs[0]).toEqual({ startIdx: 0, endIdx: 10, gradePct: 1 });
    expect(seg!.maxPct).toBeCloseTo(1, 1);
  });

  it('segments a flat/5%/12% profile into ordered runs that tile the profile', () => {
    const profile = threeSectionProfile();
    const seg = computeGradeSegmentation(profile)!;

    const grades = seg.runs.map((r) => r.gradePct);
    // Flat → 5% → 12%; smoothing may add short transition runs at the
    // section boundaries, but the sequence must be monotone increasing.
    expect(grades[0]).toBe(0);
    expect(grades[grades.length - 1]).toBe(12);
    expect(grades).toContain(5);
    for (let i = 1; i < grades.length; i++) {
      expect(grades[i]).toBeGreaterThan(grades[i - 1]);
    }

    // Runs share boundary points and cover the whole profile.
    expect(seg.runs[0].startIdx).toBe(0);
    expect(seg.runs[seg.runs.length - 1].endIdx).toBe(profile.length - 1);
    for (let i = 1; i < seg.runs.length; i++) {
      expect(seg.runs[i].startIdx).toBe(seg.runs[i - 1].endIdx);
    }

    expect(seg.maxPct).toBeCloseTo(12, 0);
    expect(seg.gradesPct).toHaveLength(profile.length);
  });
});

describe('niceTicks', () => {
  it('returns clean steps inside the range', () => {
    expect(niceTicks(0, 100, 3)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(113, 387, 3)).toEqual([200, 300]);
  });

  it('returns nothing for an empty or invalid range', () => {
    expect(niceTicks(5, 5, 3)).toEqual([]);
    expect(niceTicks(10, 0, 3)).toEqual([]);
  });
});
