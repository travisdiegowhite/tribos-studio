/**
 * useActivation Hook
 * Manages user activation/onboarding progress state.
 * Fetches from user_activation table and provides methods to
 * complete steps and dismiss the guide.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export type ActivationStepKey =
  | 'connect_device'
  | 'first_sync'
  | 'first_insight'
  | 'first_route'
  | 'first_plan';

interface ActivationStepData {
  completed: boolean;
  completed_at: string | null;
}

interface ActivationSteps {
  connect_device: ActivationStepData;
  first_sync: ActivationStepData;
  first_insight: ActivationStepData;
  first_route: ActivationStepData;
  first_plan: ActivationStepData;
}

interface ActivationRecord {
  id: string;
  user_id: string;
  steps: ActivationSteps;
  guide_dismissed: boolean;
  guide_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

const TOTAL_STEPS = 5;

export function useActivation(userId: string | undefined) {
  const [activation, setActivation] = useState<ActivationRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActivation = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_activation')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // Table might not exist yet or no record
        if (error.code !== 'PGRST116') {
          console.error('Failed to fetch activation:', error);
        }
        setActivation(null);
      } else {
        setActivation(data);
      }
    } catch {
      setActivation(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchActivation();
  }, [fetchActivation]);

  const completedCount = useMemo(() => {
    if (!activation?.steps) return 0;
    return Object.values(activation.steps).filter((s) => s.completed).length;
  }, [activation]);

  const isComplete = completedCount === TOTAL_STEPS;
  const isDismissed = activation?.guide_dismissed ?? false;

  const completeStep = useCallback(
    async (step: ActivationStepKey) => {
      if (!userId || !activation) return;

      const steps = { ...activation.steps };
      if (steps[step]?.completed) return;

      steps[step] = {
        completed: true,
        completed_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('user_activation')
        .update({ steps, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (!error) {
        setActivation((prev) => (prev ? { ...prev, steps } : prev));
      }
    },
    [userId, activation]
  );

  const dismissGuide = useCallback(async () => {
    if (!userId) return;

    const { error } = await supabase
      .from('user_activation')
      .update({
        guide_dismissed: true,
        guide_dismissed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (!error) {
      setActivation((prev) =>
        prev
          ? {
              ...prev,
              guide_dismissed: true,
              guide_dismissed_at: new Date().toISOString(),
            }
          : prev
      );
    }
  }, [userId]);

  return {
    activation,
    loading,
    completedCount,
    totalSteps: TOTAL_STEPS,
    isComplete,
    isDismissed,
    completeStep,
    dismissGuide,
    refetch: fetchActivation,
    setActivation,
  };
}
