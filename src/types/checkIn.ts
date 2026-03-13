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

export interface RecommendationImplication {
  short: string;
  full: string;
}

export interface CheckInRecommendation {
  action: string;
  detail: string;
  reasoning: string;
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
