/**
 * elevationGrade — grade (steepness) segmentation for the RB2 elevation chart.
 *
 * Converts an elevation profile into contiguous runs of grade "bins" so the
 * chart can paint the area under the terrain line as colored bands, the way
 * riders expect from RideWithGPS/Strava climb profiles — but on the Tribos
 * earth ramp (pale sage → ochre → terracotta → deep clay) instead of
 * green/yellow/red.
 *
 * The ramp is a semantic-heat sequential scale: hue drifts warm with
 * steepness while lightness steps monotonically darker (validated ΔL ≥ 0.06
 * per step), so the ordering survives red-green color-vision deficiency.
 * Descents and flats share the base bin — the fill encodes *climbing*
 * effort; the terrain line itself already shows descent shape.
 */

import type { ElevationPoint } from '../../../hooks/route-builder';

export interface GradeBin {
  /** Inclusive lower bound of the bin, in % grade. */
  minPct: number;
  /** Legend label. */
  label: string;
  /** Band fill (solid; pre-tinted for the white card surface). */
  color: string;
}

/** Ordered flat → steepest. Bin 0 also absorbs descents. */
export const GRADE_BINS: readonly GradeBin[] = [
  { minPct: -Infinity, label: '0–2', color: '#E3E8DA' },
  { minPct: 2, label: '2–4', color: '#E0C07E' },
  { minPct: 4, label: '4–7', color: '#DA9C5C' },
  { minPct: 7, label: '7–10', color: '#C97441' },
  { minPct: 10, label: '10+', color: '#A84A2B' },
] as const;

export function gradeBinIndex(gradePct: number): number {
  for (let i = GRADE_BINS.length - 1; i >= 1; i--) {
    if (gradePct >= GRADE_BINS[i].minPct) return i;
  }
  return 0;
}

export interface GradeRun {
  /** First profile index of the run (band spans startIdx → endIdx points). */
  startIdx: number;
  /** Last profile index of the run (inclusive; shared with the next run). */
  endIdx: number;
  bin: number;
}

export interface GradeSegmentation {
  /**
   * Smoothed grade (%) of the segment ending at each point; index 0 mirrors
   * index 1 so lookups by nearest-point index never miss.
   */
  gradesPct: number[];
  runs: GradeRun[];
  /** Steepest smoothed climbing grade along the route, in %. */
  maxPct: number;
}

/**
 * Smoothing window in km: raw per-sample grades on a dense profile are noisy
 * (elevation APIs quantize to ~1m), so each segment's grade is measured over
 * a centered window that scales with route length.
 */
function smoothingWindowKm(totalKm: number): number {
  return Math.min(1, Math.max(0.1, totalKm / 150));
}

export function computeGradeSegmentation(profile: ElevationPoint[]): GradeSegmentation | null {
  const n = profile.length;
  if (n < 2) return null;

  const totalKm = profile[n - 1].distance_km;
  const halfWindowKm = smoothingWindowKm(totalKm) / 2;

  const gradesPct = new Array<number>(n).fill(0);
  // Two-pointer centered window: for the segment ending at point i, measure
  // rise/run between the profile points bracketing [mid−w, mid+w].
  let lo = 0;
  let hi = 0;
  for (let i = 1; i < n; i++) {
    const midKm = (profile[i - 1].distance_km + profile[i].distance_km) / 2;
    while (lo < i - 1 && profile[lo + 1].distance_km <= midKm - halfWindowKm) lo++;
    if (hi < i) hi = i;
    while (hi < n - 1 && profile[hi].distance_km < midKm + halfWindowKm) hi++;
    const runM = (profile[hi].distance_km - profile[lo].distance_km) * 1000;
    gradesPct[i] = runM > 0 ? ((profile[hi].elevation_m - profile[lo].elevation_m) / runM) * 100 : gradesPct[i - 1];
  }
  gradesPct[0] = gradesPct[1];

  let maxPct = 0;
  for (let i = 1; i < n; i++) {
    if (gradesPct[i] > maxPct) maxPct = gradesPct[i];
  }

  const runs: GradeRun[] = [];
  let runStart = 0;
  let runBin = gradeBinIndex(gradesPct[1]);
  for (let i = 2; i < n; i++) {
    const bin = gradeBinIndex(gradesPct[i]);
    if (bin !== runBin) {
      runs.push({ startIdx: runStart, endIdx: i - 1, bin: runBin });
      runStart = i - 1;
      runBin = bin;
    }
  }
  runs.push({ startIdx: runStart, endIdx: n - 1, bin: runBin });

  return { gradesPct, runs, maxPct };
}

/**
 * "Nice" axis ticks strictly inside [min, max], aiming for the requested
 * count. Returns clean steps (1/2/2.5/5 × 10^k) in whatever unit the caller
 * passed in — the chart converts to display units before calling.
 */
export function niceTicks(min: number, max: number, targetCount: number): number[] {
  const span = max - min;
  if (!(span > 0) || targetCount < 1) return [];
  const rawStep = span / (targetCount + 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  let step = 10 * mag;
  for (const m of [1, 2, 2.5, 5]) {
    if (m * mag >= rawStep) {
      step = m * mag;
      break;
    }
  }
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) {
    // Snap floating-point drift (0.30000000000000004 → 0.3).
    ticks.push(Math.round(t / step) * step);
  }
  return ticks;
}
