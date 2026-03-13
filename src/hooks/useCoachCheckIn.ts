import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  CoachCheckIn,
  CheckInDecision,
  CheckInDecisionInsert,
  PersonaId,
  IntakeAnswers,
  PersonaClassification,
} from '../types/checkIn';

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

      // Fetch persona and current check-in in parallel
      const [profileResult, checkInResult, latestActivityResult] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('coaching_persona')
          .eq('user_id', userId)
          .single(),
        supabase
          .from('coach_check_ins')
          .select('*')
          .eq('user_id', userId)
          .eq('is_current', true)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('activities')
          .select('id, start_date')
          .eq('user_id', userId)
          .order('start_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (profileResult.data) {
        setPersona(profileResult.data.coaching_persona as PersonaId | null);
      }

      if (checkInResult.data) {
        setCheckIn(checkInResult.data as CoachCheckIn);
      }

      // Determine if we need a new check-in
      const latestActivity = latestActivityResult.data;
      const currentCheckIn = checkInResult.data;

      if (latestActivity && (!currentCheckIn || currentCheckIn.activity_id !== latestActivity.id)) {
        setNeedsGeneration(true);
      } else {
        setNeedsGeneration(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load check-in');
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

  // Classify persona via intake interview
  const classifyPersona = useCallback(async (answers: IntakeAnswers): Promise<PersonaClassification | null> => {
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Classification failed');
      }

      const classification = await response.json() as PersonaClassification;
      setPersona(classification.persona);
      return classification;
    } catch (err: any) {
      setError(err.message || 'Failed to classify persona');
      return null;
    }
  }, []);

  // Manually set persona
  const setPersonaManual = useCallback(async (personaId: PersonaId): Promise<boolean> => {
    if (!userId) return false;

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
      setPersona(personaId);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to update persona');
      return false;
    }
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
