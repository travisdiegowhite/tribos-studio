/**
 * rideFlyThrough — pure path math for the ride map's playback camera.
 *
 * The animation loop lives in useRideFlyThrough; everything here is a
 * function of (track, distance along it) so it can be unit-tested.
 * Coordinates are canonical `[lng, lat]`; distances are km along the track,
 * parallel to `coords` (see cumulativeDistancesKm).
 */
import { nearestIndex } from './rideMetricStats';
import { bearingBetween, type LngLat } from './rideMapCamera';

/** Playback camera. Tuned for a ride at street scale. */
export const FLY_ZOOM = 14.3;
export const FLY_PITCH = 66;
/** How far ahead (km) the camera looks to derive its heading. */
export const FLY_LOOKAHEAD_KM = 0.25;
/** Per-frame easing toward the target center and bearing (0–1). */
export const FLY_CENTER_EASE = 0.18;
export const FLY_BEARING_EASE = 0.08;

/** Whole-ride playback length: 1.5 s per km, kept between 20 s and 60 s. */
export function flyThroughDurationS(totalKm: number): number {
  if (!Number.isFinite(totalKm) || totalKm <= 0) return 20;
  return Math.min(60, Math.max(20, totalKm * 1.5));
}

/** Interpolated position on the track at `km`, clamped to the ends. */
export function positionAt(coords: readonly LngLat[], distances_km: readonly number[], km: number): LngLat | null {
  const n = Math.min(coords.length, distances_km.length);
  if (n === 0) return null;
  if (n === 1 || km <= distances_km[0]) return coords[0];
  if (km >= distances_km[n - 1]) return coords[n - 1];
  // First index whose distance is >= km
  let i = nearestIndex(distances_km, km);
  if (distances_km[i] > km) i -= 1;
  if (i < 0) return coords[0];
  if (i >= n - 1) return coords[n - 1];
  const d0 = distances_km[i];
  const d1 = distances_km[i + 1];
  const t = d1 > d0 ? (km - d0) / (d1 - d0) : 0;
  const a = coords[i];
  const b = coords[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Direction of travel at `km`: bearing from here to the point
 * `lookaheadKm` further along (or back from the previous point at the very
 * end). Null when the track is too short to have a direction.
 */
export function headingAt(
  coords: readonly LngLat[],
  distances_km: readonly number[],
  km: number,
  lookaheadKm = FLY_LOOKAHEAD_KM,
): number | null {
  const n = Math.min(coords.length, distances_km.length);
  if (n < 2) return null;
  const total = distances_km[n - 1];
  const here = positionAt(coords, distances_km, km);
  if (!here) return null;
  if (km + lookaheadKm <= total) {
    const ahead = positionAt(coords, distances_km, km + lookaheadKm);
    if (ahead && (ahead[0] !== here[0] || ahead[1] !== here[1])) return bearingBetween(here, ahead);
  }
  const behind = positionAt(coords, distances_km, Math.max(0, km - lookaheadKm));
  if (behind && (behind[0] !== here[0] || behind[1] !== here[1])) return bearingBetween(behind, here);
  return null;
}

/** Shortest-way interpolation between two compass bearings. */
export function lerpAngle(from: number, to: number, t: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  if (delta < -180) delta += 360;
  return (from + delta * t + 360) % 360;
}
