/**
 * Distance/elevation formatting for the Today glance.
 *
 * One unit system, driven by the user profile setting (the redesign spec's
 * "pick one distance unit globally" rule). All glance surfaces — hero stats,
 * route distance, ribbon — format through these helpers so mi/km never mix.
 *
 * The `Today` object always carries canonical km / m (per the distance-unit
 * convention in CLAUDE.md); conversion to display happens here at the edge.
 */

export type UnitsPreference = 'imperial' | 'metric';

const KM_PER_MILE = 1.609344;
const M_PER_FOOT = 0.3048;

export function formatDistanceKm(km: number, units: UnitsPreference): string {
  if (!Number.isFinite(km)) return '—';
  if (units === 'imperial') {
    return `${(km / KM_PER_MILE).toFixed(1)} mi`;
  }
  return `${km.toFixed(1)} km`;
}

export function formatElevationM(m: number, units: UnitsPreference): string {
  if (!Number.isFinite(m)) return '—';
  if (units === 'imperial') {
    return `${Math.round(m / M_PER_FOOT)} ft`;
  }
  return `${Math.round(m)} m`;
}

export function formatDurationMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h}h ${m}m`;
}
