import { describe, it, expect } from 'vitest';
import {
  GRADE_BINS,
  gradeBinIndex,
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

describe('gradeBinIndex', () => {
  it('maps descents and flats to the base bin', () => {
    expect(gradeBinIndex(-12)).toBe(0);
    expect(gradeBinIndex(0)).toBe(0);
    expect(gradeBinIndex(1.9)).toBe(0);
  });

  it('maps climbing grades to their bins at the documented boundaries', () => {
    expect(gradeBinIndex(2)).toBe(1);
    expect(gradeBinIndex(3.9)).toBe(1);
    expect(gradeBinIndex(4)).toBe(2);
    expect(gradeBinIndex(7)).toBe(3);
    expect(gradeBinIndex(10)).toBe(4);
    expect(gradeBinIndex(25)).toBe(4);
  });
});

describe('computeGradeSegmentation', () => {
  it('returns null for fewer than two points', () => {
    expect(computeGradeSegmentation([])).toBeNull();
    expect(computeGradeSegmentation([{ distance_km: 0, elevation_m: 0 }])).toBeNull();
  });

  it('produces a single base-bin run for a gentle climb', () => {
    const profile: ElevationPoint[] = [];
    for (let i = 0; i <= 10; i++) {
      profile.push({ distance_km: i, elevation_m: i * 10 }); // 1%
    }
    const seg = computeGradeSegmentation(profile);
    expect(seg).not.toBeNull();
    expect(seg!.runs).toHaveLength(1);
    expect(seg!.runs[0]).toEqual({ startIdx: 0, endIdx: 10, bin: 0 });
    expect(seg!.maxPct).toBeCloseTo(1, 1);
  });

  it('segments a flat/5%/12% profile into ordered runs that tile the profile', () => {
    const profile = threeSectionProfile();
    const seg = computeGradeSegmentation(profile)!;

    const bins = seg.runs.map((r) => r.bin);
    // Flat → moderate (4–7) → very steep (10+); smoothing may add short
    // transition runs at the section boundaries, but the sequence must be
    // monotone through these three bins.
    expect(bins[0]).toBe(0);
    expect(bins[bins.length - 1]).toBe(4);
    expect(bins).toContain(2);
    for (let i = 1; i < bins.length; i++) {
      expect(bins[i]).toBeGreaterThan(bins[i - 1]);
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

  it('has one color per bin on the earth ramp', () => {
    expect(GRADE_BINS).toHaveLength(5);
    expect(new Set(GRADE_BINS.map((b) => b.color)).size).toBe(5);
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
