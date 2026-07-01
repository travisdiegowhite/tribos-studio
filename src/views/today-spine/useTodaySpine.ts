/**
 * useTodaySpine — binds the Training-Arc Today to one `SpineData` object.
 *
 * One-shot fetch on mount via getTodaySpine() (no Realtime, per the connection
 * hygiene rules). Mirrors the loading/return shape of the glance's useToday().
 */

import { useEffect, useState } from 'react';
import { getTodaySpine } from './getTodaySpine';
import type { SpineData } from './types';

export interface UseTodaySpineResult {
  loading: boolean;
  data: SpineData | null;
  error: string | null;
}

export function useTodaySpine(userId: string | null): UseTodaySpineResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SpineData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await getTodaySpine(userId);
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('useTodaySpine failed', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Today.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { loading, data, error };
}
