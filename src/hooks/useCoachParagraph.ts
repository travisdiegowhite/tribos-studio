/**
 * useCoachParagraph Hook
 *
 * Fetches the Today coach paragraph from /api/fitness-summary with
 * surface='today'. Honors the 4-hour cache + 04:15 local pre-warm cron.
 *
 * On error the hook reports `paragraphState: 'error'` and retries once
 * after a 2-second delay, mirroring the spec's retry behavior in the
 * CoachCard component.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type ParagraphState = 'fresh' | 'cold' | 'loading' | 'error';

export interface CoachParagraphInput {
  /** TFI value (canonical CTL) for the prompt context. */
  tfi: number | null;
  afi: number | null;
  formScore: number | null;
  lastRideRss: number | null;
  ctlDeltaPct: number | null;
}

export interface CoachParagraphTodayContext {
  workoutId: string | null;
  workoutName: string | null;
  workoutType: string | null;
  durationMinutes: number | null;
  phase: string | null;
  weekInPhase: number | null;
  weeksInPhase: number | null;
  weeksRemaining: number | null;
  freshnessWord: string | null;
  raceName: string | null;
  raceType: string | null;
  daysToRace: number | null;
}

export interface UseCoachParagraphReturn {
  paragraph: string | null;
  state: ParagraphState;
  /** Force re-generation even if a cached version exists. */
  refresh: () => Promise<void>;
}

export function useCoachParagraph(
  userId: string | undefined | null,
  metrics: CoachParagraphInput | null,
  todayContext: CoachParagraphTodayContext | null,
): UseCoachParagraphReturn {
  const [paragraph, setParagraph] = useState<string | null>(null);
  const [state, setState] = useState<ParagraphState>('loading');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!userId || !metrics || metrics.tfi == null) return;

    let cancelled = false;

    const run = async (force = false) => {
      setState('loading');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setState('error');
          return;
        }

        const response = await fetch('/api/fitness-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            surface: 'today',
            clientMetrics: {
              tfi: metrics.tfi,
              afi: metrics.afi ?? 0,
              formScore: metrics.formScore ?? 0,
              lastRideRss: metrics.lastRideRss ?? null,
              ctlDeltaPct: metrics.ctlDeltaPct ?? null,
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            todayContext,
            forceRefresh: force,
          }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json() as { summary: string; cached?: boolean };

        if (cancelled) return;
        setParagraph(json.summary);
        setState(json.cached ? 'fresh' : 'cold');
      } catch {
        if (cancelled) return;
        if (retryCount === 0) {
          setRetryCount(1);
          setTimeout(() => { if (!cancelled) run(false); }, 2000);
        } else {
          setState('error');
        }
      }
    };

    run(false);
    return () => { cancelled = true; };
    // We deliberately omit retryCount from deps — it's only used to gate the single retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, metrics?.tfi, metrics?.afi, metrics?.formScore, todayContext?.workoutId, todayContext?.freshnessWord]);

  const refresh = async () => {
    if (!userId || !metrics?.tfi) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setState('loading');
    try {
      const response = await fetch('/api/fitness-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          surface: 'today',
          clientMetrics: {
            tfi: metrics.tfi,
            afi: metrics.afi ?? 0,
            formScore: metrics.formScore ?? 0,
            lastRideRss: metrics.lastRideRss ?? null,
            ctlDeltaPct: metrics.ctlDeltaPct ?? null,
          },
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          todayContext,
          forceRefresh: true,
        }),
      });
      const json = await response.json() as { summary: string };
      setParagraph(json.summary);
      setState('cold');
    } catch {
      setState('error');
    }
  };

  return { paragraph, state, refresh };
}
