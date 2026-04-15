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
import type { TSSEstimate, ActivityData, CalibrationFactors, TerrainClass } from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Terrain Classification ───────────────────────────────────────────────────
// Mirrors api/utils/fitnessSnapshots.js — same thresholds, same multiplier.
// Kept in lockstep so the API-side estimateTSSWithSource and this module
// produce identical terrain_class values for the same activity.

/**
 * Classify terrain from distance + elevation gain (elevation-per-km).
 * Returns 'flat' when distance or elevation is missing/zero.
 */
export function classifyTerrain(
  distanceM: number | undefined,
  elevationM: number | undefined,
): TerrainClass {
  const distanceKm = (distanceM ?? 0) / 1000;
  const elev = elevationM ?? 0;
  if (!(distanceKm > 0) || !(elev > 0)) return 'flat';
  const ratio = elev / distanceKm;
  if (ratio < 8) return 'flat';
  if (ratio < 15) return 'rolling';
  if (ratio < 25) return 'hilly';
  return 'mountainous';
}

/**
 * Terrain multiplier — spec §3.1 continuous formula.
 *
 *   gradientFactor = 1 + averageGradientPercent * 0.015
 *   steepFactor    = 1 + percentAbove6Percent  * 0.002
 *   vamFactor      = vam > 0 ? 1 + vam/10000 : 1.0
 *   multiplier     = gradientFactor * steepFactor * vamFactor  (capped 1.40)
 *
 * Applied only to the kilojoules + inferred TSS tiers (D4) — power, HR,
 * RPE, and device tiers already reflect climbing cost in the underlying
 * measurement. `percent_above_6_percent` requires a grade stream and
 * defaults to 0 when absent.
 */
export function terrainMultiplier(activity: ActivityData | null | undefined): number {
  if (!activity) return 1.0;

  const distanceM = activity.distance_m ?? 0;
  const elevationM = activity.total_elevation_m ?? 0;
  const movingSec = activity.duration_seconds ?? 0;

  const avgGradientPct = typeof activity.average_gradient_percent === 'number'
    ? activity.average_gradient_percent
    : distanceM > 0
      ? (elevationM / distanceM) * 100
      : 0;

  const pctAbove6 = typeof activity.percent_above_6_percent === 'number'
    ? activity.percent_above_6_percent
    : 0;

  const vam = movingSec > 0 ? elevationM / (movingSec / 3600) : 0;

  const gradientFactor = 1 + avgGradientPct * 0.015;
  const steepFactor = 1 + pctAbove6 * 0.002;
  const vamFactor = vam > 0 ? 1 + vam / 10000 : 1.0;

  const multiplier = gradientFactor * steepFactor * vamFactor;
  return Math.min(multiplier, 1.4);
}

const MTB_SPORT_TYPES = new Set(['MountainBikeRide']);

/**
 * Identify mountain-bike sessions. Tribos normalizes provider enums to
 * Strava's MountainBikeRide at ingestion.
 */
export function isMountainBike(activity: ActivityData | null | undefined): boolean {
  if (!activity) return false;
  return MTB_SPORT_TYPES.has((activity as { sport_type?: string }).sport_type ?? '')
    || MTB_SPORT_TYPES.has((activity as { type?: string }).type ?? '');
}

/**
 * MTB multiplier — spec §3.1 "MTB sessions receive additional 1.3x
 * multiplier on top of terrain". Applied to every tier.
 */
export function applyActivityTypeMultiplier(rss: number, activity: ActivityData | null | undefined): number {
  return isMountainBike(activity) ? rss * 1.3 : rss;
}

/**
 * EP zero-power filter — spec §3.2. Drops points where power === 0 AND
 * GPS speed > 5 km/h (coasting). Standalone helper; not wired into the
 * pre-computed-NP write path currently used for activities.
 */
export function filterZeroPowerPoints(
  powerStream: number[],
  speedStreamKmh?: number[],
): number[] {
  if (!Array.isArray(powerStream) || powerStream.length === 0) return [];
  if (!Array.isArray(speedStreamKmh) || speedStreamKmh.length === 0) {
    return powerStream.slice();
  }

  const out: number[] = [];
  const len = Math.min(powerStream.length, speedStreamKmh.length);
  for (let i = 0; i < len; i++) {
    const p = powerStream[i];
    const kmh = speedStreamKmh[i];
    if (p === 0 && kmh > 5) continue;
    out.push(p);
  }
  return out;
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Returns best available TSS estimate with confidence bounds.
 * Cascades: power → HR → RPE → type inference.
 *
 * terrain_class is attached to every tier so downstream writers can
 * persist it uniformly; the multiplier is only applied inside the
 * type-inference tier (the other tiers already reflect climbing load).
 */
export function estimateTSS(
  activity: ActivityData,
  calibration: CalibrationFactors
): TSSEstimate {
  const terrain_class = classifyTerrain(activity.distance_m, activity.total_elevation_m);

  if (activity.normalized_power && activity.ftp) {
    return { ...estimateFromPower(activity), terrain_class };
  }
  if (activity.hr_stream && activity.hr_stream.length > 0 && activity.hr_max && activity.hr_rest) {
    return { ...estimateFromHR(activity, calibration), terrain_class };
  }
  if (activity.avg_hr && activity.hr_max && activity.hr_rest) {
    return { ...estimateFromAvgHR(activity, calibration), terrain_class };
  }
  if (activity.rpe !== undefined && activity.rpe > 0) {
    return { ...estimateFromRPE(activity, calibration), terrain_class };
  }
  return estimateFromType(activity, terrain_class);
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

function estimateFromType(activity: ActivityData, terrain_class: TerrainClass): TSSEstimate {
  const type = activity.workout_type ?? 'endurance';
  const defaults = TYPE_TSS_PER_HOUR[type] ?? TYPE_TSS_PER_HOUR.endurance;
  const hours = activity.duration_seconds / 3600;

  // Elevation bonus: ~1 TSS per 30m of gain
  const elevationBonus = (activity.total_elevation_m ?? 0) / 30;

  // Terrain multiplier — D4 scope; spec §3.1 continuous formula.
  const mult = terrainMultiplier(activity);

  const tss = applyActivityTypeMultiplier(
    round2((defaults.mid * hours + elevationBonus) * mult),
    activity,
  );
  const tss_low = applyActivityTypeMultiplier(
    round2((defaults.low * hours + elevationBonus) * mult),
    activity,
  );
  const tss_high = applyActivityTypeMultiplier(
    round2((defaults.high * hours + elevationBonus) * mult),
    activity,
  );

  return {
    tss,
    tss_low,
    tss_high,
    confidence: 0.40,
    source: 'inferred',
    method_detail: `type=${type}, ${hours.toFixed(1)}h, +${elevationBonus.toFixed(0)} elev bonus, terrain=${terrain_class}`,
    terrain_class,
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
