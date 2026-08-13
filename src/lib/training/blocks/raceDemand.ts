/**
 * Race-demand model for the living arc (pure, no I/O, no LLM).
 *
 * Turns a race_goals row into a demand object the block generators use to
 * scale endurance volume — most importantly the weekend long-ride progression,
 * which ramps toward a peak fraction of the expected race duration and lands
 * that peak a tier-dependent number of days before race day.
 *
 * Every consumer treats a null demand as "no race data" and falls back to the
 * historical hardcoded prescriptions, so plans without a race are byte-
 * identical to pre-race-demand output.
 *
 * Canonical TS source; mirrored by api/utils/raceDemand.js (serverless JS
 * runtime). If you change either side, update the other.
 */

import type { EventTier } from '@/types/training';

export interface RaceDemandInput {
  race_date?: string | null;
  race_type?: string | null;
  distance_km?: number | string | null;
  elevation_gain_m?: number | string | null;
  goal_time_minutes?: number | null;
  priority?: string | null;
  tier?: string | null;
}

export interface RaceDemand {
  goal_duration_min: number;
  race_type: string | null;
  race_date: string;
  tier: EventTier;
}

// Fraction of the goal race duration the biggest long ride should reach.
const PEAK_FRACTION: Record<EventTier, number> = { A: 0.72, B: 0.65, C: 0.55 };

// The peak long ride lands this many days before race day.
const PEAK_OFFSET_DAYS: Record<EventTier, number> = { A: 18, B: 10, C: 7 };

// Long-ride ramp: each week further from the peak is ~7% shorter.
const RAMP_PER_WEEK = 0.07;

const MIN_LONG_RIDE_MIN = 90;
const MAX_LONG_RIDE_MIN = 330;

// Assumed average speeds (km/h) by race type for goal-duration estimation
// when the athlete hasn't set goal_time_minutes.
const SPEED_KMH_BY_TYPE: Record<string, number> = {
  criterium: 38,
  time_trial: 38,
  road_race: 32,
  gran_fondo: 27,
  century: 27,
  gravel: 26,
  cyclocross: 22,
  mtb: 17,
  other: 26,
};

// Climbing cost: ≈ +5 min per 1000 m of elevation gain.
const MIN_PER_METER_GAIN = 1 / 200;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(fromStr: string, toStr: string): number {
  return Math.round(
    (new Date(toStr + 'T00:00:00Z').getTime() - new Date(fromStr + 'T00:00:00Z').getTime()) /
      86400000
  );
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * Expected race duration in minutes: the athlete's goal time when set,
 * otherwise estimated from distance/elevation/race type. Null when neither
 * a goal time nor a distance is available.
 */
export function estimateGoalDurationMin(race: RaceDemandInput | null | undefined): number | null {
  const goal = Number(race?.goal_time_minutes);
  if (Number.isFinite(goal) && goal > 0) return Math.round(goal);

  const distanceKm = Number(race?.distance_km);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;

  const speed = SPEED_KMH_BY_TYPE[race?.race_type ?? 'other'] ?? SPEED_KMH_BY_TYPE.other;
  const elevationGainM = Number(race?.elevation_gain_m) || 0;
  const durationMin = (60 * distanceKm) / speed + elevationGainM * MIN_PER_METER_GAIN;
  return Math.round(Math.min(720, Math.max(60, durationMin)));
}

/**
 * Normalized race demand threaded through the sequencer ctx as
 * `ctx.race_demand`. Null (no race, no date, or no duration signal) means
 * "generate exactly the historical hardcoded plan".
 */
export function buildRaceDemand(race: RaceDemandInput | null | undefined): RaceDemand | null {
  if (!race) return null;
  const raceDate = String(race.race_date || '').slice(0, 10);
  if (!YMD_RE.test(raceDate)) return null;
  const goalDurationMin = estimateGoalDurationMin(race);
  if (!goalDurationMin) return null;
  const tierRaw = race.tier || race.priority || 'A';
  const tier: EventTier = tierRaw === 'B' || tierRaw === 'C' ? tierRaw : 'A';
  return {
    goal_duration_min: goalDurationMin,
    race_type: race.race_type || null,
    race_date: raceDate,
    tier,
  };
}

/**
 * The long-ride duration for a given session date: ramps ~7%/week toward a
 * peak of PEAK_FRACTION × goal duration, landing PEAK_OFFSET_DAYS before race
 * day; dates past the peak hold at peak (the taper generator never calls
 * this). Returns fallbackMin verbatim when demand is null — the byte-parity
 * guarantee for race-less plans.
 */
export function longRideTargetMin(
  raceDemand: RaceDemand | null | undefined,
  sessionDate: string,
  fallbackMin: number
): number {
  if (!raceDemand?.goal_duration_min || !YMD_RE.test(String(sessionDate))) {
    return fallbackMin;
  }
  const tier = raceDemand.tier || 'A';
  const peakMin = Math.min(
    MAX_LONG_RIDE_MIN,
    Math.max(120, (PEAK_FRACTION[tier] ?? PEAK_FRACTION.A) * raceDemand.goal_duration_min)
  );
  const peakDate = addDays(raceDemand.race_date, -(PEAK_OFFSET_DAYS[tier] ?? PEAK_OFFSET_DAYS.A));
  const weeksOut = Math.max(0, Math.ceil(daysBetween(sessionDate, peakDate) / 7));
  const ramped = peakMin * (1 - RAMP_PER_WEEK * weeksOut);
  return Math.max(MIN_LONG_RIDE_MIN, Math.min(round5(peakMin), round5(ramped)));
}

/**
 * Z2 RSS for a duration — ≈0.61 RSS/min, the ratio the historical hardcoded
 * long rides used (145→90, 165→100, 180→110).
 */
export function z2RssForDuration(min: number): number {
  return Math.round(min * 0.61);
}

/**
 * Scale factor for non-long Z2 fill days: races beyond 4 h earn up to +40%
 * steady volume. 1.0 when demand is null.
 */
export function volumeScale(raceDemand: RaceDemand | null | undefined): number {
  const goal = raceDemand?.goal_duration_min;
  if (!goal) return 1.0;
  return Math.min(1.4, Math.max(1.0, goal / 240));
}
