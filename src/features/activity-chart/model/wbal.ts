/**
 * W' balance series for the chart overlay — wraps the extracted Skiba
 * implementation with dt derived from the real time axis, so coach_ts
 * tiers (5–60 s samples) integrate the same seconds as 1 Hz data.
 */

import { calculateWPrimeBalance } from '../../../utils/criticalPower';

export interface WBalSeries {
  /** W' balance in joules per sample (parallel to the input arrays). */
  values: number[];
  /** Minimum balance over the ride, joules. */
  minJ: number;
  /** Sample index of the minimum. */
  minIndex: number;
}

const MAX_STEP_SECONDS = 60;

/**
 * Compute the W' balance series from a power stream and its time axis.
 * Null power samples count as 0 W (coasting → recovery). Pause gaps are
 * clamped to 60 s per step so a stopped ride doesn't over-recover in one
 * jump beyond the model's resolution.
 */
export function computeWBalSeries(
  power: (number | null)[],
  t: number[],
  cp: number,
  wPrime: number
): WBalSeries | null {
  if (!power || power.length < 2 || t.length !== power.length || !cp || !wPrime) {
    return null;
  }

  const powerFilled = power.map((v) => v ?? 0);
  const dt = t.map((x, i) =>
    i === 0 ? 1 : Math.min(MAX_STEP_SECONDS, Math.max(0.5, x - t[i - 1]))
  );

  const points = calculateWPrimeBalance(powerFilled, cp, wPrime, dt);
  if (points.length === 0) return null;

  let minJ = Infinity;
  let minIndex = 0;
  const values = new Array<number>(points.length);
  for (let i = 0; i < points.length; i++) {
    values[i] = points[i].wBalance;
    if (points[i].wBalance < minJ) {
      minJ = points[i].wBalance;
      minIndex = i;
    }
  }
  return { values, minJ, minIndex };
}
