/**
 * rideGeo — one place that answers "can this activity be drawn on a map, and
 * with what?" for every surface that mounts ColoredRouteMap (the /train hero,
 * the HISTORY browser, the Today zone-03 card and RideAnalysisModal).
 *
 * Pure: no React, no Supabase. Reads the activities row shape as stored
 * (Strava / Garmin / Wahoo / FIT-upload variants) and normalises the answer.
 */

import { decodePolyline } from '../views/today/shared/decodePolyline';
import type { RawStreams } from './streamChartData';

export type RideStreams = RawStreams;

/** Sentinel guard shared with RideAnalysisModal: FIT writes 0xFFFF for "no data". */
export const MAX_VALID_HR_BPM = 250;

type RideRow = Record<string, unknown> & { id?: string };

/**
 * The encoded summary polyline, trying every historical column variant
 * (including the Strava-shaped nested `map.summary_polyline`).
 */
export function ridePolylineOf(ride: RideRow | null | undefined): string | null {
  if (!ride) return null;
  const nested = (ride.map as { summary_polyline?: string | null } | null | undefined)?.summary_polyline;
  return (
    (ride.map_summary_polyline as string | null) ||
    (ride.summary_polyline as string | null) ||
    (ride.polyline as string | null) ||
    nested ||
    null
  );
}

/** The per-point metric streams (activities.activity_streams), or null. */
export function rideStreamsOf(ride: RideRow | null | undefined): RideStreams | null {
  const streams = ride?.activity_streams;
  return streams && typeof streams === 'object' ? (streams as RideStreams) : null;
}

/** True when the streams carry a drawable track (≥ 2 coordinates). */
export function rideHasStreamTrack(ride: RideRow | null | undefined): boolean {
  return (rideStreamsOf(ride)?.coords?.length ?? 0) >= 2;
}

/** True when there is anything at all to draw: a stream track or a polyline. */
export function rideHasGps(ride: RideRow | null | undefined): boolean {
  return rideHasStreamTrack(ride) || Boolean(ridePolylineOf(ride));
}

/** The decoded summary polyline as canonical [lng, lat] pairs (empty when none). */
export function rideRouteCoords(ride: RideRow | null | undefined): Array<[number, number]> {
  return decodePolyline(ridePolylineOf(ride));
}

/**
 * The ride's own max heart rate, or null when absent or a FIT sentinel.
 * Drives the HR zone colouring on the map, so a 65535 must never get through.
 */
export function sanitizedMaxHr(ride: RideRow | null | undefined): number | null {
  const raw = Number(ride?.max_heartrate);
  return raw > 0 && raw < MAX_VALID_HR_BPM ? raw : null;
}

export interface GpsRideSelection<T> {
  ride: T | null;
  /** Index into the list, or -1 when the list is empty. */
  index: number;
  /** A newer ride exists (lower index; lists are newest-first). */
  hasNewer: boolean;
  /** An older ride exists (higher index). */
  hasOlder: boolean;
}

/**
 * Resolve the selected ride in a newest-first list. A null or unknown id
 * falls back to the newest ride, so a selection survives the list being
 * replaced (e.g. a gear merge re-creating every row object).
 */
export function selectGpsRide<T extends { id: string }>(
  gpsRides: readonly T[],
  selectedId: string | null | undefined,
): GpsRideSelection<T> {
  if (gpsRides.length === 0) return { ride: null, index: -1, hasNewer: false, hasOlder: false };
  const found = selectedId ? gpsRides.findIndex((r) => r.id === selectedId) : -1;
  const index = found >= 0 ? found : 0;
  return {
    ride: gpsRides[index],
    index,
    hasNewer: index > 0,
    hasOlder: index < gpsRides.length - 1,
  };
}
