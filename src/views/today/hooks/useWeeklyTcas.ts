/**
 * Reads the user's most recent weekly TCAS (Time-Constrained Adaptation
 * Score) from `weekly_tcas`. Returns null when no week has been computed.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export function useWeeklyTcas(userId: string | null | undefined): {
  tcas: number | null;
  loading: boolean;
} {
  const [tcas, setTcas] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setTcas(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .from('weekly_tcas')
        .select('tcas')
        .eq('user_id', userId)
        .order('week_ending', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      const raw = (data as { tcas: number | null } | null)?.tcas;
      setTcas(typeof raw === 'number' ? raw : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { tcas, loading };
}
