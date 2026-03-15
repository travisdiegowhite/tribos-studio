/**
 * useCoachCheckIn Hook
 *
 * Manages coach check-in state: fetches latest check-in, persona info,
 * handles accept/dismiss decisions, and subscribes to real-time updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const pendingCheckInIdRef = useRef<string | null>(null);

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

  // Subscribe to real-time updates for new check-ins
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`check-ins-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'coach_check_ins',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newRow = payload.new as CheckIn;
          if (newRow?.status === 'completed') {
            pendingCheckInIdRef.current = null;
            setGenerating(false);
            setGenerateError(null);
            fetchData();
          } else if (newRow?.status === 'failed') {
            pendingCheckInIdRef.current = null;
            setGenerating(false);
            setGenerateError('Check-in generation failed. Try again later.');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchData]);

  // Timeout fallback: if realtime never fires, poll the check-in status directly
  useEffect(() => {
    if (!generating) return;

    const pollId = setTimeout(async () => {
      const checkInId = pendingCheckInIdRef.current;
      if (!checkInId || !generating) return;

      const { data } = await supabase
        .from('coach_check_ins')
        .select('id, status, error_message')
        .eq('id', checkInId)
        .maybeSingle();

      if (data?.status === 'completed') {
        pendingCheckInIdRef.current = null;
        setGenerating(false);
        setGenerateError(null);
        fetchData();
      } else if (data?.status === 'failed') {
        pendingCheckInIdRef.current = null;
        setGenerating(false);
        setGenerateError(data.error_message || 'Check-in generation failed.');
      }
      // If still pending/processing, keep waiting — hard timeout below will catch it
    }, 30_000);

    const hardTimeoutId = setTimeout(() => {
      if (pendingCheckInIdRef.current) {
        pendingCheckInIdRef.current = null;
        setGenerating(false);
        setGenerateError('Check-in generation timed out. Please try again.');
      }
    }, 90_000);

    return () => {
      clearTimeout(pollId);
      clearTimeout(hardTimeoutId);
    };
  }, [generating, fetchData]);

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
        setGenerating(false);
      } else {
        // Store check-in ID for timeout polling fallback
        pendingCheckInIdRef.current = result.checkInId || null;
      }
      // On success, stay in generating state — real-time subscription will clear it
    } catch {
      setGenerateError('Something went wrong. Please try again.');
      setGenerating(false);
    }
  }, [userId, generating]);

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
