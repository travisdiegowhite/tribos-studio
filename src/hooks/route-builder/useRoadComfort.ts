/**
 * useRoadComfort — the rider's "Road comfort" (traffic tolerance) preference.
 *
 * Source of truth is `user_road_preferences.traffic_tolerance` (migration
 * 125), mirrored into the route-builder store so every routing call (form
 * generation, chat generation, manual drag-snap) reads one value. On first
 * use per page load the stored value is fetched and applied; changes update
 * the store immediately and are written back fire-and-forget. Guests and
 * unapplied migrations degrade to the store's local value.
 *
 * Comfort level 1–5 (migration 139) rides alongside: `comfortLevel` reads
 * the store's level, else the one the tolerance maps to, and
 * `setComfortLevel` saves `comfort_level` (the API dual-writes the
 * tolerance). Only a level the rider actually saved is applied from the
 * server. The API's Comfort 2 default for a rider with no row is not
 * applied, because it would move today's routing from 'medium' to 'low'.
 */

import { useCallback, useEffect } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { supabase } from '../../lib/supabase';
import { getPreferences, updatePreferences } from '../../utils/routePreferences';
import type { TrafficTolerance } from '../../utils/trafficStress';
import { comfortLevelFromTolerance, isComfortLevel, type ComfortLevel } from '../../utils/comfortLevels';

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
  comfortLevel: ComfortLevel;
  setComfortLevel: (next: ComfortLevel) => void;
}

interface ServerPrefs {
  traffic_tolerance?: unknown;
  comfort_level?: unknown;
  comfort_level_source?: unknown;
}

export function useRoadComfort(): UseRoadComfortReturn {
  const stored = useRouteBuilderStore((s) => s.trafficTolerance as string | undefined);
  const setTrafficTolerance = useRouteBuilderStore(
    (s) => s.setTrafficTolerance as (t: TrafficTolerance) => void,
  );
  const roadComfort: TrafficTolerance = isTrafficTolerance(stored) ? stored : 'medium';
  const storedLevel = useRouteBuilderStore((s) => s.comfortLevel as unknown);
  const setStoreComfortLevel = useRouteBuilderStore(
    (s) => s.setComfortLevel as (l: ComfortLevel) => void,
  );
  const comfortLevel: ComfortLevel = isComfortLevel(storedLevel)
    ? storedLevel
    : comfortLevelFromTolerance(roadComfort);

  useEffect(() => {
    if (syncedFromServer) return;
    syncedFromServer = true;
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      const prefs = (await getPreferences(token)) as ServerPrefs | null;
      if (cancelled) return;
      if (prefs?.comfort_level_source === 'stored' && isComfortLevel(prefs.comfort_level)) {
        setStoreComfortLevel(prefs.comfort_level);
      } else if (isTrafficTolerance(prefs?.traffic_tolerance)) {
        setTrafficTolerance(prefs.traffic_tolerance);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setTrafficTolerance, setStoreComfortLevel]);

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

  const setComfortLevel = useCallback(
    (next: ComfortLevel) => {
      if (!isComfortLevel(next)) return;
      setStoreComfortLevel(next);
      void (async () => {
        const token = await getAccessToken();
        if (!token) return;
        const saved = await updatePreferences({ comfort_level: next }, token);
        if (!saved) console.warn('[RB2] Comfort level not persisted (kept locally)');
      })();
    },
    [setStoreComfortLevel],
  );

  return { roadComfort, setRoadComfort, comfortLevel, setComfortLevel };
}

export default useRoadComfort;
