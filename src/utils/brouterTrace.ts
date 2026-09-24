/**
 * brouterTrace — OSM tags for ANY route line, by asking BRouter to re-ride it.
 *
 * The routing providers only tell us what we were routed onto when the
 * route came from BRouter (`properties.messages`, see wayTags.ts). Routes
 * built by Stadia/Valhalla, imported from GPX, restored from storage or
 * loaded from the database carry no tags, and the Overpass corridor fetch
 * that used to fill the gap is not dependable: the public mirrors answer a
 * long route's corridor with 504s and timeouts (see roadAttributes.ts).
 *
 * BRouter reconstructs the same line in well under a second when it is
 * pinned by via points sampled along the route (measured: 45 km loop, 40
 * vias, ~0.5 s, 99% of the original length). Its response carries the tag
 * rows for every way it rode, which `matchRouteWays` then snaps onto the
 * ORIGINAL geometry, so any stretch where the reconstruction wandered off
 * the line simply stays unknown instead of being mis-tagged. Same idea as
 * the Valhalla route reconstruction `getStadiaCuesForGeometry` uses for
 * turn cues.
 */

import type { Coordinate } from '../types/geo';
import { getBRouterDirections, BROUTER_PROFILES } from './brouter';
import { haversineMeters } from './distanceUnits';
import type { TaggedWay } from './wayTags';

/** Upper bound on via points per reconstruction (one BRouter leg each). */
export const TRACE_MAX_VIAS = 40;
/** Never place vias closer than this; short routes use fewer. */
export const TRACE_MIN_SPACING_M = 500;

type RouteFetcher = (
  coordinates: Array<[number, number]>,
  options: { profile: string; tribos?: false },
) => Promise<{ taggedWays?: TaggedWay[] | null } | null>;

export interface TraceOptions {
  profile?: string;
  /** Test seam; defaults to `getBRouterDirections`. */
  fetchRoute?: RouteFetcher;
}

function polylineLengthM(coordinates: ReadonlyArray<Coordinate>): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    total += haversineMeters(a[1], a[0], b[1], b[0]);
  }
  return total;
}

/**
 * Both endpoints plus vias spaced evenly by distance along the line, at
 * most TRACE_MAX_VIAS and at least TRACE_MIN_SPACING_M apart. Exported for
 * tests.
 */
export function sampleVias(coordinates: ReadonlyArray<Coordinate>): Coordinate[] {
  if (coordinates.length < 2) return coordinates.map((c) => [c[0], c[1]] as Coordinate);
  const totalM = polylineLengthM(coordinates);
  const nVias = Math.max(2, Math.min(TRACE_MAX_VIAS, Math.floor(totalM / TRACE_MIN_SPACING_M) + 1));
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const vias: Coordinate[] = [[first[0], first[1]]];
  if (nVias > 2) {
    const spacing = totalM / (nVias - 1);
    let acc = 0;
    let next = spacing;
    for (let i = 1; i < coordinates.length - 1 && vias.length < nVias - 1; i++) {
      const a = coordinates[i - 1];
      const b = coordinates[i];
      acc += haversineMeters(a[1], a[0], b[1], b[0]);
      if (acc >= next) {
        vias.push([b[0], b[1]]);
        next += spacing;
      }
    }
  }
  vias.push([last[0], last[1]]);
  return vias;
}

/**
 * Tagged ways for `coordinates` obtained by re-riding the line with BRouter.
 * Resolves to null (never throws) when BRouter gives no route or no tags.
 */
export async function traceTaggedWaysWithBRouter(
  coordinates: ReadonlyArray<Coordinate>,
  options: TraceOptions = {},
): Promise<TaggedWay[] | null> {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const vias = sampleVias(coordinates).map(([lng, lat]) => [lng, lat] as [number, number]);
  if (vias.length < 2) return null;
  const fetchRoute = options.fetchRoute ?? (getBRouterDirections as unknown as RouteFetcher);
  try {
    // A re-ride reconstructs the line as drawn to read its tags; the rider's
    // preferences must not steer it, so the stock profile is forced even
    // when Tribos profiles are on.
    const route = await fetchRoute(vias, { profile: options.profile ?? BROUTER_PROFILES.TREKKING, tribos: false });
    const ways = route?.taggedWays;
    if (!Array.isArray(ways) || ways.length === 0) return null;
    return ways;
  } catch (err) {
    console.warn('BRouter trace failed:', (err as Error)?.message ?? err);
    return null;
  }
}
