/**
 * useFormScore Hook
 *
 * Fetches the most recent training_load_daily.form_score (canonical) with
 * a fallback to the legacy `tsb` column for pre-rename rows.
 *
 * Returns the structured snapshot the Today view needs: form_score, tfi,
 * afi, plus the date the row applies to. All values can be null while
 * loading or when the user has no training_load_daily rows yet.
 *
 * Reader policy per CLAUDE.md: canonical-first with legacy fallback.
 * This hook does not write — it's read-only.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface FormScoreSnapshot {
  formScore: number | null;
  tfi: number | null;
  afi: number | null;
  rss: number | null;        // last day's RSS (canonical), legacy tss as fallback
  date: string | null;       // YYYY-MM-DD of the row
  ctlDeltaPct: number | null;
}

export interface UseFormScoreReturn extends FormScoreSnapshot {
  loading: boolean;
}

export function useFormScore(userId: string | undefined | null): UseFormScoreReturn {
  const [snapshot, setSnapshot] = useState<FormScoreSnapshot>({
    formScore: null,
    tfi: null,
    afi: null,
    rss: null,
    date: null,
    ctlDeltaPct: null,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      // Two reads in parallel: today's training_load_daily, and the row
      // ~28 days ago for the ctlDeltaPct (so the fitness-summary endpoint
      // can be passed the same number the Trend card uses).
      const today = new Date();
      const twentyEightAgo = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);
      const cutoffStr = twentyEightAgo.toISOString().split('T')[0];

      const [latestRes, oldRes] = await Promise.all([
        supabase
          .from('training_load_daily')
          .select('form_score, tsb, tfi, ctl, afi, atl, rss, tss, date')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('training_load_daily')
          .select('tfi, ctl, date')
          .eq('user_id', userId)
          .lte('date', cutoffStr)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const latest = latestRes.data as Record<string, number | string | null> | null;
      if (!latest) {
        setSnapshot({ formScore: null, tfi: null, afi: null, rss: null, date: null, ctlDeltaPct: null });
        setLoading(false);
        return;
      }

      const tfi = (latest.tfi as number | null) ?? (latest.ctl as number | null) ?? null;
      const afi = (latest.afi as number | null) ?? (latest.atl as number | null) ?? null;
      const formScore = (latest.form_score as number | null) ?? (latest.tsb as number | null) ?? null;
      const rss = (latest.rss as number | null) ?? (latest.tss as number | null) ?? null;
      const date = (latest.date as string | null) ?? null;

      const oldRow = oldRes.data as { tfi: number | null; ctl: number | null } | null;
      const oldTfi = oldRow?.tfi ?? oldRow?.ctl ?? null;
      const ctlDeltaPct =
        tfi != null && oldTfi != null && oldTfi > 0
          ? ((tfi - oldTfi) / oldTfi) * 100
          : null;

      setSnapshot({ formScore, tfi, afi, rss, date, ctlDeltaPct });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { ...snapshot, loading };
}
