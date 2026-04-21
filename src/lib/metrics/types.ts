/**
 * Proprietary Metrics — Shared Type Definitions
 *
 * Types for EFI, TWL, and TCAS metric computation, display, and storage.
 */
export type { MetricColor, MetricTranslation } from '../fitness/types';

// ─── Score color bands (spec: brand/display conventions) ─────────────────────

export const SCORE_COLORS = {
  optimal:  { bg: '#2A8C82', text: '#fff' },  // 80–100
  moderate: { bg: '#C49A0A', text: '#fff' },  // 60–79
  low:      { bg: '#D4600A', text: '#fff' },  // 40–59
  alert:    { bg: '#C43C2A', text: '#fff' },  // 0–39
} as const;

export type ScoreBand = keyof typeof SCORE_COLORS;

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 'optimal';
  if (score >= 60) return 'moderate';
  if (score >= 40) return 'low';
  return 'alert';
}

// ─── EFI types ───────────────────────────────────────────────────────────────

export interface ZoneDistribution {
  Z1: number; Z2: number; Z3: number; Z4: number; Z5: number;
}

export interface EFIInputs {
  plannedTSS: number;
  actualTSS: number;
  plannedZones: ZoneDistribution;
  actualZones: ZoneDistribution;
  rollingSessionsPlanned: number[];
  rollingSessionsActual: number[];
}

export interface EFIResult {
  efi: number;      // 0–100
  vf: number;       // 0–1
  ifs: number;      // 0–1
  cf: number;       // 0–1
  vfDebug: { r: number };
  ifsDebug: { D: number; maxD: number };
}

// ─── TWL types ───────────────────────────────────────────────────────────────

export interface TWLInputs {
  baseTSS: number;
  elevationGainM: number;
  rideDurationHours: number;
  gvi: number;
  meanElevationM: number;
}

export interface TWLResult {
  twl: number;
  baseTSS: number;
  mTerrain: number;
  vam: number;
  vamNorm: number;
  alphaComponent: number;
  betaComponent: number;
  gammaComponent: number;
  overagePercent: number;
}

// ─── TCAS types ──────────────────────────────────────────────────────────────

export interface TCASSixWeekWindow {
  ctlNow: number;
  ctl6wAgo: number;
  avgWeeklyHours: number;
  yearsTraining: number;
  efNow: number;
  ef6wAgo: number;
  paHrNow: number;
  paHr6wAgo: number;
  p20minNow: number;
  p20min6wAgo: number;
}

export interface TCASResult {
  tcas: number;
  he: number;
  aq: number;
  taa: number;
  fv: number;
  eft: number;
  adi: number;
  ppd: number;
}

// ─── FAR types ───────────────────────────────────────────────────────────────

export type FARZone = 'detraining' | 'maintaining' | 'building' | 'overreaching' | 'danger';

export type FARTreatment = 'normal' | 'caveat' | 'warning' | 'suppress';

export type FARMomentumFlag = 'accelerating' | 'steady' | 'decelerating';

export interface FARGapAssessment {
  gapDays: number;
  treatment: FARTreatment;
  confidence: number;
  boundaryGap: boolean;
}

// Minimal shape expected from training_load_daily rows
export interface TrainingLoadDailyRow {
  date: string;
  tfi: number | null;
  rss_source: string | null;
}

export interface FARResult {
  score: number | null;
  score_7d: number | null;
  tfi_delta_28d: number | null;
  weekly_rate: number | null;
  zone: FARZone | null;
  zone_label: string;
  momentum_flag: FARMomentumFlag;
  personal_ceiling_weekly_rate: number;
  gap_days_in_window: number;
  confidence: number;
  treatment: FARTreatment;
}
