/**
 * Race profiles for the season engine — pure, no I/O.
 *
 * How long to taper and how long to recover depend on how long and how hard a
 * race is, more than on its name: a 50 km gravel race and Unbound 200 share
 * race_type 'gravel'. So a race's profile comes from its EFFORT HOURS:
 *
 *   expected hours (goal time, else distance ÷ speed, else a per-type default)
 *   × a sport load factor (running costs more recovery per hour)
 *   → a band (short / medium / long / ultra) → taper, peak and recover weeks.
 *
 * Every number is a named constant below so it can be tuned.
 */

import { estimateGoalDurationMin } from '../training/blocks/raceDemand.ts';
import type { ProfileBand, RaceProfile, Sport } from './engine.ts';

// ─── Tunable tables ─────────────────────────────────────────────────────────

/** Effort hours = expected hours × this. Running is harder to recover from per hour. */
export const SPORT_LOAD_FACTOR: Record<Sport, number> = { bike: 1, multi: 1, run: 2.5 };

/** Upper bound (exclusive) of effort hours for each band; anything above `long` is ultra. */
export const BAND_MAX_EFFORT_HOURS: Record<Exclude<ProfileBand, 'ultra'>, number> = {
  short: 1.5,
  medium: 4,
  long: 8,
};

/** Taper weeks include the race week. */
export const BAND_PROFILES: Record<ProfileBand, RaceProfile> = {
  short: { band: 'short', taperWeeks: 1, peakWeeks: 1, recoverWeeks: 1 },
  medium: { band: 'medium', taperWeeks: 2, peakWeeks: 2, recoverWeeks: 1 },
  long: { band: 'long', taperWeeks: 2, peakWeeks: 2, recoverWeeks: 2 },
  ultra: { band: 'ultra', taperWeeks: 3, peakWeeks: 2, recoverWeeks: 3 },
};

/** Sport for each race_type. Unknown types (including 'other') are bike. */
export const RACE_TYPE_SPORT: Record<string, Sport> = {
  road_race: 'bike',
  criterium: 'bike',
  time_trial: 'bike',
  gran_fondo: 'bike',
  century: 'bike',
  gravel: 'bike',
  cyclocross: 'bike',
  mtb: 'bike',
  run_5k: 'run',
  run_10k: 'run',
  half_marathon: 'run',
  marathon: 'run',
  trail_run: 'run',
  ultra_run: 'run',
  triathlon: 'multi',
  duathlon: 'multi',
};

/** Average speed (km/h) for runs and multisport when there is a distance but no goal time. Bike types use raceDemand's table. */
export const SPEED_KMH_BY_TYPE: Record<string, number> = {
  run_5k: 12,
  run_10k: 11.5,
  half_marathon: 11,
  marathon: 10,
  trail_run: 8,
  ultra_run: 7,
  triathlon: 20,
  duathlon: 25,
};
const DEFAULT_RUN_SPEED_KMH = 10;
const DEFAULT_MULTI_SPEED_KMH = 20;

/** Expected hours when a race has neither a goal time nor a distance. */
export const DEFAULT_HOURS_BY_TYPE: Record<string, number> = {
  criterium: 1,
  cyclocross: 1,
  time_trial: 1,
  road_race: 3,
  mtb: 2,
  gran_fondo: 5,
  century: 6,
  gravel: 5,
  run_5k: 0.4,
  run_10k: 0.9,
  half_marathon: 2,
  marathon: 4,
  trail_run: 2,
  ultra_run: 8,
  triathlon: 3,
  duathlon: 2,
  other: 3,
};
const FALLBACK_HOURS = 3;

// ─── Functions ──────────────────────────────────────────────────────────────

export interface RaceProfileSource {
  race_type?: string | null;
  distance_km?: number | string | null;
  elevation_gain_m?: number | string | null;
  goal_time_minutes?: number | null;
  /** Overrides the sport implied by race_type (e.g. 'other' that is really a run). */
  sport?: Sport | null;
}

export function sportForRaceType(raceType: string | null | undefined): Sport {
  return RACE_TYPE_SPORT[raceType ?? ''] ?? 'bike';
}

/** Expected race duration in hours. */
export function expectedRaceHours(race: RaceProfileSource): number {
  const type = race.race_type ?? 'other';
  const sport = race.sport ?? sportForRaceType(type);

  const goal = Number(race.goal_time_minutes);
  if (Number.isFinite(goal) && goal > 0) return goal / 60;

  const distanceKm = Number(race.distance_km);
  if (Number.isFinite(distanceKm) && distanceKm > 0) {
    if (sport === 'bike') {
      const min = estimateGoalDurationMin({
        race_type: type,
        distance_km: distanceKm,
        elevation_gain_m: race.elevation_gain_m ?? null,
      });
      if (min) return min / 60;
    } else {
      const fallback = sport === 'run' ? DEFAULT_RUN_SPEED_KMH : DEFAULT_MULTI_SPEED_KMH;
      return distanceKm / (SPEED_KMH_BY_TYPE[type] ?? fallback);
    }
  }

  return DEFAULT_HOURS_BY_TYPE[type] ?? FALLBACK_HOURS;
}

export function bandForEffortHours(effortHours: number): ProfileBand {
  if (effortHours < BAND_MAX_EFFORT_HOURS.short) return 'short';
  if (effortHours < BAND_MAX_EFFORT_HOURS.medium) return 'medium';
  if (effortHours < BAND_MAX_EFFORT_HOURS.long) return 'long';
  return 'ultra';
}

/** The sport and profile to hand the season engine for a race_goals-shaped row. */
export function profileForRace(race: RaceProfileSource): { sport: Sport; profile: RaceProfile; expectedHours: number } {
  const sport = race.sport ?? sportForRaceType(race.race_type);
  const expectedHours = expectedRaceHours({ ...race, sport });
  const band = bandForEffortHours(expectedHours * SPORT_LOAD_FACTOR[sport]);
  return { sport, profile: BAND_PROFILES[band], expectedHours: Math.round(expectedHours * 10) / 10 };
}
