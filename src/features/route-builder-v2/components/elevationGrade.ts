/**
 * elevationGrade — grade (steepness) segmentation for the RB2 elevation chart.
 *
 * Converts an elevation profile into contiguous runs of (quantized) grade
 * so the chart can paint the area under the terrain line as fine color
 * stripes, the way riders expect from RideWithGPS/Strava climb profiles —
 * but on the Tribos cool→warm ramp (brand teal → ochre gold → orange →
 * terracotta → coral red) instead of stock traffic-light colors: flats
 * and descents wear the calm brand primary, climbs heat up.
 *
 * The ramp is a semantic-heat sequential scale: hue drifts warm with
 * steepness while lightness falls monotonically (anchor stops validated),
 * so the ordering survives red-green color-vision deficiency. Descents and
 * flats share the base color — the fill encodes *climbing* effort; the
 * terrain line itself already shows descent shape.
 */

import type { ElevationPoint } from '../../../hooks/route-builder';

export interface GradeRampStop {
  /** Grade in % at which this stop's color applies exactly. */
  pct: number;
  color: string;
}

/**
 * Continuous ramp anchors, flat → steepest. Grades between stops blend
 * linearly, so even a rolling 2–4% route picks up visible warm tinting
 * instead of collapsing into one flat band. Descents share the flat color —
 * the fill encodes climbing effort.
 */
export const GRADE_RAMP: readonly GradeRampStop[] = [
  { pct: 0.5, color: '#A0D6D0' },
  { pct: 3, color: '#D2A730' },
  { pct: 5.5, color: '#DE7F2C' },
  { pct: 8.5, color: '#C9561E' },
  { pct: 12, color: '#B03122' },
] as const;

/** Top of the ramp — grades at/above this all take the steepest color. */
export const GRADE_RAMP_MAX_PCT = GRADE_RAMP[GRADE_RAMP.length - 1].pct;

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpHex(a: string, b: string, t: number): string {
  const ai = parseInt(a.slice(1), 16);
  const bi = parseInt(b.slice(1), 16);
  const r = lerpChannel((ai >> 16) & 0xff, (bi >> 16) & 0xff, t);
  const g = lerpChannel((ai >> 8) & 0xff, (bi >> 8) & 0xff, t);
  const bl = lerpChannel(ai & 0xff, bi & 0xff, t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0').toUpperCase()}`;
}

/** Band fill for a grade, interpolated along the earth ramp. */
export function gradeToColor(gradePct: number): string {
  if (gradePct <= GRADE_RAMP[0].pct) return GRADE_RAMP[0].color;
  for (let i = 1; i < GRADE_RAMP.length; i++) {
    const prev = GRADE_RAMP[i - 1];
    const cur = GRADE_RAMP[i];
    if (gradePct <= cur.pct) {
      return lerpHex(prev.color, cur.color, (gradePct - prev.pct) / (cur.pct - prev.pct));
    }
  }
  return GRADE_RAMP[GRADE_RAMP.length - 1].color;
}

/**
 * Snap a grade to 0.5% steps (clamped to the ramp) so adjacent segments
 * with near-identical grade merge into one band, giving the fine-striped
 * look without one SVG path per sample.
 */
export function quantizeGradePct(gradePct: number): number {
  const clamped = Math.max(0, Math.min(gradePct, GRADE_RAMP_MAX_PCT));
  return Math.round(clamped * 2) / 2;
}

export interface GradeRun {
  /** First profile index of the run (band spans startIdx → endIdx points). */
  startIdx: number;
  /** Last profile index of the run (inclusive; shared with the next run). */
  endIdx: number;
  /** Quantized grade of the run, in % (0 … GRADE_RAMP_MAX_PCT). */
  gradePct: number;
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
  let runGrade = quantizeGradePct(gradesPct[1]);
  for (let i = 2; i < n; i++) {
    const grade = quantizeGradePct(gradesPct[i]);
    if (grade !== runGrade) {
      runs.push({ startIdx: runStart, endIdx: i - 1, gradePct: runGrade });
      runStart = i - 1;
      runGrade = grade;
    }
  }
  runs.push({ startIdx: runStart, endIdx: n - 1, gradePct: runGrade });

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
