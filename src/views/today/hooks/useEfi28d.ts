/**
 * Reads the user's most recent 28-day Execution Fidelity Index from
 * `activity_efi`. Returns null until a row exists (a fresh user with no
 * planned-then-executed activity has nothing to score).
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export function useEfi28d(userId: string | null | undefined): {
  efi28d: number | null;
  loading: boolean;
} {
  const [efi28d, setEfi28d] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setEfi28d(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .from('activity_efi')
        .select('efi_28d')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      const raw = (data as { efi_28d: number | null } | null)?.efi_28d;
      setEfi28d(typeof raw === 'number' ? raw : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { efi28d, loading };
}
