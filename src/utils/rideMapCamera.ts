/**
 * rideMapCamera — pure helpers for the ride detail map's 3D camera.
 *
 * Kept free of React and Mapbox so the geometry choices (which coordinate
 * track to draw, where to point the camera) are unit-testable.
 *
 * Coordinates are canonical `[lng, lat]` throughout (see src/types/geo.ts).
 */
import { haversineKm } from './distanceUnits';

export type LngLat = readonly [number, number];
export type LngLatBounds = [[number, number], [number, number]];

export interface RideStreamsLike {
  coords?: Array<LngLat | null | undefined> | null;
}

export interface LineStringFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: 'LineString'; coordinates: LngLat[] };
}

export interface RouteGeometry {
  /** Where the coordinates came from. Streams win when present. */
  source: 'streams' | 'polyline' | 'none';
  coords: LngLat[];
  geojson: LineStringFeature | null;
  bounds: LngLatBounds | null;
}

/** Default camera for the 3D view. Pitch is degrees from straight-down. */
export const RIDE_MAP_3D_PITCH = 62;
export const RIDE_MAP_TERRAIN_EXAGGERATION = 1.4;
export const RIDE_MAP_3D_STORAGE_KEY = 'tribos-ride-map-3d';

function isFiniteLngLat(p: unknown): p is LngLat {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0] as number) <= 180 &&
    Math.abs(p[1] as number) <= 90
  );
}

/**
 * Bounding box with a fractional pad on each side, or null for fewer than
 * two points. Mirrors the modal's legacy `calculateBounds` (10% pad).
 */
export function boundsForCoords(coords: LngLat[], padFraction = 0.1): LngLatBounds | null {
  if (coords.length < 2) return null;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  // A perfectly straight north–south ride has zero longitude span; give it
  // a little room so fitBounds never divides by zero.
  const lngPad = Math.max((maxLng - minLng) * padFraction, 0.001);
  const latPad = Math.max((maxLat - minLat) * padFraction, 0.001);
  return [
    [minLng - lngPad, minLat - latPad],
    [maxLng + lngPad, maxLat + latPad],
  ];
}

/**
 * Pick the track to draw. The activity_streams `coords` array is preferred
 * because the metric arrays are parallel to it, so a colored segment lands on
 * exactly the geometry it was measured on. The decoded summary polyline is
 * the fallback for activities that predate stream capture.
 */
export function routeGeometryFor(
  streams: RideStreamsLike | null | undefined,
  polylineCoords: LngLat[] | null | undefined,
): RouteGeometry {
  const streamCoords = (streams?.coords ?? []).filter(isFiniteLngLat);
  let source: RouteGeometry['source'] = 'none';
  let coords: LngLat[] = [];
  if (streamCoords.length >= 2) {
    source = 'streams';
    coords = streamCoords;
  } else if ((polylineCoords ?? []).filter(isFiniteLngLat).length >= 2) {
    source = 'polyline';
    coords = (polylineCoords as LngLat[]).filter(isFiniteLngLat);
  }
  if (coords.length < 2) {
    return { source: 'none', coords: [], geojson: null, bounds: null };
  }
  return {
    source,
    coords,
    geojson: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    },
    bounds: boundsForCoords(coords),
  };
}

/** Initial compass bearing (degrees, 0–360) from `a` to `b`. */
export function bearingBetween(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180;
  const lat1 = a[1] * toRad;
  const lat2 = b[1] * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Camera bearing that looks along the ride from its start.
 *
 * Mapbox's bearing is the compass direction that points "up" the screen, so
 * pointing it from the start toward the point farthest from the start puts
 * the start nearest the viewer in a pitched view and the bulk of the ride
 * receding into the terrain. Works for out-and-backs and loops alike; a
 * route with no spatial extent gets north-up.
 */
export function cameraBearingForRoute(coords: LngLat[]): number {
  if (coords.length < 2) return 0;
  const start = coords[0];
  let farthest = start;
  let farthestKm = 0;
  // Sample at most ~500 points; the farthest-point answer is not sensitive
  // to skipping a few samples on long rides.
  const step = Math.max(1, Math.floor(coords.length / 500));
  for (let i = step; i < coords.length; i += step) {
    const p = coords[i];
    const km = haversineKm(start[1], start[0], p[1], p[0]);
    if (km > farthestKm) {
      farthestKm = km;
      farthest = p;
    }
  }
  if (farthestKm < 0.05) return 0;
  return cameraBearingRounded(bearingBetween(start, farthest));
}

function cameraBearingRounded(bearing: number): number {
  return Math.round(bearing * 10) / 10;
}

/** Per-viewer 3D preference. Defaults to on; storage failures fall back to on. */
export function readStored3dPreference(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(RIDE_MAP_3D_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function writeStored3dPreference(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(RIDE_MAP_3D_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* private mode or blocked storage — preference is per-session then */
  }
}
