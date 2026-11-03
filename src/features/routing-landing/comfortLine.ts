/**
 * The route line split by comfort tone, for the map (spec §2: coloured
 * relative to the rider's level). Pure, so it is tested without a map.
 */

import type { Coordinate } from '../../types/geo';
import type { ComfortValidation, SegmentTone } from '../../utils/comfortValidator';

export interface ToneFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { tone: SegmentTone };
    geometry: { type: 'LineString'; coordinates: Coordinate[] };
  }>;
}

/**
 * One LineString per run of same-tone segments. Segment i joins coordinate
 * i and i+1, so a run [a..b] spans coordinates a..b+1 and neighbours share
 * an end point (no gaps in the drawn line).
 */
export function toneFeatures(coordinates: ReadonlyArray<Coordinate>, validation: Pick<ComfortValidation, 'segments'>): ToneFeatureCollection {
  const features: ToneFeatureCollection['features'] = [];
  const segs = validation.segments;
  let runStart = 0;
  for (let i = 1; i <= segs.length; i++) {
    if (i < segs.length && segs[i].tone === segs[runStart].tone) continue;
    const coords = coordinates.slice(runStart, i + 1) as Coordinate[];
    if (coords.length >= 2) {
      features.push({ type: 'Feature', properties: { tone: segs[runStart].tone }, geometry: { type: 'LineString', coordinates: coords } });
    }
    runStart = i;
  }
  return { type: 'FeatureCollection', features };
}

/** [minLng, minLat, maxLng, maxLat], or null for an empty line. */
export function lineBounds(coordinates: ReadonlyArray<Coordinate>): [number, number, number, number] | null {
  if (!coordinates.length) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}
