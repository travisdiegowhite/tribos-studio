/**
 * Running pace: one formatter for every run surface (multisport phase 4).
 *
 * Pace used to be formatted in three places, each always per km — so an
 * imperial runner read "5:00" on the Activities table, "8:03/mi" in the
 * analysis modal and "5:00/km" in the route builder for the same run. Paces
 * are seconds per km internally; only the label converts.
 */

const KM_PER_MILE = 1.609344;

/** Slower than this (≈16:40/km) is standing around, not running. */
export const MIN_CREDIBLE_RUN_SPEED_MPS = 1;

/** Seconds per km from a distance and a time; null when it isn't a credible pace. */
export function paceSecPerKm(
  distance_m: number | null | undefined,
  seconds: number | null | undefined,
): number | null {
  const d = Number(distance_m);
  const t = Number(seconds);
  if (!(d > 0) || !(t > 0)) return null;
  if (d / t < MIN_CREDIBLE_RUN_SPEED_MPS) return null;
  return (t / d) * 1000;
}

/** Seconds per km from a speed in m/s; null below a credible running speed. */
export function speedToPaceSecPerKm(mps: number | null | undefined): number | null {
  const v = Number(mps);
  if (!(v >= MIN_CREDIBLE_RUN_SPEED_MPS)) return null;
  return 1000 / v;
}

/** "4:30" — minutes and seconds only. */
export function formatPaceClock(secPerUnit: number): string {
  let mins = Math.floor(secPerUnit / 60);
  let secs = Math.round(secPerUnit % 60);
  if (secs === 60) {
    mins += 1;
    secs = 0;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Seconds per km → seconds per display unit (km or mile). */
export function paceForUnits(secPerKm: number, isImperial: boolean): number {
  return isImperial ? secPerKm * KM_PER_MILE : secPerKm;
}

/** "4:30/km" or "7:15/mi"; '—' when unknown. */
export function formatPace(secPerKm: number | null | undefined, isImperial = false): string {
  if (!(Number(secPerKm) > 0)) return '—';
  return `${formatPaceClock(paceForUnits(Number(secPerKm), isImperial))}/${isImperial ? 'mi' : 'km'}`;
}

/** "/km" or "/mi". */
export function paceUnit(isImperial: boolean): string {
  return isImperial ? '/mi' : '/km';
}
