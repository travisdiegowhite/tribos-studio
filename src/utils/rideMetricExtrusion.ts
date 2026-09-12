/**
 * rideMetricExtrusion — turns per-segment metric values into thin extruded
 * "wall" polygons for a Mapbox fill-extrusion layer, so a ride's power, speed
 * or heart rate reads as height along the route in the 3D view.
 *
 * Pure geometry, no Mapbox imports, so the scaling rules are testable.
 * Coordinates are canonical `[lng, lat]`.
 */

export type LngLat = readonly [number, number];

/** One colored route segment, as emitted by ColoredRouteMap's line builder. */
export interface MetricSegment {
  /** Two-point segment. */
  coordinates: [LngLat, LngLat];
  /** 0–1 within the metric's display range, or null when there is no reading. */
  norm: number | null;
  /** CSS hex for the segment, already computed from the metric's scale. */
  color: string;
}

export interface ExtrusionScale {
  /** Wall thickness in meters. */
  widthM: number;
  /** Wall height in meters at norm = 1. */
  maxHeightM: number;
  /** Wall height in meters at norm = 0, so a quiet stretch is still a ribbon. */
  minHeightM: number;
}

export interface ExtrusionFeature {
  type: 'Feature';
  properties: { height: number; color: string; norm: number | null };
  geometry: { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };
}

export interface ExtrusionCollection {
  type: 'FeatureCollection';
  features: ExtrusionFeature[];
}

const METERS_PER_DEG_LAT = 111_320;

/** Tuning knobs, expressed as fractions of the ride's spatial extent. */
export const EXTRUSION_WIDTH_FRACTION = 0.0025;
export const EXTRUSION_HEIGHT_FRACTION = 0.025;
export const EXTRUSION_WIDTH_CLAMP_M: [number, number] = [8, 60];
export const EXTRUSION_HEIGHT_CLAMP_M: [number, number] = [40, 500];
/** Segments overlap by this fraction of the width so corners don't show gaps. */
const JOIN_OVERLAP_FRACTION = 0.5;

function clamp(v: number, [lo, hi]: [number, number]): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Rough extent of a track in meters: the longer side of its bounding box. */
export function extentMeters(coords: readonly LngLat[]): number {
  if (coords.length < 2) return 0;
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
  const midLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const heightM = (maxLat - minLat) * METERS_PER_DEG_LAT;
  const widthM = (maxLng - minLng) * METERS_PER_DEG_LAT * Math.cos(midLatRad);
  return Math.max(heightM, widthM);
}

/**
 * Wall width and height that look proportionate for a ride of this size: a
 * 10 km loop and a 150 km epic should both read at their fit-to-bounds zoom.
 */
export function extrusionScaleForCoords(coords: readonly LngLat[]): ExtrusionScale {
  const extent = extentMeters(coords);
  const widthM = clamp(extent * EXTRUSION_WIDTH_FRACTION, EXTRUSION_WIDTH_CLAMP_M);
  const maxHeightM = clamp(extent * EXTRUSION_HEIGHT_FRACTION, EXTRUSION_HEIGHT_CLAMP_M);
  return { widthM, maxHeightM, minHeightM: maxHeightM * 0.03 };
}

/** Height in meters for a normalized value; null readings get the floor. */
export function heightForNorm(norm: number | null, scale: ExtrusionScale): number {
  if (norm == null || !Number.isFinite(norm)) return scale.minHeightM;
  const n = Math.min(1, Math.max(0, norm));
  return scale.minHeightM + n * (scale.maxHeightM - scale.minHeightM);
}

/**
 * A rectangle of `widthM` centered on the segment, extended by half a width
 * at each end so consecutive walls overlap at the joint.
 */
export function segmentQuad(a: LngLat, b: LngLat, widthM: number): Array<[number, number]> {
  const midLatRad = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const mPerDegLng = METERS_PER_DEG_LAT * Math.cos(midLatRad) || METERS_PER_DEG_LAT;

  // Work in local meters so the perpendicular is a true right angle.
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * METERS_PER_DEG_LAT;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    // Degenerate segment: a small square so the reading is still visible.
    const h = widthM / 2;
    const dLng = h / mPerDegLng;
    const dLat = h / METERS_PER_DEG_LAT;
    return [
      [a[0] - dLng, a[1] - dLat],
      [a[0] + dLng, a[1] - dLat],
      [a[0] + dLng, a[1] + dLat],
      [a[0] - dLng, a[1] + dLat],
      [a[0] - dLng, a[1] - dLat],
    ];
  }

  const ux = dx / len;
  const uy = dy / len;
  const halfW = widthM / 2;
  const overlap = widthM * JOIN_OVERLAP_FRACTION;
  // Perpendicular (left-hand normal) and along-track extension, in meters.
  const nx = -uy * halfW;
  const ny = ux * halfW;
  const ex = ux * overlap;
  const ey = uy * overlap;

  const toLngLat = (px: number, py: number): [number, number] => [
    px / mPerDegLng,
    py / METERS_PER_DEG_LAT,
  ];
  const ax = a[0] * mPerDegLng;
  const ay = a[1] * METERS_PER_DEG_LAT;
  const bx = b[0] * mPerDegLng;
  const by = b[1] * METERS_PER_DEG_LAT;

  const p1 = toLngLat(ax - ex + nx, ay - ey + ny);
  const p2 = toLngLat(bx + ex + nx, by + ey + ny);
  const p3 = toLngLat(bx + ex - nx, by + ey - ny);
  const p4 = toLngLat(ax - ex - nx, ay - ey - ny);
  return [p1, p2, p3, p4, p1];
}

/** Build the fill-extrusion FeatureCollection for a metric's segments. */
export function buildExtrusionCollection(
  segments: readonly MetricSegment[],
  scale: ExtrusionScale,
): ExtrusionCollection {
  const features: ExtrusionFeature[] = segments.map((seg) => ({
    type: 'Feature',
    properties: {
      height: Math.round(heightForNorm(seg.norm, scale) * 10) / 10,
      color: seg.color,
      norm: seg.norm,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [segmentQuad(seg.coordinates[0], seg.coordinates[1], scale.widthM)],
    },
  }));
  return { type: 'FeatureCollection', features };
}
