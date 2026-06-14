/**
 * detectClipSelection — pure detection core for the manual "clip tangent" tool.
 *
 * Given the route geometry and a map-click coordinate, find the out-and-back
 * spur the user clicked and produce the highlight + savings stats. Extracted
 * from the page handler so it's unit-testable without React. The reroute +
 * store update stays in the page (integration).
 *
 * Wraps RB1's `routeEditor.js` helpers, which operate on bare [lng,lat] arrays.
 */
import {
  detectRouteClick,
  findSegmentToRemove,
  getSegmentHighlight,
  getRemovalStats,
} from '../../../utils/routeEditor';
import type { Coordinate } from '../../../types/geo';

export interface ClipRemovalStats {
  segmentLength: number;
  directDistance: number;
  distanceSaved: number;
  pointsRemoved: number;
  percentOfRoute: number | string;
}

export interface ClipSelection {
  startIndex: number;
  endIndex: number;
  highlightGeoJSON: GeoJSON.Feature;
  stats: ClipRemovalStats;
}

type LngLat = [number, number];

/**
 * Detect the spur segment near a click. Returns null when the click misses the
 * line, lands on a non-tangent arc, or sits too near the route ends.
 */
export function detectClipSelection(
  coords: ReadonlyArray<Coordinate>,
  clickCoord: Coordinate,
  threshold = 60,
): ClipSelection | null {
  if (!Array.isArray(coords) || coords.length < 5) return null;
  const line = coords as unknown as LngLat[];

  const hit = detectRouteClick(line, clickCoord as unknown as LngLat, threshold) as
    | { index: number }
    | null;
  if (!hit) return null;

  const seg = findSegmentToRemove(line, hit.index) as
    | { startIndex: number; endIndex: number }
    | null;
  if (!seg) return null;

  const highlightGeoJSON = getSegmentHighlight(line, seg.startIndex, seg.endIndex) as
    | GeoJSON.Feature
    | null;
  const stats = getRemovalStats(line, seg.startIndex, seg.endIndex) as ClipRemovalStats | null;
  if (!highlightGeoJSON || !stats) return null;

  return { startIndex: seg.startIndex, endIndex: seg.endIndex, highlightGeoJSON, stats };
}
