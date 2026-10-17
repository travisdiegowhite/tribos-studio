/**
 * useRunPace — the athlete's threshold pace (s/km) for run routes (multisport
 * phase 2).
 *
 * A thin view of useRunThresholds (src/hooks/useRunThresholds.ts), so the
 * route builder, the zone charts and Progress share one user_profiles query.
 * Fail-soft: null when unknown, and the run speed model then uses its
 * defaults. Without an entered pace it uses the history estimate the nightly
 * load recompute stores on the profile (migration 136).
 */

import {
  loadRunThresholds,
  resetRunThresholdsCache,
  useRunThresholds,
} from '../useRunThresholds';

export function loadRunThresholdPace(): Promise<number | null> {
  return loadRunThresholds().then((t) => t.thresholdPaceSec);
}

export function resetRunPaceCache(): void {
  resetRunThresholdsCache();
}

/** Threshold pace in s/km, or null until loaded / when unknown. */
export function useRunPace(): number | null {
  return useRunThresholds().thresholdPaceSec;
}
