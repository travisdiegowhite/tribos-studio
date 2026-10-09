import { describe, it, expect } from 'vitest';
import { bandForEffortHours, expectedRaceHours, profileForRace, sportForRaceType } from './raceProfile';

describe('sportForRaceType', () => {
  it('maps bike, run and multisport types; unknown is bike', () => {
    expect(sportForRaceType('gravel')).toBe('bike');
    expect(sportForRaceType('marathon')).toBe('run');
    expect(sportForRaceType('triathlon')).toBe('multi');
    expect(sportForRaceType('other')).toBe('bike');
    expect(sportForRaceType(null)).toBe('bike');
  });
});

describe('expectedRaceHours', () => {
  it('prefers the goal time', () => {
    expect(expectedRaceHours({ race_type: 'gravel', distance_km: 300, goal_time_minutes: 600 })).toBe(10);
  });

  it('uses the bike speed table for bike types', () => {
    // 160 km gravel at 26 km/h ≈ 6.2 h
    expect(expectedRaceHours({ race_type: 'gravel', distance_km: 160 })).toBeCloseTo(6.15, 1);
  });

  it('uses a running pace for run types', () => {
    expect(expectedRaceHours({ race_type: 'half_marathon', distance_km: 21.1 })).toBeCloseTo(1.92, 1);
  });

  it('falls back to a per-type default', () => {
    expect(expectedRaceHours({ race_type: 'criterium' })).toBe(1);
    expect(expectedRaceHours({ race_type: 'mystery' })).toBe(3);
  });
});

describe('bandForEffortHours', () => {
  it('splits at 1.5, 4 and 8 hours', () => {
    expect(bandForEffortHours(1.4)).toBe('short');
    expect(bandForEffortHours(1.5)).toBe('medium');
    expect(bandForEffortHours(4)).toBe('long');
    expect(bandForEffortHours(8)).toBe('ultra');
  });
});

describe('profileForRace', () => {
  const band = (race: Parameters<typeof profileForRace>[0]) => profileForRace(race).profile.band;

  it('puts common races in sensible bands', () => {
    expect(band({ race_type: 'criterium' })).toBe('short');
    expect(band({ race_type: 'cyclocross' })).toBe('short');
    expect(band({ race_type: 'road_race' })).toBe('medium');
    expect(band({ race_type: 'gravel', distance_km: 160 })).toBe('long');
    expect(band({ race_type: 'gravel', distance_km: 320 })).toBe('ultra');
  });

  it('weights running harder per hour', () => {
    expect(band({ race_type: 'run_5k' })).toBe('short');
    expect(band({ race_type: 'run_10k' })).toBe('medium');
    expect(band({ race_type: 'half_marathon' })).toBe('long');
    expect(band({ race_type: 'marathon' })).toBe('ultra');
  });

  it('scales triathlon by distance', () => {
    expect(band({ race_type: 'triathlon', distance_km: 25.75 })).toBe('short'); // sprint
    expect(band({ race_type: 'triathlon', distance_km: 51.5 })).toBe('medium'); // olympic
    expect(band({ race_type: 'triathlon', distance_km: 113 })).toBe('long'); // 70.3
    expect(band({ race_type: 'triathlon', distance_km: 226 })).toBe('ultra'); // full
  });

  it('lets an explicit sport override the race type', () => {
    const r = profileForRace({ race_type: 'other', sport: 'run', distance_km: 42.2 });
    expect(r.sport).toBe('run');
    expect(r.profile.band).toBe('ultra');
  });

  it('maps bands to taper / peak / recover weeks', () => {
    expect(profileForRace({ race_type: 'criterium' }).profile).toEqual({ band: 'short', taperWeeks: 1, peakWeeks: 1, recoverWeeks: 1 });
    expect(profileForRace({ race_type: 'marathon' }).profile).toEqual({ band: 'ultra', taperWeeks: 3, peakWeeks: 2, recoverWeeks: 3 });
  });
});
