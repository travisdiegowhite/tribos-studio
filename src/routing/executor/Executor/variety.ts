/**
 * Variety perturbation strategy for `Executor.generate({ count: 3 })`.
 *
 * Three cardinal-direction perturbations bias the router toward
 * different parts of the surrounding region. The router fills in real
 * geometry through real roads; this module only seeds different
 * waypoint hints.
 *
 * v1 is intentionally simple: three deterministic directions (N/E/S).
 * West is deliberately omitted — three alternatives matches the
 * existing AI Mode UX. Post-beta tuning targets are documented in
 * `docs/executor-facade.md` (surface variety, elevation variety,
 * familiar/unfamiliar bias, daily rotation).
 */

import type { Coordinate } from '../../../types/geo';
import type { RouteConstraint } from '../types';

export type PerturbationStrategy =
  | 'cardinal_north'
  | 'cardinal_east'
  | 'cardinal_south';

export const PERTURBATION_STRATEGIES: readonly PerturbationStrategy[] = [
  'cardinal_north',
  'cardinal_east',
  'cardinal_south',
] as const;

// [delta-longitude-unit, delta-latitude-unit] — pure direction vectors.
const DIRECTIONS: Record<PerturbationStrategy, readonly [number, number]> = {
  cardinal_north: [0, 1],
  cardinal_east: [1, 0],
  cardinal_south: [0, -1],
};

/** Rough kilometers per degree at the equator. Used as a coarse scaler. */
const KM_PER_DEGREE = 111;

/** Default distance assumed when the constraint carries no target. */
const DEFAULT_TARGET_KM = 30;

/**
 * Produce a new `RouteConstraint` whose waypoints are seeded toward
 * the given cardinal direction. All other constraint fields are
 * preserved.
 *
 * The seed midpoint sits ~`target_distance_km / 4` away from the
 * start in the strategy's direction — close enough that the router
 * has freedom to bias the search, far enough to actually move the
 * route. Latitude scaling is intentionally rough; the goal is variety,
 * not geodesic accuracy.
 *
 * The resulting waypoint list is `[start, seed_midpoint, start]`
 * — a loop seed. If the base constraint had additional waypoints, they
 * are replaced; this is by design (alternatives explore a different
 * search neighborhood; the original waypoint topology is just one of
 * the three options).
 */
export function varietyPerturbation(
  base: RouteConstraint,
  strategy: PerturbationStrategy,
): RouteConstraint {
  if (base.waypoints.length === 0) {
    throw new Error('varietyPerturbation: base constraint has no waypoints');
  }

  const [dlng, dlat] = DIRECTIONS[strategy];
  const start = base.waypoints[0];
  const targetKm = base.target_distance_km ?? DEFAULT_TARGET_KM;
  const offsetKm = targetKm / 4;
  const offsetDegrees = offsetKm / KM_PER_DEGREE;

  const seedMidpoint: Coordinate = [
    start[0] + dlng * offsetDegrees,
    start[1] + dlat * offsetDegrees,
  ];

  return {
    ...base,
    waypoints: [start, seedMidpoint, start],
    shape: 'loop',
  };
}
