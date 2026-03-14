import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  CoachCheckIn,
  CheckInDecisionInsert,
  PersonaId,
  IntakeAnswers,
  PersonaClassification,
} from '../types/checkIn';

const PERSONA_STORAGE_KEY = 'tribos_coaching_persona';

interface UseCoachCheckInOptions {
  userId: string | null;
}

interface UseCoachCheckInReturn {
  // State
  checkIn: CoachCheckIn | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
  persona: PersonaId | null;
  hasPersona: boolean;
  needsGeneration: boolean;

  // Actions
  generateCheckIn: (activityId?: string) => Promise<void>;
  submitDecision: (decision: CheckInDecisionInsert) => Promise<boolean>;
  classifyPersona: (answers: IntakeAnswers) => Promise<PersonaClassification | null>;
  setPersonaManual: (personaId: PersonaId) => Promise<boolean>;
  loadCheckIn: () => Promise<void>;
}

/**
 * Deterministic client-side persona classification fallback.
 * Used when the API classification fails (network, rate limit, parse error).
 * Maps intake answers to persona signals using the voice bible's signal mappings.
 */
function classifyPersonaLocally(answers: IntakeAnswers): PersonaClassification {
  const scores: Record<PersonaId, number> = {
    hammer: 0,
    scientist: 0,
    encourager: 0,
    pragmatist: 0,
    competitor: 0,
  };

  // Q1: missed workout response
  const a1 = answers.answer_1.toLowerCase();
  if (a1.includes('tell me what to do next')) { scores.pragmatist += 2; scores.hammer += 1; }
  if (a1.includes('understand why')) { scores.scientist += 2; scores.competitor += 1; }
  if (a1.includes('okay') || a1.includes('move on')) { scores.encourager += 2; }
  if (a1.includes('accountable')) { scores.hammer += 2; scores.competitor += 1; }

  // Q2: season goal
  const a2 = answers.answer_2.toLowerCase();
  if (a2.includes('race') || a2.includes('pr') || a2.includes('podium')) { scores.competitor += 2; scores.hammer += 1; }
  if (a2.includes('sustainable') || a2.includes('habit')) { scores.encourager += 2; scores.pragmatist += 1; }
  if (a2.includes('physiology') || a2.includes('optimize')) { scores.scientist += 2; }
  if (a2.includes('complete') || a2.includes('finish')) { scores.pragmatist += 2; scores.encourager += 1; }

  // Q3: response to hard weeks
  const a3 = answers.answer_3.toLowerCase();
  if (a3.includes('push through')) { scores.hammer += 2; }
  if (a3.includes('data') || a3.includes('assess') || a3.includes('adjust')) { scores.scientist += 2; }
  if (a3.includes('why i started') || a3.includes('remind')) { scores.encourager += 2; }
  if (a3.includes('realistic') || a3.includes('figure out')) { scores.pragmatist += 2; }
  if (a3.includes('race day') || a3.includes('compete')) { scores.competitor += 2; }

  // Q4: weekly hours (contextual weight)
  const a4 = answers.answer_4.toLowerCase();
  if (a4.includes('under 6')) { scores.encourager += 1; scores.pragmatist += 1; }
  if (a4.includes('10+') || a4.includes('10 ')) { scores.hammer += 1; scores.scientist += 1; scores.competitor += 1; }

  // Q5: what a coach provides
  const a5 = answers.answer_5.toLowerCase();
  if (a5.includes('honest') || a5.includes('accountable')) { scores.hammer += 2; }
  if (a5.includes('why') || a5.includes('explains')) { scores.scientist += 2; }
  if (a5.includes('believes') || a5.includes('believe')) { scores.encourager += 2; }
  if (a5.includes('real life') || a5.includes('works with')) { scores.pragmatist += 2; }
  if (a5.includes('prize') || a5.includes('eyes on')) { scores.competitor += 2; }

  // Find the winner
  const sorted = (Object.entries(scores) as [PersonaId, number][]).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];
  const totalPoints = Object.values(scores).reduce((s, v) => s + v, 0) || 1;
  const confidence = Math.min(top[1] / totalPoints * 2, 1); // scale to 0-1

  return {
    persona: top[0],
    confidence: Math.round(confidence * 100) / 100,
    reasoning: `Based on your answers, ${top[0] === 'hammer' ? 'The Hammer' : top[0] === 'scientist' ? 'The Scientist' : top[0] === 'encourager' ? 'The Encourager' : top[0] === 'pragmatist' ? 'The Pragmatist' : 'The Competitor'} best matches your coaching preferences.`,
    secondary: confidence < 0.75 ? second[0] : null,
  };
}

export function useCoachCheckIn({ userId }: UseCoachCheckInOptions): UseCoachCheckInReturn {
  const [checkIn, setCheckIn] = useState<CoachCheckIn | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaId | null>(null);
  const [needsGeneration, setNeedsGeneration] = useState(false);

  // Load current check-in and persona
  const loadCheckIn = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check localStorage first for persona (fallback if DB column doesn't exist yet)
      const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as PersonaId | null;

      // Fetch persona from DB — but treat errors gracefully (column may not exist yet)
      let dbPersona: PersonaId | null = null;
      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('coaching_persona')
          .eq('user_id', userId)
          .single();
        if (profileData?.coaching_persona) {
          dbPersona = profileData.coaching_persona as PersonaId;
        }
      } catch {
        // Column doesn't exist yet — not an error, just means migration hasn't run
      }

      // DB takes precedence, then localStorage
      const resolvedPersona = dbPersona || storedPersona;
      setPersona(resolvedPersona);

      // Fetch current check-in — treat errors gracefully (table may not exist yet)
      let currentCheckIn: CoachCheckIn | null = null;
      try {
        const { data: checkInData } = await supabase
          .from('coach_check_ins')
          .select('*')
          .eq('user_id', userId)
          .eq('is_current', true)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (checkInData) {
          currentCheckIn = checkInData as CoachCheckIn;
        }
      } catch {
        // Table doesn't exist yet — not an error
      }
      setCheckIn(currentCheckIn);

      // Fetch latest activity to determine if we need a new check-in
      const { data: latestActivity } = await supabase
        .from('activities')
        .select('id, start_date')
        .eq('user_id', userId)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestActivity && (!currentCheckIn || currentCheckIn.activity_id !== latestActivity.id)) {
        setNeedsGeneration(true);
      } else {
        setNeedsGeneration(false);
      }
    } catch (err: any) {
      // Only set error for truly unexpected failures, not schema mismatches
      console.warn('Coach check-in load warning:', err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadCheckIn();
  }, [loadCheckIn]);

  // Generate a new check-in
  const generateCheckIn = useCallback(async (activityId?: string) => {
    if (!userId) return;

    try {
      setGenerating(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/coach-check-in-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ activityId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate check-in');
      }

      const data = await response.json();
      setCheckIn(data.check_in as CoachCheckIn);
      setNeedsGeneration(false);
    } catch (err: any) {
      setError(err.message || 'Failed to generate check-in');
    } finally {
      setGenerating(false);
    }
  }, [userId]);

  // Submit an accept/dismiss decision
  const submitDecision = useCallback(async (decision: CheckInDecisionInsert): Promise<boolean> => {
    if (!userId) return false;

    try {
      const { error: insertError } = await supabase
        .from('coach_check_in_decisions')
        .insert({
          ...decision,
          user_id: userId,
        });

      if (insertError) throw insertError;
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to save decision');
      return false;
    }
  }, [userId]);

  // Classify persona via intake interview (with client-side fallback)
  const classifyPersona = useCallback(async (answers: IntakeAnswers): Promise<PersonaClassification | null> => {
    let classification: PersonaClassification | null = null;

    // Try API classification first
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/coach-classify-persona', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ answers }),
      });

      if (response.ok) {
        classification = await response.json() as PersonaClassification;
      }
    } catch {
      // API failed — will use client-side fallback below
    }

    // Fallback: classify locally if API failed
    if (!classification) {
      classification = classifyPersonaLocally(answers);

      // Try to save to DB via direct update (may fail if column doesn't exist)
      try {
        await supabase
          .from('user_profiles')
          .update({
            coaching_persona: classification.persona,
            coaching_persona_set_at: new Date().toISOString(),
            coaching_persona_set_by: 'intake',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId!);
      } catch {
        // DB save failed — localStorage will persist it
      }
    }

    // Always persist to localStorage as backup
    localStorage.setItem(PERSONA_STORAGE_KEY, classification.persona);
    setPersona(classification.persona);
    return classification;
  }, [userId]);

  // Manually set persona
  const setPersonaManual = useCallback(async (personaId: PersonaId): Promise<boolean> => {
    if (!userId) return false;

    // Always save to localStorage
    localStorage.setItem(PERSONA_STORAGE_KEY, personaId);
    setPersona(personaId);

    // Try DB save (may fail if column doesn't exist)
    try {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          coaching_persona: personaId,
          coaching_persona_set_at: new Date().toISOString(),
          coaching_persona_set_by: 'manual',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;
    } catch {
      // DB save failed — localStorage has it
    }

    return true;
  }, [userId]);

  return {
    checkIn,
    loading,
    generating,
    error,
    persona,
    hasPersona: persona !== null,
    needsGeneration,
    generateCheckIn,
    submitDecision,
    classifyPersona,
    setPersonaManual,
    loadCheckIn,
  };
}
