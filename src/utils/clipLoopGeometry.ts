/**
 * clipLoopGeometry — conservatively remove out-and-back "tangent" spurs from a
 * generated loop.
 *
 * Seeking gravel makes the router ride out to a gravel road and double back,
 * leaving spurs on the loop. RB1's `optimizeLoopRoute` already removes these
 * (its `removePeninsulas` pass fires only on true out-and-backs — went far
 * out, returned near itself, path >3x the direct line — so normal loop arcs
 * are preserved). We run it in non-aggressive mode and guard against gutting
 * the route, so callers can clip every generated candidate safely.
 */
import { optimizeLoopRoute } from './routeOptimizer';
import type { Coordinate } from '../types/geo';

const MIN_INPUT_POINTS = 4; // optimizeLoopRoute needs >=4 anyway
const MIN_OUTPUT_POINTS = 10; // both builders reject routes with <10 points

/**
 * Clip out-and-back spurs from a loop. Returns the original coordinates when
 * clipping is unsafe (too few points in, or it would drop below the routable
 * minimum) so the caller never ends up with a degenerate route.
 */
export function clipLoopGeometry(coords: ReadonlyArray<Coordinate>): Coordinate[] {
  if (!Array.isArray(coords) || coords.length < MIN_INPUT_POINTS) {
    return coords as Coordinate[];
  }
  const clipped = optimizeLoopRoute(coords as Coordinate[], {
    aggressiveMode: false,
    minSegmentLength: 100,
  }) as Coordinate[];
  if (!Array.isArray(clipped) || clipped.length < MIN_OUTPUT_POINTS) {
    return coords as Coordinate[];
  }
  return clipped;
}
