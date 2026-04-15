/**
 * Training Load & Deviation Adjustment — Type Definitions
 */

// ── TSS Estimation ───────────────────────────────────────────────────────────

export type TSSSource = 'power' | 'hr' | 'rpe' | 'inferred';

export type TerrainClass = 'flat' | 'rolling' | 'hilly' | 'mountainous';

export interface TSSEstimate {
  tss: number;
  tss_low: number;
  tss_high: number;
  confidence: number; // 0.0–1.0
  source: TSSSource;
  method_detail: string;
  terrain_class?: TerrainClass;
}

export interface ActivityData {
  duration_seconds: number;
  avg_power?: number;
  normalized_power?: number;
  ftp?: number;
  hr_stream?: number[];
  hr_max?: number;
  hr_rest?: number;
  avg_hr?: number;
  rpe?: number;              // 1–10 Foster scale
  workout_type?: string;     // 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'race'
  avg_speed_ms?: number;
  total_elevation_m?: number;
  distance_m?: number;       // total distance in meters — used for terrain classification
  // Spec §3.1 inputs for terrainMultiplier (continuous formula).
  // Pre-computed at ingestion when a grade stream is available;
  // falls back to distance/elevation approximations otherwise.
  average_gradient_percent?: number;
  percent_above_6_percent?: number;
  // MTB detection (spec §3.1 1.3× multiplier). Tribos normalizes
  // provider enums to Strava's MountainBikeRide at ingestion.
  sport_type?: string;
  type?: string;
}

export interface CalibrationFactors {
  trimp_to_tss: number;
  srpe_to_tss: number;
  sample_count: number;
}

// ── Form Score Projection ────────────────────────────────────────────────────

export interface DailyLoad {
  date: string;         // ISO date
  rss: number;
  is_quality: boolean;
  session_type?: string;
}

export interface ProjectionState {
  tfi: number;
  afi: number;
  formScore: number;
}

export interface ProjectionResult {
  day: string;
  state: ProjectionState;
  is_quality: boolean;
  fs_zone: FSZone;
}

export type FSZone = 'race_ready' | 'building' | 'heavy_load' | 'overreached';

export interface AdjustmentProjections {
  planned: number;       // FS if deviation hadn't happened (baseline)
  no_adjust: number;     // FS with deviation, no schedule changes
  modify: number;        // FS if next quality session trimmed 30%
  swap: number;          // FS if quality session moved +2 days
  insert_rest: number;   // FS if a zero-day inserted before quality session
}

export type AdjustmentOption = 'no_adjust' | 'modify' | 'swap' | 'insert_rest' | 'drop';

// ── Deviation Detection ──────────────────────────────────────────────────────

export type DeviationType = 'intensity_upgrade' | 'volume_upgrade' | 'type_substitution';

export interface PlannedWorkoutRef {
  date: string;
  tss: number;
  type: string;
  is_quality: boolean;
  label: string;
}

export interface DeviationImpact {
  intervention_needed: boolean;
  urgency: 'high' | 'medium' | 'low' | 'none';
  fs_gap: number;
  recommended_option: AdjustmentOption;
}

export interface DeviationAnalysis {
  has_deviation: boolean;
  deviation_type?: DeviationType;
  severity_score?: number;
  tss_estimate?: TSSEstimate;
  adjustment_options?: AdjustmentProjections;
  impact?: DeviationImpact;
}

// ── Coach Persona Ranking ────────────────────────────────────────────────────

export type CoachPersona = 'hammer' | 'scientist' | 'encourager' | 'pragmatist' | 'competitor';

export interface RankedOption {
  option: AdjustmentOption;
  score: number;
  rationale: string;
}

export interface RankingContext {
  fsGap: number;
  urgency: string;
  daysToQuality: number;
  swapFeasible: boolean;
  isNearRace: boolean;
}

// ── Fatigue Check-in ─────────────────────────────────────────────────────────

export interface FatigueCheckin {
  leg_feel: number;    // 1–5
  energy: number;      // 1–5
  motivation: number;  // 1–5
  hrv_status?: string;
  notes?: string;
}

// ── Database Row Types ───────────────────────────────────────────────────────

export interface TrainingLoadDailyRow {
  id: string;
  user_id: string;
  date: string;
  tss: number | null;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  tss_source: TSSSource | null;
  confidence: number | null;
  terrain_class: TerrainClass | null;
  created_at: string;
}

export interface PlanDeviationRow {
  id: string;
  user_id: string;
  activity_id: string | null;
  deviation_date: string;
  planned_tss: number | null;
  actual_tss: number | null;
  tss_delta: number | null;
  deviation_type: DeviationType | null;
  severity_score: number | null;
  options_json: AdjustmentProjections | null;
  selected_option: AdjustmentOption | null;
  resolved_at: string | null;
  created_at: string;
}

export interface FatigueCalibrationRow {
  id: string;
  user_id: string;
  trimp_to_tss: number;
  srpe_to_tss: number;
  sample_count: number;
  last_updated: string;
}
