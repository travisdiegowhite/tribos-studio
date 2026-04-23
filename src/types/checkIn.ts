/**
 * Coach Check-In Domain Types
 *
 * Types for AI-generated coaching check-ins, persona classification,
 * intake interview, and decision tracking.
 */

// ── Persona ──────────────────────────────────────────────────

export type PersonaId = 'hammer' | 'scientist' | 'encourager' | 'pragmatist' | 'competitor';

export interface PersonaDefinition {
  id: PersonaId;
  name: string;
  tagline: string;
  philosophy: string;
  voice: string;
  emphasizes: string;
  deviationStance: string;
  encouragementPattern: string;
  neverSay: string[];
}

export interface PersonaClassification {
  persona: PersonaId;
  confidence: number;
  reasoning: string;
  secondary: PersonaId | null;
}

// ── Intake Interview ─────────────────────────────────────────

export interface IntakeQuestion {
  id: string;
  question: string;
  options: IntakeOption[];
}

export interface IntakeOption {
  label: string;
  value: string;
}

export interface IntakeAnswers {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
}

// ── Check-In ─────────────────────────────────────────────────

export type CheckInStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type MutationType = 'modify' | 'swap' | 'insert_rest' | 'drop' | 'replace';

export interface PlannedMutation {
  type: MutationType;
  target: 'next_quality' | 'tomorrow' | 'next';
  scale_factor?: number;           // For 'modify': 0.5-0.9 (e.g. 0.7 = reduce to 70%)
  replacement?: {                   // For 'replace': what to swap in
    workout_type: string;
    name: string;
    target_tss: number;
    target_duration: number;
  };
}

export interface RecommendationImplication {
  short: string;
  full: string;
}

export interface CheckInRecommendation {
  action: string;
  detail: string;
  reasoning: string;
  planned_mutation: PlannedMutation | null;
  implications: {
    accept: RecommendationImplication;
    dismiss: RecommendationImplication;
  };
}

export interface CheckIn {
  id: string;
  user_id: string;
  activity_id: string;
  persona_id: PersonaId;
  narrative: string;
  deviation_callout: string | null;
  recommendation: CheckInRecommendation | null;
  next_session_purpose: string | null;
  context_snapshot: Record<string, unknown> | null;
  status: CheckInStatus;
  error_message: string | null;
  seen: boolean;
  seen_at: string | null;
  created_at: string;
}

// ── Decisions ────────────────────────────────────────────────

export type DecisionType = 'accept' | 'dismiss';

export interface CheckInDecision {
  id: string;
  user_id: string;
  check_in_id: string;
  decision: DecisionType;
  recommendation_summary: string;
  outcome_notes: string | null;
  decided_at: string;
}

// ── Context Assembly ─────────────────────────────────────────

export interface WeekScheduleEntry {
  day_of_week: number;
  scheduled_date: string | null;
  workout_name: string;
  workout_type: string;
  target_tss: number | null;
  actual_tss: number | null;
  completed: boolean;
}

export interface CheckInContext {
  rider_name: string;
  goal_event: string | null;
  block_name: string;
  block_purpose: string;
  current_week: number;
  total_weeks: number;
  ctl: number | null;
  atl: number | null;
  form: number | null;
  week_schedule: WeekScheduleEntry[];
  last_activity: {
    date: string;
    type: string;
    name: string;
    planned_tss: number | null;
    actual_tss: number | null;
    deviation_percent: number | null;
    duration_minutes: number;
    distance_km: number;
    average_power: number | null;
    normalized_power: number | null;
    average_heartrate: number | null;
    execution_score: number | null;
    execution_rating: string | null;
  };
  decision_history: DecisionHistoryEntry[];
  health: {
    resting_heart_rate: number | null;
    hrv_score: number | null;
    sleep_hours: number | null;
    sleep_quality: number | null;
    energy_level: number | null;
    readiness_score: number | null;
  } | null;
}

export interface DecisionHistoryEntry {
  decision: DecisionType;
  recommendation_summary: string;
  outcome_notes: string | null;
  decided_at: string;
}

// ── AI Output Schema ─────────────────────────────────────────

export interface CheckInAIOutput {
  narrative: string;
  deviation_callout: string | null;
  recommendation: CheckInRecommendation | null;
  next_session_purpose: string;
}

// ── Correction Proposals ─────────────────────────────────────

export type CorrectionOp = 'extend' | 'swap' | 'add' | 'reduce' | 'skip';
export type ProposalOutcome = 'pending' | 'accepted' | 'declined' | 'partial';

export interface CorrectionModification {
  session_id: string;           // sess_ prefix ID used in the anchor
  planned_workout_id?: string;  // resolved full UUID
  scheduled_date?: string;      // YYYY-MM-DD
  op: CorrectionOp;
  delta_minutes?: number;
  new_type?: string;
  new_rss?: number;
  reason: string;
}

export interface CorrectionProposal {
  id: string;
  user_id: string;
  race_goal_id: string | null;
  persona_id: string;
  opener_text: string | null;
  closer_text: string | null;
  modifications: CorrectionModification[];
  current_tfi: number | null;
  projected_tfi_without: number | null;
  projected_tfi_with: number | null;
  target_tfi_min: number | null;
  target_tfi_max: number | null;
  outcome: ProposalOutcome;
  outcome_at: string | null;
  accepted_session_ids: string[];
  generated_at: string;
  created_at: string;
}
