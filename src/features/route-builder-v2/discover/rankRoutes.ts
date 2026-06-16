/**
 * rankRoutes — order the rider's saved routes by how well they fit a target.
 *
 * Route discovery, the coach-differentiated way: instead of a generic
 * popularity feed, surface the rider's own routes ranked by closeness to
 * today's prescription (distance derived from the next planned workout).
 * Pure + dependency-free so it's unit-testable.
 */

export type RouteFit = 'great' | 'good' | 'far' | null;

export interface RankableRoute {
  id: string;
  name?: string;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
}

export interface RankedRoute extends RankableRoute {
  /** Closeness band vs the target distance; null when there's no target. */
  fit: RouteFit;
  /** |route − target| in km; null when unknown. */
  deltaKm: number | null;
}

/**
 * Sort routes closest-first to `targetKm`. With no target (or a non-positive
 * one) the input order is preserved and every fit is null. Routes missing a
 * distance sort last.
 */
export function rankRoutesByFit(
  routes: ReadonlyArray<RankableRoute>,
  targetKm: number | null,
): RankedRoute[] {
  if (targetKm == null || !(targetKm > 0)) {
    return routes.map((r) => ({ ...r, fit: null, deltaKm: null }));
  }

  const scored = routes.map((r) => {
    const d = typeof r.distance_km === 'number' && Number.isFinite(r.distance_km)
      ? r.distance_km
      : null;
    const deltaKm = d == null ? null : Math.abs(d - targetKm);
    const pct = deltaKm == null ? Infinity : deltaKm / targetKm;
    const fit: RouteFit =
      deltaKm == null ? null : pct <= 0.1 ? 'great' : pct <= 0.25 ? 'good' : 'far';
    return { route: { ...r, fit, deltaKm }, pct };
  });

  scored.sort((a, b) => a.pct - b.pct);
  return scored.map((s) => s.route);
}

/**
 * Derive a target distance (km) from a planned workout: prefer an explicit
 * target distance, else estimate from duration at a default endurance pace.
 */
export function targetDistanceKm(
  workout: { targetDistanceKm?: number | null; targetDurationMinutes?: number | null } | null,
  paceKmh = 26,
): number | null {
  if (!workout) return null;
  if (typeof workout.targetDistanceKm === 'number' && workout.targetDistanceKm > 0) {
    return workout.targetDistanceKm;
  }
  if (typeof workout.targetDurationMinutes === 'number' && workout.targetDurationMinutes > 0) {
    return Math.round((workout.targetDurationMinutes / 60) * paceKmh);
  }
  return null;
}
