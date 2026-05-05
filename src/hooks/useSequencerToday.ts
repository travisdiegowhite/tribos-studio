/**
 * useSequencerToday — Phase 1 hook for the new event-anchored TODAY surface.
 *
 * Polls /api/sequencer-today every 5 minutes (per CLAUDE.md, NO Supabase
 * Realtime). Returns the current prescription, the active block, and the
 * gating status for the SequencerPrescriptionCard component.
 *
 * Must only be rendered when feature flag `event_anchored_planner` is on.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { SessionPrescription } from '../types/training';

interface BlockSummary {
  id: string;
  block_type: string;
  start_date: string;
  end_date: string;
  status: string;
  parent_event_tier: 'A' | 'B' | 'C' | null;
  days_in: number;
  block_total_days: number;
}

interface GatingStatus {
  gated: boolean;
  reason?: string;
}

interface SequencerTodayResult {
  prescription: SessionPrescription | null;
  block: BlockSummary | null;
  gating: GatingStatus;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useSequencerToday(): SequencerTodayResult {
  const { user } = useAuth();
  const [prescription, setPrescription] = useState<SessionPrescription | null>(null);
  const [block, setBlock] = useState<BlockSummary | null>(null);
  const [gating, setGating] = useState<GatingStatus>({ gated: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchToday = useCallback(async () => {
    if (!user?.id) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    try {
      const res = await fetch(
        `/api/sequencer-today?user_id=${encodeURIComponent(user.id)}`,
        { signal: controller.signal }
      );

      if (!res.ok) {
        if (res.status === 404) {
          // No active block — needs init. Surface as a benign null state.
          setPrescription(null);
          setBlock(null);
          setGating({ gated: false });
          setError('not_initialized');
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setPrescription(data.prescription ?? null);
      setBlock(data.block ?? null);
      setGating(data.gating ?? { gated: false });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error('[useSequencerToday] fetch failed:', err);
      setError((err as Error)?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchToday();
    const id = setInterval(fetchToday, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchToday]);

  return {
    prescription,
    block,
    gating,
    loading,
    error,
    refetch: fetchToday,
  };
}
