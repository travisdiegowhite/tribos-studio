/**
 * useRunThresholds — the athlete's running anchors, fetched once per page load
 * and shared (multisport phase 4).
 *
 * One read of user_profiles `threshold_pace_sec, lthr, max_hr, resting_hr`,
 * which the Running profile settings write. Fail-soft: no session, no row or
 * an error all resolve to all-null thresholds, and every caller then falls
 * back to what it showed before (HR zones from the activity's own max HR, no
 * pace zones, default run speeds).
 *
 * The route builder's useRunPace reads its threshold pace from here, so the
 * builder, the zone charts and Progress share one query.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface RunThresholds {
  /** Seconds per km. */
  thresholdPaceSec: number | null;
  lthr: number | null;
  maxHr: number | null;
  restingHr: number | null;
}

export const NO_RUN_THRESHOLDS: RunThresholds = Object.freeze({
  thresholdPaceSec: null,
  lthr: null,
  maxHr: null,
  restingHr: null,
});

let cached: Promise<RunThresholds> | null = null;

const positive = (v: unknown): number | null => (Number(v) > 0 ? Number(v) : null);

export function loadRunThresholds(): Promise<RunThresholds> {
  if (!cached) {
    cached = (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) return NO_RUN_THRESHOLDS;
        const { data, error } = await supabase
          .from('user_profiles')
          .select('threshold_pace_sec, lthr, max_hr, resting_hr')
          .eq('id', userId)
          .maybeSingle();
        if (error || !data) return NO_RUN_THRESHOLDS;
        const row = data as Record<string, unknown>;
        return {
          thresholdPaceSec: positive(row.threshold_pace_sec),
          lthr: positive(row.lthr),
          maxHr: positive(row.max_hr),
          restingHr: positive(row.resting_hr),
        };
      } catch {
        return NO_RUN_THRESHOLDS;
      }
    })();
  }
  return cached;
}

/** Test hook. */
export function resetRunThresholdsCache(): void {
  cached = null;
}

/** All-null until loaded or when unknown. */
export function useRunThresholds(): RunThresholds {
  const [thresholds, setThresholds] = useState<RunThresholds>(NO_RUN_THRESHOLDS);
  useEffect(() => {
    let cancelled = false;
    void loadRunThresholds().then((t) => {
      if (!cancelled) setThresholds(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return thresholds;
}
