/**
 * Reads the user's last 28 days of `training_load_daily` rows and computes:
 *   - latest TFI / AFI / Form Score (canonical-first w/ legacy fallback)
 *   - 28d max TFI and AFI (denominators for the relative bars)
 *   - 4-week TFI delta as a percent (for the TREND cell + fitness word)
 *   - a sparkline series of TFI values for visualization
 *
 * Returns null'd values when the user has no training_load_daily rows yet —
 * the caller renders the empty "Building baseline" state.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export interface TrendData {
  formScore: number | null;
  tfi: number | null;
  afi: number | null;
  tfi28dMax: number | null;
  afi28dMax: number | null;
  trendDeltaPct: number | null;
  sparkline: number[];
}

const EMPTY: TrendData = {
  formScore: null,
  tfi: null,
  afi: null,
  tfi28dMax: null,
  afi28dMax: null,
  trendDeltaPct: null,
  sparkline: [],
};

export interface DailyRow {
  date: string;
  tfi: number | null;
  ctl: number | null;
  afi: number | null;
  atl: number | null;
  form_score: number | null;
  tsb: number | null;
}

/**
 * Pure calculation extracted for unit testing. Accepts rows in DESC order
 * (newest first, the same shape `supabase.order('date', desc).limit(28)`
 * returns) and returns a fully populated `TrendData`.
 */
export function computeTrendData(descRows: DailyRow[]): TrendData {
  if (!Array.isArray(descRows) || descRows.length === 0) return EMPTY;

  const ordered = descRows.slice().reverse();
  const tfis = ordered
    .map((r) => r.tfi ?? r.ctl)
    .filter((v): v is number => typeof v === 'number');
  const afis = ordered
    .map((r) => r.afi ?? r.atl)
    .filter((v): v is number => typeof v === 'number');

  const latest = ordered[ordered.length - 1];
  const latestTfi = latest.tfi ?? latest.ctl ?? null;
  const latestAfi = latest.afi ?? latest.atl ?? null;
  const latestForm = latest.form_score ?? latest.tsb ?? null;

  const tfi28dMax = tfis.length > 0 ? Math.max(...tfis) : null;
  const afi28dMax = afis.length > 0 ? Math.max(...afis) : null;

  let trendDeltaPct: number | null = null;
  if (tfis.length >= 2) {
    const oldest = tfis[0];
    const newest = tfis[tfis.length - 1];
    if (oldest > 0) {
      trendDeltaPct = ((newest - oldest) / oldest) * 100;
    }
  }

  return {
    formScore: latestForm,
    tfi: latestTfi,
    afi: latestAfi,
    tfi28dMax,
    afi28dMax,
    trendDeltaPct,
    sparkline: tfis,
  };
}

export function useTrendDelta(userId: string | null | undefined): {
  data: TrendData;
  loading: boolean;
} {
  const [data, setData] = useState<TrendData>(EMPTY);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setData(EMPTY);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: rows } = await supabase
        .from('training_load_daily')
        .select('date, tfi, ctl, afi, atl, form_score, tsb')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(28);

      if (cancelled) return;

      setData(computeTrendData(Array.isArray(rows) ? (rows as DailyRow[]) : []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { data, loading };
}
