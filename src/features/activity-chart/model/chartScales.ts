/**
 * Pure scale/window math for the activity chart. No React, no canvas —
 * everything here is unit-testable geometry (spineGeometry.ts precedent).
 */

import { niceTicks, formatElapsed } from '../../../utils/streamChartData';
import type { XMode } from './streamTypes';

export interface LinearScale {
  domainMin: number;
  domainMax: number;
  rangeMin: number;
  rangeMax: number;
}

export function scaleValue(v: number, s: LinearScale): number {
  const span = s.domainMax - s.domainMin;
  if (span === 0) return s.rangeMin;
  return s.rangeMin + ((v - s.domainMin) / span) * (s.rangeMax - s.rangeMin);
}

export function invertScale(px: number, s: LinearScale): number {
  const span = s.rangeMax - s.rangeMin;
  if (span === 0) return s.domainMin;
  return s.domainMin + ((px - s.rangeMin) / span) * (s.domainMax - s.domainMin);
}

/**
 * [firstIndex, lastIndex] (inclusive) of samples whose x falls in [x0, x1].
 * Binary search over the monotonic xs array; returns null when the window
 * misses the data entirely.
 */
export function windowIndices(xs: number[], x0: number, x1: number): [number, number] | null {
  if (xs.length === 0 || x1 < xs[0] || x0 > xs[xs.length - 1]) return null;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x0) lo = mid + 1;
    else hi = mid;
  }
  const first = lo;
  lo = first;
  hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] > x1) hi = mid - 1;
    else lo = mid;
  }
  // A window that falls entirely between two samples leaves lo pointing at
  // a sample outside [x0, x1] — reject it.
  return first <= lo && xs[lo] <= x1 && xs[first] >= x0 ? [first, lo] : null;
}

/** Max non-null value over an index window; null if the window has no data. */
export function windowMax(
  values: (number | null)[],
  i0: number,
  i1: number
): number | null {
  let max: number | null = null;
  for (let i = i0; i <= i1; i++) {
    const v = values[i];
    if (v != null && (max === null || v > max)) max = v;
  }
  return max;
}

/**
 * Y-domain max for a metric window: the data max padded ~5% and rounded up
 * to a clean step so the axis label reads well and spikes don't clip.
 */
export function yDomainMax(dataMax: number | null): number {
  if (dataMax == null || dataMax <= 0) return 1;
  const padded = dataMax * 1.02;
  const step = padded > 500 ? 50 : padded > 100 ? 25 : padded > 20 ? 5 : 1;
  return Math.ceil(padded / step) * step;
}

export interface AxisTick {
  value: number;
  label: string;
}

export function formatXTick(value: number, xMode: XMode): string {
  if (xMode === 'time_s') return formatElapsed(value);
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

/** Tick marks for the visible x window (reuses the shared nice-tick logic). */
export function xAxisTicks(x0: number, x1: number, xMode: XMode, maxTicks = 7): AxisTick[] {
  return niceTicks(x0, x1, maxTicks)
    .filter((v: number) => v >= x0 && v <= x1)
    .map((v: number) => ({ value: v, label: formatXTick(v, xMode) }));
}
