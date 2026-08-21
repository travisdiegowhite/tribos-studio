/**
 * useSpeedProfile — the rider's measured speed profile, fetched once per page
 * load and shared.
 *
 * Two consumers need the same profile: the displayed ETA (RouteBuilder2) and
 * AI generation's target-distance model (useAIGeneration). Before this existed
 * only the ETA had it — generation hardcoded `null` — so a rider's real pace
 * personalized the number on screen but never the route that was built for it.
 *
 * The in-flight promise is cached at module scope so both consumers share one
 * network call. `resetSpeedProfileCache` exists for tests.
 */

import { useEffect, useState } from 'react';
import stravaService from '../../utils/stravaService';

export type SpeedProfile = Record<string, unknown> | null;

let cached: Promise<SpeedProfile> | null = null;

/** Fetch (or reuse) the rider's speed profile. Resolves null when unavailable. */
export function loadSpeedProfile(): Promise<SpeedProfile> {
  if (!cached) {
    cached = Promise.resolve()
      .then(() =>
        (stravaService as { getSpeedProfile?: () => Promise<SpeedProfile> }).getSpeedProfile?.() ??
        null,
      )
      .then((p) => p ?? null)
      .catch(() => null);
  }
  return cached;
}

export function resetSpeedProfileCache(): void {
  cached = null;
}

export function useSpeedProfile(): SpeedProfile {
  const [profile, setProfile] = useState<SpeedProfile>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSpeedProfile().then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return profile;
}
