/**
 * useDeviations Hook
 *
 * Manages plan deviation state: fetches unresolved deviations,
 * handles resolve actions, and loads TSB projections.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  PlanDeviationRow,
  AdjustmentOption,
  ProjectionResult,
  ProjectionState,
} from '../lib/training/types';

interface UseDeviationsReturn {
  deviations: PlanDeviationRow[];
  loading: boolean;
  error: string | null;
  resolveDeviation: (deviationId: string, option: AdjustmentOption) => Promise<void>;
  resolving: boolean;
  projection: ProjectionResult[] | null;
  currentState: ProjectionState | null;
  loadProjection: (days?: number) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDeviations(userId: string | undefined): UseDeviationsReturn {
  const [deviations, setDeviations] = useState<PlanDeviationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [projection, setProjection] = useState<ProjectionResult[] | null>(null);
  const [currentState, setCurrentState] = useState<ProjectionState | null>(null);

  const fetchDeviations = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('plan_deviations')
        .select('*')
        .eq('user_id', userId)
        .is('resolved_at', null)
        .order('deviation_date', { ascending: false })
        .limit(5);

      if (fetchError) throw fetchError;
      setDeviations((data as PlanDeviationRow[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deviations');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDeviations();
  }, [fetchDeviations]);

  const resolveDeviation = useCallback(async (deviationId: string, option: AdjustmentOption) => {
    if (resolving) return;
    setResolving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in again.');
        return;
      }

      const response = await fetch('/api/deviation-resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          deviation_id: deviationId,
          selected_option: option,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to resolve deviation');
      }

      // Remove resolved deviation from local state
      setDeviations(prev => prev.filter(d => d.id !== deviationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve deviation');
    } finally {
      setResolving(false);
    }
  }, [resolving]);

  const loadProjection = useCallback(async (days = 14) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/training-load-projection?days=${days}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) return;

      const result = await response.json();
      setProjection(result.projection ?? null);
      setCurrentState(result.current ?? null);
    } catch {
      // Projection is optional — silently fail
    }
  }, []);

  return {
    deviations,
    loading,
    error,
    resolveDeviation,
    resolving,
    projection,
    currentState,
    loadProjection,
    refresh: fetchDeviations,
  };
}
