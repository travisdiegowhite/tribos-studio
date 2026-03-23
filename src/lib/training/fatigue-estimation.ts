/**
 * Fatigue Estimation Engine
 *
 * Estimates TSS from whatever data is available, cascading through four tiers.
 * Confidence is a first-class output used to modulate recommendation language.
 *
 * Tier 1: Power (NP + FTP) → confidence 0.95
 * Tier 2: Heart Rate (Edwards TRIMP) → confidence 0.55–0.80
 * Tier 3: Session RPE (Foster sRPE) → confidence 0.50
 * Tier 4: Workout type inference → confidence 0.40
 */

import {
  TYPE_TSS_PER_HOUR,
  CARDIAC_DRIFT_THRESHOLD_SECONDS,
  CARDIAC_DRIFT_FACTOR,
  HR_ZONE_THRESHOLDS,
  CALIBRATION_DECAY,
} from './constants';
import type { TSSEstimate, ActivityData, CalibrationFactors } from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Returns best available TSS estimate with confidence bounds.
 * Cascades: power → HR → RPE → type inference.
 */
export function estimateTSS(
  activity: ActivityData,
  calibration: CalibrationFactors
): TSSEstimate {
  if (activity.normalized_power && activity.ftp) {
    return estimateFromPower(activity);
  }
  if (activity.hr_stream && activity.hr_stream.length > 0 && activity.hr_max && activity.hr_rest) {
    return estimateFromHR(activity, calibration);
  }
  if (activity.avg_hr && activity.hr_max && activity.hr_rest) {
    return estimateFromAvgHR(activity, calibration);
  }
  if (activity.rpe !== undefined && activity.rpe > 0) {
    return estimateFromRPE(activity, calibration);
  }
  return estimateFromType(activity);
}

// ── Tier 1: Power ────────────────────────────────────────────────────────────
// TSS = (duration_s × NP × IF) / (FTP × 3600) × 100

function estimateFromPower(activity: ActivityData): TSSEstimate {
  const np = activity.normalized_power!;
  const ftp = activity.ftp!;
  const dur = activity.duration_seconds;

  const intensity_factor = np / ftp;
  const tss = (dur * np * intensity_factor) / (ftp * 3600) * 100;

  return {
    tss: round2(tss),
    tss_low: round2(tss * 0.95),
    tss_high: round2(tss * 1.05),
    confidence: 0.95,
    source: 'power',
    method_detail: `NP=${np}w, FTP=${ftp}w, IF=${intensity_factor.toFixed(2)}`,
  };
}

// ── Tier 2: HR Stream (Edwards TRIMP) ────────────────────────────────────────
// TRIMP = Σ (minutes in zone × zone_weight)
// Zone weights: Z1=1, Z2=2, Z3=3, Z4=4, Z5=5

function estimateFromHR(
  activity: ActivityData,
  calibration: CalibrationFactors
): TSSEstimate {
  const hr_stream = activity.hr_stream!;
  const hr_max = activity.hr_max!;
  const hr_rest = activity.hr_rest!;

  const hrr = hr_max - hr_rest;
  const zoneThresholds = HR_ZONE_THRESHOLDS.map(pct => hr_rest + hrr * pct);

  // Count seconds in each zone
  const zoneSecs = [0, 0, 0, 0, 0];
  for (const hr of hr_stream) {
    if (hr < zoneThresholds[0])      zoneSecs[0]++;
    else if (hr < zoneThresholds[1]) zoneSecs[1]++;
    else if (hr < zoneThresholds[2]) zoneSecs[2]++;
    else if (hr < zoneThresholds[3]) zoneSecs[3]++;
    else                              zoneSecs[4]++;
  }
  const zoneMins = zoneSecs.map(s => s / 60);

  // Edwards TRIMP — zone weights 1..5
  const trimp = zoneMins.reduce((sum, mins, z) => sum + mins * (z + 1), 0);

  // Cardiac drift correction for rides > 90 min
  const driftFactor = activity.duration_seconds > CARDIAC_DRIFT_THRESHOLD_SECONDS
    ? CARDIAC_DRIFT_FACTOR : 1.0;
  const correctedTRIMP = trimp * driftFactor;

  const tss = round2(correctedTRIMP * calibration.trimp_to_tss);

  // Confidence improves as calibration sample count grows (asymptotes ~15 sessions)
  const calConfidence = Math.min(0.80, 0.55 + (calibration.sample_count / 15) * 0.25);

  return {
    tss,
    tss_low: round2(tss * 0.80),
    tss_high: round2(tss * 1.20),
    confidence: round2(calConfidence),
    source: 'hr',
    method_detail: `TRIMP=${correctedTRIMP.toFixed(1)}, factor=${calibration.trimp_to_tss}`,
  };
}

// ── Tier 2b: Average HR (fallback when no stream) ───────────────────────────

function estimateFromAvgHR(
  activity: ActivityData,
  calibration: CalibrationFactors
): TSSEstimate {
  const avg_hr = activity.avg_hr!;
  const hr_max = activity.hr_max!;
  const hr_rest = activity.hr_rest!;
  const duration_minutes = activity.duration_seconds / 60;

  const hrr = hr_max - hr_rest;
  const hr_pct = (avg_hr - hr_rest) / hrr;

  // Estimate zone weight from average HR percentage
  let zoneWeight: number;
  if (hr_pct < 0.50)      zoneWeight = 1;
  else if (hr_pct < 0.60) zoneWeight = 2;
  else if (hr_pct < 0.70) zoneWeight = 3;
  else if (hr_pct < 0.80) zoneWeight = 4;
  else                     zoneWeight = 5;

  const trimp = duration_minutes * zoneWeight;

  const driftFactor = activity.duration_seconds > CARDIAC_DRIFT_THRESHOLD_SECONDS
    ? CARDIAC_DRIFT_FACTOR : 1.0;
  const correctedTRIMP = trimp * driftFactor;

  const tss = round2(correctedTRIMP * calibration.trimp_to_tss);
  const calConfidence = Math.min(0.70, 0.50 + (calibration.sample_count / 15) * 0.20);

  return {
    tss,
    tss_low: round2(tss * 0.75),
    tss_high: round2(tss * 1.25),
    confidence: round2(calConfidence),
    source: 'hr',
    method_detail: `avgHR=${avg_hr}, zone~${zoneWeight}, TRIMP=${correctedTRIMP.toFixed(1)}`,
  };
}

// ── Tier 3: Foster Session-RPE ───────────────────────────────────────────────
// sRPE = RPE (1–10) × duration_minutes

function estimateFromRPE(
  activity: ActivityData,
  calibration: CalibrationFactors
): TSSEstimate {
  const rpe = activity.rpe!;
  const duration_minutes = activity.duration_seconds / 60;
  const srpe = rpe * duration_minutes;
  const tss = round2(srpe * calibration.srpe_to_tss);

  return {
    tss,
    tss_low: round2(tss * 0.65),
    tss_high: round2(tss * 1.35),
    confidence: 0.50,
    source: 'rpe',
    method_detail: `sRPE=${srpe.toFixed(0)}, factor=${calibration.srpe_to_tss}`,
  };
}

// ── Tier 4: Workout type inference ───────────────────────────────────────────

function estimateFromType(activity: ActivityData): TSSEstimate {
  const type = activity.workout_type ?? 'endurance';
  const defaults = TYPE_TSS_PER_HOUR[type] ?? TYPE_TSS_PER_HOUR.endurance;
  const hours = activity.duration_seconds / 3600;

  // Elevation bonus: ~1 TSS per 30m of gain
  const elevationBonus = (activity.total_elevation_m ?? 0) / 30;

  const tss = round2(defaults.mid * hours + elevationBonus);
  const tss_low = round2(defaults.low * hours + elevationBonus);
  const tss_high = round2(defaults.high * hours + elevationBonus);

  return {
    tss,
    tss_low,
    tss_high,
    confidence: 0.40,
    source: 'inferred',
    method_detail: `type=${type}, ${hours.toFixed(1)}h, +${elevationBonus.toFixed(0)} elev bonus`,
  };
}

// ── Calibration Updater ──────────────────────────────────────────────────────
// Called when a Tier 1 session also has HR data — uses the overlap
// to refine the per-user TRIMP→TSS scaling factor.

export function updateCalibration(
  current: CalibrationFactors,
  actual_tss: number,
  trimp: number,
  srpe?: number
): CalibrationFactors {
  const decay = CALIBRATION_DECAY;

  const new_trimp_factor = trimp > 0
    ? current.trimp_to_tss * decay + (actual_tss / trimp) * (1 - decay)
    : current.trimp_to_tss;

  let new_srpe_factor = current.srpe_to_tss;
  if (srpe && srpe > 0) {
    new_srpe_factor = current.srpe_to_tss * decay + (actual_tss / srpe) * (1 - decay);
  }

  return {
    trimp_to_tss: round2(new_trimp_factor),
    srpe_to_tss: round2(new_srpe_factor),
    sample_count: current.sample_count + 1,
  };
}

/**
 * Compute TRIMP from an HR stream — used by the calibration updater
 * when both power and HR data are available for the same session.
 */
export function computeTRIMP(
  hr_stream: number[],
  hr_max: number,
  hr_rest: number,
  duration_seconds: number
): number {
  const hrr = hr_max - hr_rest;
  const zoneThresholds = HR_ZONE_THRESHOLDS.map(pct => hr_rest + hrr * pct);

  const zoneSecs = [0, 0, 0, 0, 0];
  for (const hr of hr_stream) {
    if (hr < zoneThresholds[0])      zoneSecs[0]++;
    else if (hr < zoneThresholds[1]) zoneSecs[1]++;
    else if (hr < zoneThresholds[2]) zoneSecs[2]++;
    else if (hr < zoneThresholds[3]) zoneSecs[3]++;
    else                              zoneSecs[4]++;
  }
  const zoneMins = zoneSecs.map(s => s / 60);
  const trimp = zoneMins.reduce((sum, mins, z) => sum + mins * (z + 1), 0);

  const driftFactor = duration_seconds > CARDIAC_DRIFT_THRESHOLD_SECONDS
    ? CARDIAC_DRIFT_FACTOR : 1.0;

  return trimp * driftFactor;
}
