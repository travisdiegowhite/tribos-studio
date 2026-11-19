/**
 * Pure helpers behind the coach's visuals: slicing a track by distance,
 * combining power curves over a period, and the labels the chips and
 * captions use. No React, no Supabase — tested in visualData.test.ts.
 */

import { cumulativeDistancesKm } from '../../../utils/streamChartData';

const KM_PER_MILE = 1.609344;

type LngLat = [number, number] | [number, number, number];

/** Flatten a LineString / MultiLineString to one coordinate list. */
export function geometryCoords(geometry: GeoJSON.Geometry | null | undefined): LngLat[] {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return geometry.coordinates as LngLat[];
  if (geometry.type === 'MultiLineString') return (geometry.coordinates as LngLat[][]).flat();
  return [];
}

/**
 * The part of a [lng, lat(, ele)] track between two distances along it.
 * Returns the whole track when the range is missing or invalid, and an
 * empty list when the range lies entirely past the end.
 */
export function sliceCoordsByKm(coords: LngLat[], range_km?: [number, number] | null): LngLat[] {
  if (!range_km || !(range_km[1] > range_km[0])) return coords;
  const distances_km = cumulativeDistancesKm(coords.map((c) => [c[0], c[1]] as [number, number]));
  return coords.filter((_, i) => distances_km[i] >= range_km[0] && distances_km[i] <= range_km[1]);
}

/** A LineString of the stretch, or the original geometry when there is no range. */
export function sliceGeometryByKm(
  geometry: GeoJSON.Geometry | null | undefined,
  range_km?: [number, number] | null,
): GeoJSON.Geometry | null {
  if (!geometry) return null;
  if (!range_km) return geometry;
  const sliced = sliceCoordsByKm(geometryCoords(geometry), range_km);
  return sliced.length >= 2 ? { type: 'LineString', coordinates: sliced } : geometry;
}

/** Best power per duration key across activities' `power_curve_summary` JSONB. */
export function combinePowerCurves(
  summaries: Array<Record<string, number | null> | null | undefined>,
): Record<string, number> {
  const best: Record<string, number> = {};
  for (const s of summaries) {
    if (!s || typeof s !== 'object') continue;
    for (const [key, watts] of Object.entries(s)) {
      if (typeof watts === 'number' && Number.isFinite(watts) && watts > 0 && watts > (best[key] ?? 0)) {
        best[key] = watts;
      }
    }
  }
  return best;
}

/** "31.2–36.8 km" (or miles for imperial riders). Distances stay km internally. */
export function formatRangeKm(range_km: [number, number], isImperial = false): string {
  const [a, b] = isImperial ? [range_km[0] / KM_PER_MILE, range_km[1] / KM_PER_MILE] : range_km;
  return `${a.toFixed(1)}–${b.toFixed(1)} ${isImperial ? 'mi' : 'km'}`;
}

/** "Sat 15 Nov" from an ISO date or timestamp. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Round a selected range to 0.1 km so chips and stored focus stay tidy. */
export function roundRangeKm(start_km: number, end_km: number): [number, number] {
  const lo = Math.max(0, Math.min(start_km, end_km));
  const hi = Math.max(start_km, end_km);
  return [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10];
}
