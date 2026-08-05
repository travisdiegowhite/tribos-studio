/**
 * Live stats for the selected window: NP / Avg / Max recomputed from the
 * full-resolution samples every time the brush moves (the reference-app
 * behavior). Pure and cheap — one pass plus a rolling-sum NP.
 */

import { normalizedPowerFromSamples } from '../../../utils/normalizedPower';

export interface SelectionStats {
  /** Simple mean of non-null samples (recording-time weighted at 1 Hz). */
  avg: number | null;
  max: number | null;
  /** Normalized Power — power metric only, needs ≥30 s of samples. */
  np: number | null;
  /** Window duration in seconds (real time axis). */
  durationS: number | null;
}

export function computeSelectionStats(
  values: (number | null)[],
  t: number[] | null,
  i0: number,
  i1: number,
  options: { isPower: boolean; sampleSeconds: number | null }
): SelectionStats {
  let sum = 0;
  let count = 0;
  let max: number | null = null;
  const powerSequence: number[] = [];

  for (let i = i0; i <= i1; i++) {
    const v = values[i];
    if (v == null) continue;
    sum += v;
    count++;
    if (max === null || v > max) max = v;
    // NP matches production semantics (api extractPowerStream): zeros and
    // nulls are excluded from the rolling sequence.
    if (options.isPower && v > 0) powerSequence.push(v);
  }

  const np =
    options.isPower && options.sampleSeconds != null
      ? normalizedPowerFromSamples(powerSequence, options.sampleSeconds)
      : null;

  return {
    avg: count > 0 ? sum / count : null,
    max,
    np,
    durationS: t ? t[i1] - t[i0] : null,
  };
}
