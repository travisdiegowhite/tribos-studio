/**
 * useCoachCheckIn Hook
 *
 * Manages coach check-in state: fetches latest check-in, persona info,
 * handles accept/dismiss decisions, and requests new check-ins.
 *
 * Simplified: check-in request is synchronous (like coach chat).
 * No realtime subscriptions or polling needed.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  CheckIn,
  CheckInDecision,
  PersonaId,
  DecisionType,
} from '../types/checkIn';

interface UseCoachCheckInReturn {
  currentCheckIn: CheckIn | null;
  checkInHistory: CheckIn[];
  loading: boolean;
  persona: PersonaId;
  hasCompletedIntake: boolean;
  makeDecision: (checkInId: string, decision: DecisionType, summary: string) => Promise<void>;
  markSeen: (checkInId: string) => Promise<void>;
  refresh: () => Promise<void>;
  savePersona: (personaId: PersonaId, setBy: 'intake' | 'manual') => Promise<void>;
  currentDecision: CheckInDecision | null;
  requestCheckIn: () => Promise<void>;
  generating: boolean;
  generateError: string | null;
}

export function useCoachCheckIn(userId: string | undefined): UseCoachCheckInReturn {
  const [currentCheckIn, setCurrentCheckIn] = useState<CheckIn | null>(null);
  const [checkInHistory, setCheckInHistory] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [persona, setPersona] = useState<PersonaId>('pragmatist');
  const [hasCompletedIntake, setHasCompletedIntake] = useState(false);
  const [currentDecision, setCurrentDecision] = useState<CheckInDecision | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const [checkInResult, settingsResult, historyResult] = await Promise.all([
        supabase
          .from('coach_check_ins')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from('user_coach_settings')
          .select('coaching_persona, persona_set_by')
          .eq('user_id', userId)
          .maybeSingle(),

        supabase
          .from('coach_check_ins')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const latestCheckIn = checkInResult.data as CheckIn | null;
      setCurrentCheckIn(latestCheckIn);
      setCheckInHistory((historyResult.data || []) as CheckIn[]);

      if (settingsResult.data) {
        const p = settingsResult.data.coaching_persona as PersonaId;
        if (p && p !== 'pending') {
          setPersona(p);
        }
        setHasCompletedIntake(
          settingsResult.data.persona_set_by === 'intake' ||
          settingsResult.data.persona_set_by === 'manual'
        );
      }

      if (latestCheckIn) {
        const { data: decision } = await supabase
          .from('coach_check_in_decisions')
          .select('*')
          .eq('check_in_id', latestCheckIn.id)
          .maybeSingle();
        setCurrentDecision(decision as CheckInDecision | null);
      }
    } catch (error) {
      console.error('Failed to fetch check-in data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const makeDecision = useCallback(async (checkInId: string, decision: DecisionType, summary: string) => {
    if (!userId) return;

    const { data, error } = await supabase
      .from('coach_check_in_decisions')
      .insert({
        user_id: userId,
        check_in_id: checkInId,
        decision,
        recommendation_summary: summary,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to save decision:', error);
      throw error;
    }

    setCurrentDecision(data as CheckInDecision);
  }, [userId]);

  const markSeen = useCallback(async (checkInId: string) => {
    if (!userId) return;

    await supabase
      .from('coach_check_ins')
      .update({ seen: true, seen_at: new Date().toISOString() })
      .eq('id', checkInId);

    setCurrentCheckIn((prev) =>
      prev && prev.id === checkInId
        ? { ...prev, seen: true, seen_at: new Date().toISOString() }
        : prev
    );
  }, [userId]);

  const savePersona = useCallback(async (personaId: PersonaId, setBy: 'intake' | 'manual') => {
    if (!userId) return;

    await supabase
      .from('user_coach_settings')
      .upsert({
        user_id: userId,
        coaching_persona: personaId,
        persona_set_at: new Date().toISOString(),
        persona_set_by: setBy,
      }, { onConflict: 'user_id' });

    setPersona(personaId);
    setHasCompletedIntake(true);
  }, [userId]);

  const requestCheckIn = useCallback(async () => {
    if (!userId || generating) return;

    setGenerating(true);
    setGenerateError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setGenerateError('Please sign in again.');
        setGenerating(false);
        return;
      }

      const response = await fetch('/api/coach-check-in-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        setGenerateError(result.message || 'Failed to request check-in.');
      } else {
        // Check-in is returned directly — update state immediately
        setCurrentCheckIn(result.checkIn as CheckIn);
        setCurrentDecision(null);
        setGenerateError(null);
        // Refresh history in background
        fetchData();
      }
    } catch {
      setGenerateError('Something went wrong. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [userId, generating, fetchData]);

  return {
    currentCheckIn,
    checkInHistory,
    loading,
    persona,
    hasCompletedIntake,
    makeDecision,
    markSeen,
    refresh: fetchData,
    savePersona,
    currentDecision,
    requestCheckIn,
    generating,
    generateError,
  };
}
