/**
 * useHasRideHistory — does the signed-in rider have any ridden road segments?
 *
 * Gates the Familiar Segments overlay. The segments come from every synced
 * activity (Strava, Garmin, Wahoo, COROS, uploads), so the question is "has
 * ridden anything we've processed", not "connected Strava". Asked once per
 * user via the existing `get_stats` action of /api/road-segments; fails soft
 * to false so a broken stats call only disables the toggle.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getSegmentStats } from '../../utils/routePreferences';

export interface UseHasRideHistoryReturn {
  hasHistory: boolean;
  loading: boolean;
}

export function useHasRideHistory(userId: string | null | undefined): UseHasRideHistoryReturn {
  const [hasHistory, setHasHistory] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHasHistory(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await supabase?.auth?.getSession?.();
        const token = result?.data?.session?.access_token ?? null;
        if (!token) {
          if (!cancelled) setHasHistory(false);
          return;
        }
        const stats = (await getSegmentStats(token)) as { total_segments?: number } | null;
        if (!cancelled) setHasHistory(Number(stats?.total_segments ?? 0) > 0);
      } catch {
        if (!cancelled) setHasHistory(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { hasHistory, loading };
}
