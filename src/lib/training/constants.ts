/**
 * Training Load & Deviation Adjustment — Constants
 *
 * Central constants for TFI/AFI/FS math, deviation thresholds,
 * and RSS estimation defaults.
 */

// ── Exponential Moving Average time constants ────────────────────────────────
export const TFI_TIME_CONSTANT = 42;   // days — Training Fitness Index (long-term)
export const AFI_TIME_CONSTANT = 7;    // days — Acute Fatigue Index (short-term)

// ── Form Score thresholds for session readiness ─────────────────────────────
export const QUALITY_FS_THRESHOLD = -15;  // below this, interval quality degrades
export const RACE_FS_TARGET_LOW = 5;      // optimal race-day FS window lower bound
export const RACE_FS_TARGET_HIGH = 20;    // optimal race-day FS window upper bound

// ── Deviation detection thresholds ───────────────────────────────────────────
export const DEVIATION_MIN_DELTA = 15;     // TSS — smaller deviations ignored
export const DEVIATION_MIN_RATIO = 0.25;   // 25% over planned

// ── Adjustment strategy parameters ──────────────────────────────────────────
export const MODIFY_FACTOR = 0.70;         // trim quality session to 70%
export const EASY_DAY_DEFAULT_TSS = 35;    // used when no planned TSS for a day
export const SWAP_OFFSET_DAYS = 2;         // days to push quality session forward

// ── Calibration ──────────────────────────────────────────────────────────────
export const CALIBRATION_DECAY = 0.85;     // weight given to rolling average vs. new observation
export const CALIBRATION_HALFLIFE = 42;    // days — roughly 6 weeks

export const DEFAULT_CALIBRATION = {
  trimp_to_tss: 0.85,
  srpe_to_tss: 0.55,
  sample_count: 0,
} as const;

// ── Type-based TSS-per-hour defaults ─────────────────────────────────────────
export const TYPE_TSS_PER_HOUR: Record<string, { low: number; mid: number; high: number }> = {
  recovery:  { low: 22, mid: 30, high: 38 },
  endurance: { low: 38, mid: 48, high: 58 },
  tempo:     { low: 58, mid: 68, high: 78 },
  sweet_spot: { low: 65, mid: 76, high: 88 },
  threshold: { low: 72, mid: 85, high: 98 },
  vo2max:    { low: 88, mid: 105, high: 122 },
  anaerobic: { low: 95, mid: 115, high: 135 },
  race:      { low: 75, mid: 100, high: 130 },
};

// ── Cardiac drift correction ─────────────────────────────────────────────────
export const CARDIAC_DRIFT_THRESHOLD_SECONDS = 5400; // 90 minutes
export const CARDIAC_DRIFT_FACTOR = 0.92;

// ── HR zone thresholds (Karvonen % of heart rate reserve) ────────────────────
export const HR_ZONE_THRESHOLDS = [0.50, 0.60, 0.70, 0.80] as const;
