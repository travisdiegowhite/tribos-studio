/**
 * rideZones — the per-ride zone boundaries shared by the ride detail map and
 * the zones chart, so a segment colored "Z4" on the map is the same Z4 the
 * bar chart counts.
 *
 * Power: canonical 7-zone boundaries as % of FTP, lockstep with
 * TRAINING_ZONES (src/utils/trainingPlans.ts) and the DB trigger
 * calculate_power_zones (55/75/90/105/120/150 %FTP).
 * Heart rate: 5 zones as % of max HR.
 *
 * Classification is "highest zone whose lower bound the value meets", so
 * lower bounds are inclusive and a value below every lower bound is Z1.
 */

import { getRouteZoneColor } from '../components/ui/zoneColors';

export interface ZoneDef {
  zone: number;
  name: string;
  /** Lower bound, inclusive, in percent of the reference (FTP or max HR). */
  min: number;
  /** Upper bound, exclusive, in percent. */
  max: number;
}

export const POWER_ZONE_DEFS: readonly ZoneDef[] = [
  { zone: 1, name: 'Recovery', min: 0, max: 55 },
  { zone: 2, name: 'Endurance', min: 55, max: 75 },
  { zone: 3, name: 'Tempo', min: 75, max: 90 },
  { zone: 4, name: 'Threshold', min: 90, max: 105 },
  { zone: 5, name: 'VO2max', min: 105, max: 120 },
  { zone: 6, name: 'Anaerobic', min: 120, max: 150 },
  { zone: 7, name: 'Neuromuscular', min: 150, max: 9999 },
];

export const HR_ZONE_DEFS: readonly ZoneDef[] = [
  { zone: 1, name: 'Recovery', min: 0, max: 60 },
  { zone: 2, name: 'Endurance', min: 60, max: 70 },
  { zone: 3, name: 'Tempo', min: 70, max: 80 },
  { zone: 4, name: 'Threshold', min: 80, max: 90 },
  { zone: 5, name: 'VO2max+', min: 90, max: 200 },
];

/**
 * Run heart-rate zones as % of lactate threshold HR (multisport phase 4),
 * used when the athlete has entered an LTHR. % of max HR is a poor anchor
 * for running, where threshold sits much closer to max than on the bike.
 */
export const LTHR_ZONE_DEFS: readonly ZoneDef[] = [
  { zone: 1, name: 'Recovery', min: 0, max: 85 },
  { zone: 2, name: 'Aerobic', min: 85, max: 90 },
  { zone: 3, name: 'Tempo', min: 90, max: 95 },
  { zone: 4, name: 'Threshold', min: 95, max: 100 },
  { zone: 5, name: 'VO2max+', min: 100, max: 200 },
];

/** Zone def for a value given its reference (FTP / max HR), or null if unusable. */
export function zoneFor(
  defs: readonly ZoneDef[],
  value: number | null | undefined,
  reference: number | null | undefined,
): ZoneDef | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (reference == null || !Number.isFinite(reference) || reference <= 0) return null;
  const pct = (value / reference) * 100;
  for (let i = defs.length - 1; i >= 0; i--) {
    if (pct >= defs[i].min) return defs[i];
  }
  return defs[0];
}

export function powerZoneFor(watts: number | null | undefined, ftp: number | null | undefined): ZoneDef | null {
  return zoneFor(POWER_ZONE_DEFS, watts, ftp);
}

export function hrZoneFor(bpm: number | null | undefined, maxHr: number | null | undefined): ZoneDef | null {
  return zoneFor(HR_ZONE_DEFS, bpm, maxHr);
}

/**
 * Zone colors for every surface that paints a ride zone (the ride map's
 * power/HR modes and their legend). They come from the brand zone palette in
 * src/components/ui/zoneColors.js (cyan, ultramarine, lime, magenta, ink,
 * deep magenta, graphite) so Z4 is the same magenta on the map as in the
 * Progress tab's Power section. No orange or red.
 */
export const ZONE_COLORS: readonly string[] = [1, 2, 3, 4, 5, 6, 7].map((z) => getRouteZoneColor(z));

export function zoneColor(zone: number): string {
  return ZONE_COLORS[Math.min(ZONE_COLORS.length, Math.max(1, zone)) - 1];
}

/** Absolute lower bound of a zone in the metric's own unit (W or bpm). */
export function zoneLowerBound(def: ZoneDef, reference: number): number {
  return Math.round((reference * def.min) / 100);
}
