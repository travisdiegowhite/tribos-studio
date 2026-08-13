import { describe, it, expect } from 'vitest';
import {
  estimateGoalDurationMin,
  buildRaceDemand,
  longRideTargetMin,
  z2RssForDuration,
  volumeScale,
} from './raceDemand.js';

// The production race this fix was diagnosed against.
const THE_RAD = {
  name: 'The Rad',
  race_date: '2026-09-26',
  race_type: 'gravel',
  distance_km: 177.03,
  elevation_gain_m: 3048,
  priority: 'A',
  goal_time_minutes: 390,
};

describe('estimateGoalDurationMin', () => {
  it('prefers the athlete-set goal time', () => {
    expect(estimateGoalDurationMin(THE_RAD)).toBe(390);
  });

  it('estimates from distance + elevation + race type when no goal time', () => {
    const noGoal = { ...THE_RAD, goal_time_minutes: null };
    // 60*177.03/26 + 3048/200 ≈ 408.5 + 15.2 ≈ 424
    expect(estimateGoalDurationMin(noGoal)).toBe(424);
  });

  it('uses the default speed for unknown race types', () => {
    const est = estimateGoalDurationMin({ distance_km: 52, race_type: 'weird' });
    expect(est).toBe(120); // 60*52/26
  });

  it('clamps to [60, 720]', () => {
    expect(estimateGoalDurationMin({ distance_km: 5, race_type: 'criterium' })).toBe(60);
    expect(estimateGoalDurationMin({ distance_km: 400, race_type: 'mtb' })).toBe(720);
  });

  it('returns null when there is no duration signal', () => {
    expect(estimateGoalDurationMin({})).toBeNull();
    expect(estimateGoalDurationMin({ race_type: 'gravel' })).toBeNull();
    expect(estimateGoalDurationMin({ distance_km: 0 })).toBeNull();
  });

  it('tolerates numeric-string columns (Supabase numerics)', () => {
    const est = estimateGoalDurationMin({
      distance_km: '177.03',
      elevation_gain_m: '3048',
      race_type: 'gravel',
      goal_time_minutes: null,
    });
    expect(est).toBe(424);
  });
});

describe('buildRaceDemand', () => {
  it('builds the demand object for a complete race', () => {
    expect(buildRaceDemand({ ...THE_RAD, tier: 'A' })).toEqual({
      goal_duration_min: 390,
      race_type: 'gravel',
      race_date: '2026-09-26',
      tier: 'A',
    });
  });

  it('falls back to priority for tier, and A for junk', () => {
    expect(buildRaceDemand(THE_RAD).tier).toBe('A');
    expect(buildRaceDemand({ ...THE_RAD, priority: 'B' }).tier).toBe('B');
    expect(buildRaceDemand({ ...THE_RAD, priority: 'Z' }).tier).toBe('A');
  });

  it('returns null without a race, a valid date, or a duration signal', () => {
    expect(buildRaceDemand(null)).toBeNull();
    expect(buildRaceDemand({ ...THE_RAD, race_date: null })).toBeNull();
    expect(buildRaceDemand({ race_date: '2026-09-26' })).toBeNull();
  });
});

describe('longRideTargetMin', () => {
  const demand = buildRaceDemand(THE_RAD); // A-tier, goal 390 → peak 280 min on 2026-09-08

  it('returns the fallback verbatim when demand is null', () => {
    expect(longRideTargetMin(null, '2026-08-15', 165)).toBe(165);
    expect(longRideTargetMin(undefined, '2026-08-15', 145)).toBe(145);
  });

  it('ramps toward the peak across the production dates', () => {
    // peak = 0.72*390 = 280.8 → round5 280; peak date = Sep 26 − 18d = Sep 8
    expect(longRideTargetMin(demand, '2026-08-15', 165)).toBe(200); // 4 wks out
    expect(longRideTargetMin(demand, '2026-08-22', 165)).toBe(220); // 3 wks out
    expect(longRideTargetMin(demand, '2026-08-29', 150)).toBe(240); // 2 wks out
    expect(longRideTargetMin(demand, '2026-09-05', 165)).toBe(260); // 1 wk out
    expect(longRideTargetMin(demand, '2026-09-08', 165)).toBe(280); // at peak
  });

  it('holds at peak after the peak date', () => {
    expect(longRideTargetMin(demand, '2026-09-20', 165)).toBe(280);
  });

  it('never drops below the 90-min floor', () => {
    const farOut = longRideTargetMin(demand, '2024-01-01', 145);
    expect(farOut).toBeGreaterThanOrEqual(90);
  });

  it('uses smaller peaks for B/C tiers', () => {
    const b = buildRaceDemand({ ...THE_RAD, priority: 'B' });
    const c = buildRaceDemand({ ...THE_RAD, priority: 'C' });
    // B: 0.65*390 = 253.5 → peak 255 (Sep 16); C: 0.55*390 = 214.5 → 215 (Sep 19)
    expect(longRideTargetMin(b, '2026-09-16', 165)).toBe(255);
    expect(longRideTargetMin(c, '2026-09-19', 165)).toBe(215);
  });

  it('caps the peak at 330 min for extreme races', () => {
    const ultra = buildRaceDemand({ ...THE_RAD, goal_time_minutes: 700 });
    expect(longRideTargetMin(ultra, '2026-09-08', 165)).toBe(330);
  });
});

describe('z2RssForDuration / volumeScale', () => {
  it('matches the historical hardcoded RSS ratio', () => {
    expect(z2RssForDuration(145)).toBe(88);
    expect(z2RssForDuration(180)).toBe(110);
    expect(z2RssForDuration(280)).toBe(171);
  });

  it('scales fill volume up to 1.4x for long races', () => {
    expect(volumeScale(null)).toBe(1.0);
    expect(volumeScale(buildRaceDemand({ ...THE_RAD, goal_time_minutes: 120 }))).toBe(1.0);
    expect(volumeScale(buildRaceDemand({ ...THE_RAD, goal_time_minutes: 300 }))).toBe(1.25);
    expect(volumeScale(buildRaceDemand(THE_RAD))).toBe(1.4);
  });
});
