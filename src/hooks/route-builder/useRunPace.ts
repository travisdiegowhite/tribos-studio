/**
 * useRunPace — the athlete's threshold pace (s/km) for run routes, fetched once
 * per page load and shared (multisport phase 2).
 *
 * Read straight from user_profiles.threshold_pace_sec, which the Running
 * profile settings write. Fail-soft: no session, no row or an error all
 * resolve null, and the run speed model then uses its defaults. The history
 * estimate the server uses for run load (resolveRunProfile) needs 180 days of
 * runs, too heavy for the browser, so it is not used here.
 *
 * Same module-scope promise cache as useSpeedProfile: the ETA and generation
 * share one query. `resetRunPaceCache` exists for tests.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

let cached: Promise<number | null> | null = null;

export function loadRunThresholdPace(): Promise<number | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) return null;
        const { data, error } = await supabase
          .from('user_profiles')
          .select('threshold_pace_sec')
          .eq('id', userId)
          .maybeSingle();
        if (error) return null;
        const pace = Number((data as { threshold_pace_sec?: unknown } | null)?.threshold_pace_sec);
        return pace > 0 ? pace : null;
      } catch {
        return null;
      }
    })();
  }
  return cached;
}

export function resetRunPaceCache(): void {
  cached = null;
}

/** Threshold pace in s/km, or null until loaded / when unknown. */
export function useRunPace(): number | null {
  const [pace, setPace] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadRunThresholdPace().then((p) => {
      if (!cancelled) setPace(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return pace;
}
