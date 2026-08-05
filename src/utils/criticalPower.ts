/**
 * Critical Power / W' model utilities, extracted from
 * src/components/CriticalPowerModel.jsx so the activity chart (and any
 * other surface) can use them without mounting the component. The
 * component re-imports these — behavior is unchanged.
 *
 * calculateWPrimeBalance gains an optional per-step duration so tiers
 * sampled coarser than 1 Hz (fit_coach_context at 5–60 s) integrate
 * correctly; at dt = 1 it reproduces the original 1 Hz math exactly.
 */

export interface CPEstimate {
  cp: number;
  wPrime: number;
  model: 'calculated' | 'estimated';
}

/**
 * Estimate Critical Power and W' from best power efforts.
 * bestEfforts: { [durationSeconds: number]: watts }, e.g. { 180: 350, 1200: 260 }.
 * Falls back to CP = 0.95×FTP, W' = 20 kJ when efforts are missing or the
 * fit lands outside physiological bounds.
 */
export function estimateCPandWPrime(
  bestEfforts: Record<number, number> | null,
  ftp: number | null
): CPEstimate | null {
  if (!bestEfforts || Object.keys(bestEfforts).length < 2) {
    if (ftp) {
      return { cp: Math.round(ftp * 0.95), wPrime: 20000, model: 'estimated' };
    }
    return null;
  }

  // 2-parameter model P = CP + W'/t, fit as linear regression on
  // Work = CP·t + W'.
  const durations = Object.keys(bestEfforts)
    .map(Number)
    .sort((a, b) => a - b);
  const powers = durations.map((t) => bestEfforts[t]);

  const n = durations.length;
  let sumT = 0;
  let sumW = 0;
  let sumT2 = 0;
  let sumTW = 0;
  for (let i = 0; i < n; i++) {
    const t = durations[i];
    const w = powers[i] * t;
    sumT += t;
    sumW += w;
    sumT2 += t * t;
    sumTW += t * w;
  }

  const denom = n * sumT2 - sumT * sumT;
  if (denom === 0) return null;

  const cp = (n * sumTW - sumT * sumW) / denom;
  const wPrime = (sumW - cp * sumT) / n;

  if (cp < 50 || cp > 500 || wPrime < 5000 || wPrime > 50000) {
    if (ftp) {
      return { cp: Math.round(ftp * 0.95), wPrime: 20000, model: 'estimated' };
    }
    return null;
  }

  return { cp: Math.round(cp), wPrime: Math.round(wPrime), model: 'calculated' };
}

export interface WPrimeBalancePoint {
  time: number;
  power: number;
  wBalance: number;
  wBalancePercent: number;
  aboveCP: boolean;
}

/**
 * W' balance over a ride (Skiba-style differential model): depletes by
 * (P − CP)·dt above CP, recovers exponentially below it with
 * τ = 546·e^(−0.01·(CP−200)) + 316.
 *
 * dtSeconds: per-step duration — a scalar for regular sampling or an array
 * parallel to powerData (dt[i] = time covered by sample i). Defaults to 1
 * (the original 1 Hz behavior, bit-for-bit).
 */
export function calculateWPrimeBalance(
  powerData: number[],
  cp: number,
  wPrime: number,
  dtSeconds: number | number[] = 1
): WPrimeBalancePoint[] {
  if (!powerData || powerData.length === 0 || !cp || !wPrime) {
    return [];
  }

  const tau = 546 * Math.exp(-0.01 * (cp - 200)) + 316;
  let wBal = wPrime;
  const result: WPrimeBalancePoint[] = [];

  for (let i = 0; i < powerData.length; i++) {
    const power = powerData[i];
    const dt = typeof dtSeconds === 'number' ? dtSeconds : dtSeconds[i] ?? 1;

    if (power > cp) {
      wBal -= (power - cp) * dt;
    } else {
      const dcp = cp - power;
      const recovery = (wPrime - wBal) * (1 - Math.exp((-dcp * dt) / tau));
      wBal = Math.min(wPrime, wBal + recovery);
    }

    result.push({
      time: i,
      power,
      wBalance: Math.max(0, wBal),
      wBalancePercent: Math.max(0, (wBal / wPrime) * 100),
      aboveCP: power > cp,
    });
  }

  return result;
}

/**
 * Merge duration-keyed power maps ('60s'/'300s'-style keys, as stored in
 * activities.power_curve_summary and fitness_snapshots.best_efforts) into
 * the numeric-seconds map estimateCPandWPrime expects, keeping the max per
 * duration. Durations outside [120 s, 1800 s] are dropped — sprint efforts
 * break the linear 2-parameter CP fit, and > 30 min efforts are rarely
 * maximal.
 */
export function bestEffortsFromCurves(
  curves: Array<Record<string, number | null | undefined> | null | undefined>
): Record<number, number> {
  const merged: Record<number, number> = {};
  for (const curve of curves) {
    if (!curve) continue;
    for (const [key, value] of Object.entries(curve)) {
      if (value == null || value <= 0) continue;
      const seconds = parseInt(key, 10);
      if (!Number.isFinite(seconds) || seconds < 120 || seconds > 1800) continue;
      if (!merged[seconds] || value > merged[seconds]) merged[seconds] = value;
    }
  }
  return merged;
}

/** Predict maximum sustainable power for a given duration. */
export function predictPowerForDuration(
  cp: number | null,
  wPrime: number | null,
  durationSeconds: number
): number | null {
  if (!cp || !wPrime || durationSeconds <= 0) return null;
  return Math.round(cp + wPrime / durationSeconds);
}

/** Predict maximum duration at a given power. */
export function predictDurationForPower(
  cp: number | null,
  wPrime: number | null,
  power: number
): number {
  if (!cp || !wPrime || power <= cp) return Infinity;
  return Math.round(wPrime / (power - cp));
}
