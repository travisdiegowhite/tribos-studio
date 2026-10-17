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
 *
 * Phase 5: when the athlete has entered no threshold pace (or LTHR), the
 * estimate the nightly load recompute stores (migration 136,
 * estimated_threshold_pace_sec / estimated_lthr) fills in, and `paceFrom` /
 * `lthrFrom` say which. The estimate is read in its own query so an
 * unapplied 136 cannot break the main read.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface RunThresholds {
  /** Seconds per km. */
  thresholdPaceSec: number | null;
  lthr: number | null;
  maxHr: number | null;
  restingHr: number | null;
  /** Where thresholdPaceSec came from. */
  paceFrom: 'profile' | 'estimated' | null;
  /** Where lthr came from. */
  lthrFrom: 'profile' | 'estimated' | null;
  /** The stored history estimates themselves, whatever the athlete entered. */
  estimatedPaceSec: number | null;
  estimatedLthr: number | null;
}

export const NO_RUN_THRESHOLDS: RunThresholds = Object.freeze({
  thresholdPaceSec: null,
  lthr: null,
  maxHr: null,
  restingHr: null,
  paceFrom: null,
  lthrFrom: null,
  estimatedPaceSec: null,
  estimatedLthr: null,
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
        const [main, est] = await Promise.all([
          supabase
            .from('user_profiles')
            .select('threshold_pace_sec, lthr, max_hr, resting_hr')
            .eq('id', userId)
            .maybeSingle(),
          supabase
            .from('user_profiles')
            .select('estimated_threshold_pace_sec, estimated_lthr')
            .eq('id', userId)
            .maybeSingle(),
        ]);
        const row = (main.error ? null : main.data) as Record<string, unknown> | null;
        const estRow = (est.error ? null : est.data) as Record<string, unknown> | null;
        if (!row && !estRow) return NO_RUN_THRESHOLDS;
        const ownPace = positive(row?.threshold_pace_sec);
        const ownLthr = positive(row?.lthr);
        const estimatedPaceSec = positive(estRow?.estimated_threshold_pace_sec);
        const estimatedLthr = positive(estRow?.estimated_lthr);
        return {
          thresholdPaceSec: ownPace ?? estimatedPaceSec,
          lthr: ownLthr ?? estimatedLthr,
          maxHr: positive(row?.max_hr),
          restingHr: positive(row?.resting_hr),
          paceFrom: ownPace ? 'profile' : estimatedPaceSec ? 'estimated' : null,
          lthrFrom: ownLthr ? 'profile' : estimatedLthr ? 'estimated' : null,
          estimatedPaceSec,
          estimatedLthr,
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
