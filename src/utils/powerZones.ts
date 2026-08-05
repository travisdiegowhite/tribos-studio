/**
 * powerZones — the single client-side source for power-zone boundaries.
 *
 * Boundaries come from `user_profiles.power_zones` (written by the Postgres
 * trigger `calculate_power_zones(ftp)`, migration 002) when available, else
 * are derived from FTP with the same 55/75/90/105/120/150 %FTP breakpoints
 * the trigger uses — the two paths always agree.
 *
 * Colors are deliberately NOT resolved here: callers pass the current theme
 * tokens at render time (`useThemeTokens().tokens.colors.zone1..zone7`) so
 * dark mode stays correct. Never capture tokens at module load.
 */

export interface PowerZone {
  /** 1-based zone number (1–7) */
  zone: number;
  name: string;
  /** Inclusive lower bound in watts */
  minWatts: number;
  /** Exclusive upper bound in watts; null for the open-ended top zone */
  maxWatts: number | null;
}

/** Zone upper-bound breakpoints as fractions of FTP (z1–z6; z7 is open). */
export const ZONE_FTP_BREAKPOINTS = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5] as const;

export const ZONE_NAMES = [
  'Active Recovery',
  'Endurance',
  'Tempo',
  'Threshold',
  'VO2max',
  'Anaerobic',
  'Neuromuscular',
] as const;

/** Shape of one zone entry in the user_profiles.power_zones JSONB. */
interface ProfileZoneEntry {
  name?: string;
  min?: number;
  max?: number | null;
}

export type ProfilePowerZones = Record<string, ProfileZoneEntry>;

/**
 * Derive the 7 zones from FTP using the DB trigger's breakpoints.
 * Returns null without a usable FTP.
 */
export function zonesFromFtp(ftp: number | null | undefined): PowerZone[] | null {
  if (!ftp || !Number.isFinite(ftp) || ftp <= 0) return null;
  const bounds = [0, ...ZONE_FTP_BREAKPOINTS.map((f) => Math.round(ftp * f))];
  return ZONE_NAMES.map((name, i) => ({
    zone: i + 1,
    name,
    minWatts: bounds[i],
    maxWatts: i < ZONE_FTP_BREAKPOINTS.length ? bounds[i + 1] : null,
  }));
}

/**
 * Resolve zones from the profile JSONB (z1..z7 entries) with an FTP-derived
 * fallback. Malformed/partial JSONB falls back rather than mixing sources.
 */
export function resolvePowerZones(
  ftp: number | null | undefined,
  profileZones?: ProfilePowerZones | null
): PowerZone[] | null {
  if (profileZones) {
    const zones: PowerZone[] = [];
    for (let i = 1; i <= 7; i++) {
      const entry = profileZones[`z${i}`];
      if (!entry || typeof entry.min !== 'number') break;
      zones.push({
        zone: i,
        name: entry.name || ZONE_NAMES[i - 1],
        minWatts: entry.min,
        maxWatts: i === 7 ? null : typeof entry.max === 'number' ? entry.max : null,
      });
    }
    if (zones.length === 7) return zones;
  }
  return zonesFromFtp(ftp);
}

/**
 * 0-based index of the zone containing `watts` (0–6). Zones are half-open
 * [min, max); the top zone is open-ended.
 */
export function zoneIndexForPower(watts: number, zones: PowerZone[]): number {
  for (let i = zones.length - 1; i >= 1; i--) {
    if (watts >= zones[i].minWatts) return i;
  }
  return 0;
}

/**
 * The theme's zone colors in zone order. Pass `useThemeTokens().tokens` at
 * render time — never a module-scope tokens import (dark-mode bug class).
 */
export function zoneColorsFromTokens(tokens: {
  colors: Record<string, string>;
}): string[] {
  return [1, 2, 3, 4, 5, 6, 7].map((i) => tokens.colors[`zone${i}`]);
}
