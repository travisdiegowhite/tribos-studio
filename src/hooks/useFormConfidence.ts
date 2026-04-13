/**
 * useFormConfidence Hook
 *
 * Fetches the most recent training_load_daily.fs_confidence for the
 * current user so the StatusBar can gate Form Score display (muted /
 * italic / `~` prefix) when recent TSS estimates are low-confidence.
 *
 * Returns null while loading or when the user has no training_load_daily
 * rows yet. Callers should treat null as "no signal — render normally".
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useFormConfidence(userId: string | undefined | null): number | null {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) {
      setValue(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('training_load_daily')
        .select('fs_confidence')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setValue(null);
        return;
      }
      const raw = (data as { fs_confidence: number | null } | null)?.fs_confidence;
      setValue(raw == null ? null : Number(raw));
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return value;
}
