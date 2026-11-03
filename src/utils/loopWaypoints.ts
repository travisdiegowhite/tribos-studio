/**
 * loopWaypoints — deterministic waypoints for a loop of roughly a target
 * distance from a start, with no AI and no ride history.
 *
 * Used by the comfort harness (scripts/comfort-harness) and intended for
 * the landing form's non-AI generation (docs/ROUTING-LANDING-SPEC.md §1).
 * Deterministic on purpose: the same request gives the same waypoints, so a
 * harness diff measures the router, not the dice. (aiRouteGenerator's
 * `generateLoopWaypoints` jitters with Math.random.)
 *
 * Shape: the start sits on a circle; `points` vertices are spaced evenly
 * around the rest of it. `bearingDeg` is the direction from the start to
 * the circle's centre; `clockwise` picks the direction of travel. Road
 * distance runs longer than the polygon, so the circle is shrunk by
 * `roadFactor`; `rescaleLoop` corrects after a first routed attempt.
 *
 * Canonical [lng, lat] in and out (CLAUDE.md coordinate convention); km in.
 */

import type { Coordinate } from '../types/geo';

export interface LoopOptions {
  /** Direction from the start to the loop's centre, degrees clockwise from north. */
  bearingDeg?: number;
  /** Vertices besides the start (2–6). */
  points?: number;
  clockwise?: boolean;
  /** Road distance ÷ polygon distance, typical for a road network. */
  roadFactor?: number;
}

export const DEFAULT_ROAD_FACTOR = 1.3;
const EARTH_RADIUS_KM = 6371.0088;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Point `distanceKm` from `start` along `bearingDeg` (great circle). */
export function destinationPoint(start: Coordinate, distanceKm: number, bearingDeg: number): Coordinate {
  const [lng, lat] = start;
  const δ = distanceKm / EARTH_RADIUS_KM;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}

/** Polygon perimeter ÷ circle circumference for n+1 evenly spaced vertices. */
function polygonFactor(vertices: number): number {
  return (vertices * 2 * Math.sin(Math.PI / vertices)) / (2 * Math.PI);
}

/**
 * Waypoints [start, v1 … vn, start] for a loop of about `targetDistanceKm`
 * road distance.
 */
export function loopWaypoints(start: Coordinate, targetDistanceKm: number, options: LoopOptions = {}): Coordinate[] {
  const points = Math.max(2, Math.min(6, Math.round(options.points ?? 3)));
  const bearing = options.bearingDeg ?? 0;
  const roadFactor = options.roadFactor ?? DEFAULT_ROAD_FACTOR;
  const vertices = points + 1;
  const polygonKm = targetDistanceKm / roadFactor;
  const radiusKm = polygonKm / (2 * Math.PI * polygonFactor(vertices));
  const centre = destinationPoint(start, radiusKm, bearing);
  // Bearing from the centre back to the start.
  const back = (bearing + 180) % 360;
  const step = 360 / vertices;
  const dir = options.clockwise === false ? -1 : 1;
  const out: Coordinate[] = [[start[0], start[1]]];
  for (let i = 1; i <= points; i++) {
    out.push(destinationPoint(centre, radiusKm, (back + dir * i * step + 360) % 360));
  }
  out.push([start[0], start[1]]);
  return out;
}

/**
 * Road factor for a second attempt, given what the first attempt's road
 * distance came to. Clamped so one odd route can't send the loop to the
 * moon.
 */
export function rescaleRoadFactor(previousFactor: number, targetKm: number, actualKm: number): number {
  if (!(actualKm > 0) || !(targetKm > 0)) return previousFactor;
  const ratio = Math.max(0.6, Math.min(1.6, actualKm / targetKm));
  return previousFactor * ratio;
}
