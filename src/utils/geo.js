// Pure spatial helpers for Route Builder familiar-roads awareness (Unit 3).
//
// All inputs are canonical [lng, lat] arrays (CLAUDE.md coordinate contract).
// No I/O, no DB — easy to unit-test.

import { haversineMeters, M_TO_KM } from './distanceUnits';

const KM_PER_DEGREE_LAT = 111;

/**
 * Compute a bounding box centered on a coordinate, expanded by an
 * approximate radius in kilometers. Used to scope familiar-segment
 * queries to the candidate routing area.
 *
 * Approximation is fine here — 1° lat ≈ 111 km, 1° lng ≈ 111 × cos(lat).
 * We're constraining a Supabase query, not navigating.
 *
 * @param {[number, number]} centerLngLat - [lng, lat] in degrees
 * @param {number} radiusKm
 * @returns {{ minLat: number, maxLat: number, minLng: number, maxLng: number }}
 */
export function computeBboxAround(centerLngLat, radiusKm) {
  const [lng, lat] = centerLngLat;
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  // Guard against cos(lat) → 0 near the poles (irrelevant in practice
  // but keeps the math safe). Use a sensible floor.
  const safeCosLat = Math.max(Math.abs(cosLat), 0.01);
  const lngDelta = radiusKm / (KM_PER_DEGREE_LAT * safeCosLat);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/**
 * Compute a soft recency multiplier in [1, 1 + recencyWeight/100].
 *
 * A segment ridden today gets the upper bound; a segment ridden the
 * full `decayDays` ago gets 1.0. Older than that, still 1.0 — the
 * decay-cutoff filter upstream handles hard exclusion.
 *
 * recencyWeight=0 → multiplier is always 1.0 (knob is off).
 */
function recencyMultiplier(lastRiddenAt, recencyWeight, decayDays) {
  if (!recencyWeight || recencyWeight <= 0) return 1;
  if (!lastRiddenAt) return 1;
  const ageMs = Date.now() - new Date(lastRiddenAt).getTime();
  if (ageMs < 0) return 1 + recencyWeight / 100;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (!decayDays || decayDays <= 0 || ageDays >= decayDays) return 1;
  const freshness = 1 - ageDays / decayDays; // 1.0 today → 0.0 at cutoff
  return 1 + (recencyWeight / 100) * freshness;
}

/**
 * Given an array of segments (each with start_lat/start_lng/end_lat/end_lng
 * and optional last_ridden_at) and a start location, return the share of
 * familiar mileage in each of four cardinal directions from start.
 *
 * Buckets by larger axis: segments mostly east of start go in 'east',
 * mostly north → 'north', etc. Segment length is computed via
 * haversineMeters since the RPC does not return segment_length_m.
 *
 * If recencyWeight > 0, each segment's km contribution is scaled by a
 * recency multiplier so recently-ridden segments count more.
 *
 * Returned values sum to 1.0 (or all zero if there's no usable data).
 *
 * @param {Array<object>} segments - RPC rows: { start_lat, start_lng, end_lat, end_lng, last_ridden_at }
 * @param {[number, number]} startLngLat - [lng, lat] of route start
 * @param {number} [recencyWeight=0] - 0..100 from user_road_preferences
 * @param {number} [decayDays=180] - familiarity_decay_days
 * @returns {{ east: number, west: number, north: number, south: number }}
 */
export function computeDirectionalBias(
  segments,
  startLngLat,
  recencyWeight = 0,
  decayDays = 180,
) {
  const [startLng, startLat] = startLngLat;
  const buckets = { east: 0, west: 0, north: 0, south: 0 };

  for (const seg of segments) {
    const sLat = Number(seg.start_lat);
    const sLng = Number(seg.start_lng);
    const eLat = Number(seg.end_lat);
    const eLng = Number(seg.end_lng);
    if (
      !Number.isFinite(sLat) || !Number.isFinite(sLng) ||
      !Number.isFinite(eLat) || !Number.isFinite(eLng)
    ) continue;

    const midLat = (sLat + eLat) / 2;
    const midLng = (sLng + eLng) / 2;
    const dLng = midLng - startLng;
    const dLat = midLat - startLat;

    const lengthKm = M_TO_KM(haversineMeters(sLat, sLng, eLat, eLng));
    const weighted = lengthKm * recencyMultiplier(seg.last_ridden_at, recencyWeight, decayDays);

    if (Math.abs(dLng) >= Math.abs(dLat)) {
      if (dLng >= 0) buckets.east += weighted;
      else buckets.west += weighted;
    } else {
      if (dLat >= 0) buckets.north += weighted;
      else buckets.south += weighted;
    }
  }

  const total = buckets.east + buckets.west + buckets.north + buckets.south;
  if (total === 0) return { east: 0, west: 0, north: 0, south: 0 };

  return {
    east: Number((buckets.east / total).toFixed(2)),
    west: Number((buckets.west / total).toFixed(2)),
    north: Number((buckets.north / total).toFixed(2)),
    south: Number((buckets.south / total).toFixed(2)),
  };
}
