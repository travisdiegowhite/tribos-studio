/**
 * zones — the one definition of training zones for every training graphic.
 *
 * Before this module the app had four zone colour tables and two zone-edge
 * rules (`<=` in the shape resolver, `<` in the route overlay), so a 75% set
 * was Z2 in the workout modal and Z3 on the map, VO2 bars were invisible
 * (`var(--mantine-color-red.8-6)` is not a variable) and sweet spot and
 * threshold shared one colour (the theme maps both `orange` and `red` to
 * magenta). Every surface now asks this module.
 *
 * Rides are zoned by %FTP (Coggan 7 + sweet spot). Runs are zoned by % of
 * threshold PACE — 100 = threshold, higher = slower — on the six zones of
 * `src/utils/paceZones.ts`. Both share one colour ramp (`--zone-*` in
 * global.css, theme-aware), so a run's Z4 and a ride's Z4 read alike.
 */

import type { TrainingZone } from '../../../types/training';

export type ZoneKey = TrainingZone;

export interface ZoneDef {
  zone: ZoneKey;
  /** "Sweet spot", "Threshold" … */
  label: string;
  /** "Z3.5" */
  short: string;
}

/** Inclusive upper %FTP edge of each power zone (the library's edges). */
const POWER_EDGES: Array<[number, ZoneKey]> = [
  [55, 1],
  [75, 2],
  [87, 3],
  [94, 3.5],
  [105, 4],
  [120, 5],
  [150, 6],
];

/** The zone a %FTP figure falls in. 75 → Z2, 76 → Z3, 105 → Z4, 106 → Z5. */
export function powerZoneFor(pctFtp: number): ZoneKey {
  for (const [edge, zone] of POWER_EDGES) if (pctFtp <= edge) return zone;
  return 7;
}

/** Nominal %FTP of each power zone, for segments that name only a zone. */
export const POWER_ZONE_PCT: Record<number, number> = {
  1: 50,
  2: 65,
  3: 80,
  3.5: 90,
  4: 100,
  5: 115,
  6: 135,
  7: 170,
};

export const POWER_ZONES: Record<number, ZoneDef> = {
  1: { zone: 1, label: 'Recovery', short: 'Z1' },
  2: { zone: 2, label: 'Endurance', short: 'Z2' },
  3: { zone: 3, label: 'Tempo', short: 'Z3' },
  3.5: { zone: 3.5, label: 'Sweet spot', short: 'SS' },
  4: { zone: 4, label: 'Threshold', short: 'Z4' },
  5: { zone: 5, label: 'VO2', short: 'Z5' },
  6: { zone: 6, label: 'Anaerobic', short: 'Z6' },
  7: { zone: 7, label: 'Sprint', short: 'Z7' },
};

/**
 * Lower %-of-threshold-pace edge of each run zone (slower pace = bigger
 * number), from `calculatePaceZones`: Z1 ≥135, Z2 ≥115, Z3 ≥103, Z4 ≥97,
 * Z5 ≥86, Z6 faster.
 */
const PACE_EDGES: Array<[number, ZoneKey]> = [
  [135, 1],
  [115, 2],
  [103, 3],
  [97, 4],
  [86, 5],
];

/** The run zone a %-of-threshold-pace figure falls in. 100 → Z4, 110 → Z3. */
export function paceZoneFor(pctThresholdPace: number): ZoneKey {
  for (const [edge, zone] of PACE_EDGES) if (pctThresholdPace >= edge) return zone;
  return 6;
}

/** Nominal %-of-threshold-pace of each run zone (its middle). */
export const PACE_ZONE_PCT: Record<number, number> = {
  1: 142,
  2: 125,
  3: 109,
  4: 100,
  5: 92,
  6: 80,
};

export const PACE_ZONES: Record<number, ZoneDef> = {
  1: { zone: 1, label: 'Recovery', short: 'Z1' },
  2: { zone: 2, label: 'Easy', short: 'Z2' },
  3: { zone: 3, label: 'Tempo', short: 'Z3' },
  4: { zone: 4, label: 'Threshold', short: 'Z4' },
  5: { zone: 5, label: 'VO2', short: 'Z5' },
  6: { zone: 6, label: 'Speed', short: 'Z6' },
};

/** The zone table for a sport: pace zones for a run, power zones otherwise. */
export function zonesFor(sport: string | null | undefined): Record<number, ZoneDef> {
  return sport === 'running' ? PACE_ZONES : POWER_ZONES;
}

/** CSS colour for a zone: the theme-aware `--zone-*` variable. */
export function zoneColor(zone: ZoneKey | number | null | undefined): string {
  if (zone == null) return 'var(--color-border)';
  const key = zone === 3.5 ? '3-5' : String(zone);
  return `var(--zone-${key})`;
}

/**
 * Intensity as a fraction of threshold, for heights and load maths: %FTP / 100
 * for a ride, threshold pace / pace for a run (a pace 10% slower than
 * threshold is ~0.91 of threshold speed).
 */
export function intensityFromPowerPct(pctFtp: number): number {
  return pctFtp / 100;
}

export function intensityFromPacePct(pctThresholdPace: number): number {
  return pctThresholdPace > 0 ? 100 / pctThresholdPace : 0;
}

/**
 * The four effort tones the workout graphic inks in — the same groups and
 * role colours as the calendar session cards (src/utils/calendarSessionTone.ts),
 * so a session reads the same on the card and in its profile. The graphic is
 * an ink trace on paper; only effort gets colour (tribos design, not a
 * seven-colour zone rainbow).
 */
export type EffortTone = 'easy' | 'endurance' | 'tempo' | 'hard';

export function effortTone(zone: ZoneKey | number | null | undefined): EffortTone {
  if (zone == null || zone <= 1) return 'easy';
  if (zone <= 2) return 'endurance';
  if (zone < 4) return 'tempo';
  return 'hard';
}

export const TONE_FILL: Record<EffortTone, { fill: string; label: string }> = {
  easy: { fill: 'var(--chart-bar)', label: 'Easy' },
  endurance: { fill: 'var(--color-accent)', label: 'Endurance' },
  tempo: { fill: 'var(--color-highlight)', label: 'Tempo' },
  hard: { fill: 'var(--color-signal)', label: 'Hard' },
};
