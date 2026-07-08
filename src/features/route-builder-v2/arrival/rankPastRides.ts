/**
 * rankPastRides — order past rides by how well they fit today's workout.
 *
 * Same idea as `discover/rankRoutes` (saved routes vs a distance target), but
 * past rides also carry a moving time, so a ride can match on duration OR
 * distance — whichever is closer counts, since the calendar workout usually
 * prescribes one of the two. Pure + dependency-free for unit tests.
 */

import type { RouteFit } from '../discover/rankRoutes';

export interface RankablePastRide {
  id: string;
  name: string | null;
  startDate: string | null;
  distanceKm: number | null;
  movingTimeMinutes: number | null;
}

export interface RankedPastRide extends RankablePastRide {
  /** Closeness band vs the workout target; null when there's no target. */
  fit: RouteFit;
}

export interface PastRideTarget {
  durationMinutes: number | null;
  distanceKm: number | null;
}

/** Relative deltas above this are dropped entirely when a target exists. */
const MAX_PCT = 0.6;

function relativeDelta(value: number | null, target: number | null): number {
  if (value == null || target == null || !(target > 0) || !(value > 0)) return Infinity;
  return Math.abs(value - target) / target;
}

/**
 * Sort rides best-fit-first against the workout target and drop the clear
 * mismatches (> MAX_PCT off on both axes), capped at `limit`. With no usable
 * target, the input order (recency) is preserved, nothing is dropped, and
 * every fit is null.
 */
export function rankPastRidesByFit(
  rides: ReadonlyArray<RankablePastRide>,
  target: PastRideTarget | null,
  limit = 8,
): RankedPastRide[] {
  const hasTarget =
    !!target && ((target.durationMinutes ?? 0) > 0 || (target.distanceKm ?? 0) > 0);
  if (!hasTarget) {
    return rides.slice(0, limit).map((r) => ({ ...r, fit: null }));
  }

  const scored = rides.map((r, index) => {
    const pct = Math.min(
      relativeDelta(r.movingTimeMinutes, target.durationMinutes),
      relativeDelta(r.distanceKm, target.distanceKm),
    );
    const fit: RouteFit =
      pct === Infinity ? null : pct <= 0.1 ? 'great' : pct <= 0.25 ? 'good' : 'far';
    return { ride: { ...r, fit }, pct, index };
  });

  scored.sort((a, b) => a.pct - b.pct || a.index - b.index);
  const similar = scored.filter((s) => s.pct <= MAX_PCT);
  // If nothing is anywhere near the target, closest-first beats an empty list.
  return (similar.length > 0 ? similar : scored).slice(0, limit).map((s) => s.ride);
}
