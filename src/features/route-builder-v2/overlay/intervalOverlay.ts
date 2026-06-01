/**
 * intervalOverlay — turn a structured workout into something the RB2 map and
 * elevation profile can paint.
 *
 * The heavy lifting (scaling a time-based workout structure onto the route's
 * distance axis) already lives in `src/utils/intervalCues.js`
 * (`generateCuesFromWorkoutStructure`). This module gives that output a typed
 * shape, maps workout categories onto the RB2 generate-form Goal, and slices
 * the route polyline into per-zone colored segments for the map layer.
 *
 * Cycling-first, view-only: nothing here is persisted.
 */

import {
  ROUTE_ZONE_COLORS,
  DEFAULT_ROUTE_COLOR,
} from '../../../components/ui/zoneColors';
import { haversineKm } from '../../../utils/distanceUnits';
import type { Coordinate } from '../../../types/geo';
import type { Goal } from '../components/useGenerateForm';

/**
 * A single interval segment mapped onto the route, in km along the route.
 * Mirrors the objects emitted by `generateCuesFromWorkoutStructure`, typed for
 * the overlay consumers (we only read the fields below).
 */
export interface WorkoutCue {
  type: string;
  zone: number | null;
  startDistance: number; // km along route
  endDistance: number; // km along route
  instruction?: string;
  duration?: number; // minutes (original workout segment)
}

/** Color for a cue's training zone, falling back to the default route color. */
export function cueColor(zone: number | null | undefined): string {
  if (zone == null) return DEFAULT_ROUTE_COLOR;
  return ROUTE_ZONE_COLORS[zone as keyof typeof ROUTE_ZONE_COLORS] ?? DEFAULT_ROUTE_COLOR;
}

/**
 * Representative training zone for a workout category — used to color-accent a
 * workout row in the picker before any route exists.
 */
export function categoryToZone(category: string | null | undefined): number {
  switch ((category ?? '').toLowerCase()) {
    case 'recovery':
      return 1;
    case 'endurance':
      return 2;
    case 'tempo':
      return 3;
    case 'sweet_spot':
      return 3.5;
    case 'threshold':
    case 'climbing':
    case 'racing':
      return 4;
    case 'vo2max':
      return 5;
    case 'anaerobic':
      return 6;
    default:
      return 3;
  }
}

/**
 * Map a workout library category / planned-workout type onto the RB2
 * generate-form Goal so the form seeds sensibly when arriving from a workout.
 */
export function categoryToGoal(category: string | null | undefined): Goal {
  switch ((category ?? '').toLowerCase()) {
    case 'recovery':
      return 'recovery';
    case 'endurance':
      return 'endurance';
    case 'tempo':
    case 'sweet_spot':
    case 'climbing':
      return 'tempo';
    case 'threshold':
    case 'sweet spot':
      return 'threshold';
    case 'vo2max':
    case 'anaerobic':
    case 'racing':
      return 'threshold';
    default:
      return 'endurance';
  }
}

/**
 * Slice the route polyline into contiguous colored segments, one run per cue,
 * for the map's intervals line layer. Assigns each vertex to the cue whose
 * [startDistance, endDistance) span contains its cumulative distance, then
 * groups contiguous vertices into runs. Consecutive runs share the boundary
 * vertex so the colored line has no visual gaps.
 */
export function buildIntervalRouteFeatureCollection(
  coordinates: Coordinate[] | undefined | null,
  cues: WorkoutCue[] | undefined | null,
): GeoJSON.FeatureCollection {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  if (!coordinates || coordinates.length < 2 || !cues || cues.length === 0) {
    return empty;
  }

  // Cumulative distance (km) at each vertex.
  const cumKm: number[] = new Array(coordinates.length);
  cumKm[0] = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    cumKm[i] = cumKm[i - 1] + haversineKm(lat1, lon1, lat2, lon2);
  }

  const cueForDistance = (d: number): number => {
    for (let c = 0; c < cues.length; c++) {
      if (d >= cues[c].startDistance && d < cues[c].endDistance) return c;
    }
    // Past the last cue's end (rounding/coverage gap) → attribute to the last cue.
    return cues.length - 1;
  };

  const features: GeoJSON.Feature[] = [];
  let runStart = 0;
  let runCue = cueForDistance(cumKm[0]);

  const pushRun = (startIdx: number, endIdx: number, cueIdx: number) => {
    if (endIdx <= startIdx) return;
    const slice = coordinates.slice(startIdx, endIdx + 1);
    if (slice.length < 2) return;
    features.push({
      type: 'Feature',
      properties: { color: cueColor(cues[cueIdx]?.zone), zone: cues[cueIdx]?.zone ?? null },
      geometry: { type: 'LineString', coordinates: slice.map((c) => [c[0], c[1]]) },
    });
  };

  for (let i = 1; i < coordinates.length; i++) {
    const cueHere = cueForDistance(cumKm[i]);
    if (cueHere !== runCue) {
      // Close the current run at i (shared boundary vertex), start a new run there.
      pushRun(runStart, i, runCue);
      runStart = i;
      runCue = cueHere;
    }
  }
  pushRun(runStart, coordinates.length - 1, runCue);

  return { type: 'FeatureCollection', features };
}
