export type PersonaId = 'hammer' | 'scientist' | 'encourager' | 'pragmatist' | 'competitor';
export type PersonaSetBy = 'intake' | 'manual';
export type CheckInDecisionType = 'accept' | 'dismiss';

export interface CheckInRecommendation {
  action: string;
  detail: string;
  reasoning: string;
  implications: {
    accept: { short: string; full: string };
    dismiss: { short: string; full: string };
  };
}

export interface CheckInAIOutput {
  narrative: string;
  deviation_callout: string | null;
  recommendation: CheckInRecommendation | null;
  next_session_purpose: string;
}

export interface CoachCheckIn {
  id: string;
  user_id: string;
  activity_id: string | null;
  persona_id: PersonaId;
  narrative: string;
  deviation_callout: string | null;
  recommendation: CheckInRecommendation | null;
  next_session_purpose: string;
  is_current: boolean;
  generated_at: string;
  created_at: string;
}

export interface CoachCheckInInsert {
  user_id: string;
  activity_id?: string | null;
  persona_id: PersonaId;
  narrative: string;
  deviation_callout?: string | null;
  recommendation?: CheckInRecommendation | null;
  next_session_purpose: string;
}

export interface CheckInDecision {
  id: string;
  user_id: string;
  check_in_id: string;
  decision: CheckInDecisionType;
  recommendation_summary: string;
  decided_at: string;
  outcome_notes: string | null;
}

export interface CheckInDecisionInsert {
  user_id: string;
  check_in_id: string;
  decision: CheckInDecisionType;
  recommendation_summary: string;
}

export interface PersonaClassification {
  persona: PersonaId;
  confidence: number;
  reasoning: string;
  secondary: PersonaId | null;
}

export interface IntakeAnswers {
  answer_1: string;
  answer_2: string;
  answer_3: string;
  answer_4: string;
  answer_5: string;
}

export interface CoachPersona {
  id: PersonaId;
  name: string;
  subtitle: string;
  philosophy: string;
  voice: string;
  emphasizes: string;
  deviationStance: string;
  neverSay: string[];
  acknowledgments: {
    accept: string[];
    dismiss: string[];
  };
}
