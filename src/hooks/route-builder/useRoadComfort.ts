/**
 * useRoadComfort — the rider's "Road comfort" (traffic tolerance) preference.
 *
 * Source of truth is `user_road_preferences.traffic_tolerance` (migration
 * 125), mirrored into the route-builder store so every routing call (form
 * generation, chat generation, manual drag-snap) reads one value. On first
 * use per page load the stored value is fetched and applied; changes update
 * the store immediately and are written back fire-and-forget. Guests and
 * unapplied migrations degrade to the store's local value.
 */

import { useCallback, useEffect } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { supabase } from '../../lib/supabase';
import { getPreferences, updatePreferences } from '../../utils/routePreferences';
import type { TrafficTolerance } from '../../utils/trafficStress';

export const ROAD_COMFORT_OPTIONS: Array<{ value: TrafficTolerance; label: string }> = [
  { value: 'low', label: 'Quiet' },
  { value: 'medium', label: 'Balanced' },
  { value: 'high', label: 'Direct' },
];

const VALID = new Set<string>(['low', 'medium', 'high']);

export function isTrafficTolerance(value: unknown): value is TrafficTolerance {
  return typeof value === 'string' && VALID.has(value);
}

// Once per page load: the server value wins over whatever the store
// rehydrated from localStorage, but only the first time.
let syncedFromServer = false;

/** Test seam. */
export function resetRoadComfortSync(): void {
  syncedFromServer = false;
}

async function getAccessToken(): Promise<string | null> {
  try {
    const result = await supabase?.auth?.getSession?.();
    return result?.data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export interface UseRoadComfortReturn {
  roadComfort: TrafficTolerance;
  setRoadComfort: (next: TrafficTolerance) => void;
}

export function useRoadComfort(): UseRoadComfortReturn {
  const stored = useRouteBuilderStore((s) => s.trafficTolerance as string | undefined);
  const setTrafficTolerance = useRouteBuilderStore(
    (s) => s.setTrafficTolerance as (t: TrafficTolerance) => void,
  );
  const roadComfort: TrafficTolerance = isTrafficTolerance(stored) ? stored : 'medium';

  useEffect(() => {
    if (syncedFromServer) return;
    syncedFromServer = true;
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      const prefs = (await getPreferences(token)) as { traffic_tolerance?: unknown } | null;
      if (cancelled) return;
      if (isTrafficTolerance(prefs?.traffic_tolerance)) {
        setTrafficTolerance(prefs.traffic_tolerance);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setTrafficTolerance]);

  const setRoadComfort = useCallback(
    (next: TrafficTolerance) => {
      if (!isTrafficTolerance(next)) return;
      setTrafficTolerance(next);
      void (async () => {
        const token = await getAccessToken();
        if (!token) return;
        const saved = await updatePreferences({ traffic_tolerance: next }, token);
        if (!saved) console.warn('[RB2] Road comfort not persisted (kept locally)');
      })();
    },
    [setTrafficTolerance],
  );

  return { roadComfort, setRoadComfort };
}

export default useRoadComfort;
