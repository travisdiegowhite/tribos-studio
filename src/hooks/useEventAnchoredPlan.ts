/**
 * useEventAnchoredPlan — Phase 2 hook for the event-anchored sequencer.
 *
 * Reads the user's active sequence (if any), the horizon race goal, and the
 * full block chain. Provides an `anchorPlan(raceGoalId)` mutation that calls
 * /api/sequencer-event-anchored-init and refreshes local state.
 *
 * Like useSequencerToday: polls Supabase REST (no Realtime per CLAUDE.md
 * connection-hygiene rules); refresh is on-demand after mutations.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export interface AnchoredBlock {
  id: string;
  block_type: string;
  start_date: string;
  end_date: string;
  status: 'planned' | 'active' | 'completed' | 'skipped';
  parent_event_tier: 'A' | 'B' | 'C' | null;
}

export interface HorizonEvent {
  id: string;
  name: string;
  race_date: string;
  priority: 'A' | 'B' | 'C';
  status: string;
}

export interface AnchorablePlan {
  sequence_id: string | null;
  horizon_event: HorizonEvent | null;
  blocks: AnchoredBlock[];
  loading: boolean;
  error: string | null;
  upcomingRaces: HorizonEvent[];
  refetch: () => Promise<void>;
  anchorPlan: (raceGoalId: string, replace?: boolean) => Promise<AnchorResult>;
}

export interface AnchorResult {
  ok: boolean;
  already_anchored?: boolean;
  sequence_id?: string;
  validation_status?: 'valid' | 'warning' | 'conflict';
  validation_messages?: Array<{
    level: 'info' | 'warning' | 'error';
    code: string;
    message: string;
  }>;
  error?: string;
  detail?: string;
}

export function useEventAnchoredPlan(): AnchorablePlan {
  const { user } = useAuth() as { user: { id: string } | null };
  const userId = user?.id ?? null;

  const [sequenceId, setSequenceId] = useState<string | null>(null);
  const [horizonEvent, setHorizonEvent] = useState<HorizonEvent | null>(null);
  const [blocks, setBlocks] = useState<AnchoredBlock[]>([]);
  const [upcomingRaces, setUpcomingRaces] = useState<HorizonEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      // 1. Active sequence + horizon event
      const { data: seq } = await supabase
        .from('sequences')
        .select('id, horizon_event_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let horizon: HorizonEvent | null = null;
      let chain: AnchoredBlock[] = [];

      if (seq?.id) {
        setSequenceId(seq.id);

        if (seq.horizon_event_id) {
          const { data: race } = await supabase
            .from('race_goals')
            .select('id, name, race_date, priority, status')
            .eq('id', seq.horizon_event_id)
            .maybeSingle();
          if (race) {
            horizon = {
              id: race.id,
              name: race.name,
              race_date: race.race_date,
              priority: (race.priority ?? 'B') as 'A' | 'B' | 'C',
              status: race.status,
            };
          }
        }

        const { data: blockRows } = await supabase
          .from('block_instances')
          .select(
            'id, block_type, start_date, end_date, status, parent_event_tier'
          )
          .eq('sequence_id', seq.id)
          .order('start_date', { ascending: true });

        chain = (blockRows ?? []).map((b) => ({
          id: b.id,
          block_type: b.block_type,
          start_date: b.start_date,
          end_date: b.end_date,
          status: b.status,
          parent_event_tier: b.parent_event_tier ?? null,
        }));
      } else {
        setSequenceId(null);
      }

      setHorizonEvent(horizon);
      setBlocks(chain);

      // 2. Available upcoming races for anchoring
      const today = new Date().toISOString().slice(0, 10);
      const { data: races } = await supabase
        .from('race_goals')
        .select('id, name, race_date, priority, status')
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .gte('race_date', today)
        .order('race_date', { ascending: true })
        .limit(10);

      setUpcomingRaces(
        (races ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          race_date: r.race_date,
          priority: (r.priority ?? 'B') as 'A' | 'B' | 'C',
          status: r.status,
        }))
      );
    } catch (err) {
      console.error('[useEventAnchoredPlan] fetch failed:', err);
      setError((err as Error)?.message ?? 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const anchorPlan = useCallback(
    async (raceGoalId: string, replace = false): Promise<AnchorResult> => {
      if (!userId) return { ok: false, error: 'not_authenticated' };
      try {
        const res = await fetch('/api/sequencer-event-anchored-init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, race_goal_id: raceGoalId, replace }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data?.error, detail: data?.detail };
        }
        await fetchPlan();
        return data as AnchorResult;
      } catch (err) {
        return { ok: false, error: (err as Error)?.message ?? 'request_failed' };
      }
    },
    [userId, fetchPlan]
  );

  return {
    sequence_id: sequenceId,
    horizon_event: horizonEvent,
    blocks,
    upcomingRaces,
    loading,
    error,
    refetch: fetchPlan,
    anchorPlan,
  };
}
