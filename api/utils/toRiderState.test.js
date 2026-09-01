import { describe, it, expect } from 'vitest';
import {
  toRiderState,
  rideIntensity,
  rideLoadWeight,
  midZoneShare,
  sessionCounts,
  goalTypeFor,
  dailyRss7d,
  rss3wkMean,
  MIN_RIDES_FOR_DISTRIBUTION,
  daysBetween,
  isCyclingActivity,
  isStrengthActivity,
  countStrengthSessions,
} from './toRiderState.js';

const TODAY = '2026-09-01';

/** Daily load rows for the N days before TODAY, oldest first. */
function loadSeries(days, rssFor) {
  const todayMs = Date.parse(`${TODAY}T00:00:00Z`);
  const rows = [];
  for (let back = days; back >= 1; back--) {
    const date = new Date(todayMs - back * 86400000).toISOString().slice(0, 10);
    rows.push({ date, tfi: 60, afi: 55, form_score: 5, rss: rssFor(back) });
  }
  return rows;
}

describe('rideIntensity', () => {
  it('prefers the stored canonical value', () => {
    expect(rideIntensity({ ride_intensity: 0.82, intensity_factor: 0.4, effective_power: 400 }, 200)).toBe(0.82);
  });

  it('falls back to the legacy column', () => {
    expect(rideIntensity({ intensity_factor: 0.71 }, 200)).toBe(0.71);
  });

  it('derives RI from effective power over FTP — the spec definition', () => {
    expect(rideIntensity({ effective_power: 255 }, 300)).toBe(0.85);
  });

  it('is null rather than guessed from average power alone', () => {
    expect(rideIntensity({ average_watts: 240 }, 300)).toBeNull();
    expect(rideIntensity({ effective_power: 255 }, null)).toBeNull();
    expect(rideIntensity({ effective_power: 255 }, 0)).toBeNull();
    expect(rideIntensity({}, 300)).toBeNull();
  });
});

describe('rideLoadWeight', () => {
  it('prefers a stored load, canonical before legacy', () => {
    expect(rideLoadWeight({ rss: 88, tss: 91, moving_time: 3600 }, 0.9)).toBe(88);
    expect(rideLoadWeight({ tss: 91, moving_time: 3600 }, 0.9)).toBe(91);
  });

  it('derives the base term of the spec formula when no load is stored', () => {
    // RI 1.0 for exactly one hour is 100 by definition.
    expect(rideLoadWeight({ moving_time: 3600 }, 1)).toBe(100);
    expect(rideLoadWeight({ moving_time: 7200 }, 0.7)).toBeCloseTo(98, 6);
  });

  it('is null with no duration to work from', () => {
    expect(rideLoadWeight({ moving_time: 0 }, 0.8)).toBeNull();
    expect(rideLoadWeight({ moving_time: 3600 }, null)).toBeNull();
  });
});

describe('midZoneShare', () => {
  const ride = (ri, seconds = 3600) => ({
    type: 'Ride', sport_type: 'ROAD_BIKING', effective_power: ri * 250, moving_time: seconds,
  });

  it('is null below the minimum ride count', () => {
    const rides = Array.from({ length: MIN_RIDES_FOR_DISTRIBUTION - 1 }, () => ride(0.85));
    expect(midZoneShare(rides, 250)).toBeNull();
  });

  it('is null when too few rides carry an intensity', () => {
    // Eight rides, two with power. Live coverage is around this bad for most
    // athletes, and a share off two rides is not a fact about their month.
    const rides = [ride(0.85), ride(0.85), ...Array.from({ length: 6 }, () => ({ type: 'Ride', moving_time: 3600 }))];
    expect(midZoneShare(rides, 250)).toBeNull();
  });

  it('is null when FTP is unknown and nothing is stored', () => {
    expect(midZoneShare(Array.from({ length: 8 }, () => ride(0.85)), null)).toBeNull();
  });

  it('measures the tempo-to-threshold share by load, not by ride count', () => {
    const rides = [
      ride(0.85, 3600), ride(0.85, 3600), ride(0.85, 3600),
      ride(0.55, 3600), ride(0.55, 3600), ride(0.55, 3600),
    ];
    const share = midZoneShare(rides, 250);
    // Three mid rides at 72.25 each vs three easy at 30.25 each.
    expect(share).toBeCloseTo((3 * 72.25) / (3 * 72.25 + 3 * 30.25), 4);
  });

  it('excludes efforts above the threshold band from the middle', () => {
    const rides = Array.from({ length: 8 }, (_, i) => ride(i < 4 ? 1.05 : 0.5));
    expect(midZoneShare(rides, 250)).toBe(0);
  });
});

describe('sessionCounts', () => {
  it('is null/null for an athlete who does not use the calendar', () => {
    expect(sessionCounts([])).toEqual({ hard: null, easy: null });
    expect(sessionCounts(null)).toEqual({ hard: null, easy: null });
  });

  it('counts only completed, non-rest sessions', () => {
    const entries = [
      { status: 'done', workout_type: 'intervals' },
      { status: 'done', workout_type: 'endurance' },
      { status: 'planned', workout_type: 'intervals' },
      { status: 'skipped', workout_type: 'intervals' },
      { status: 'done', workout_type: 'rest' },
    ];
    expect(sessionCounts(entries)).toEqual({ hard: 1, easy: 1 });
  });

  it('returns a real zero once the athlete has completed sessions', () => {
    // The distinction that matters: zero hard sessions among five logged
    // easy ones is a fact; zero among nothing logged is not.
    const entries = Array.from({ length: 5 }, () => ({ status: 'done', workout_type: 'endurance' }));
    expect(sessionCounts(entries)).toEqual({ hard: 0, easy: 5 });
  });
});

describe('isCyclingActivity', () => {
  it('recognises the Strava vocabulary', () => {
    expect(isCyclingActivity({ type: 'Ride' })).toBe(true);
    expect(isCyclingActivity({ type: 'VirtualRide' })).toBe(true);
    expect(isCyclingActivity({ type: 'GravelRide' })).toBe(true);
  });

  it('recognises the Garmin vocabulary that getSportType does not', () => {
    expect(isCyclingActivity({ sport_type: 'ROAD_BIKING', type: null })).toBe(true);
    expect(isCyclingActivity({ sport_type: 'CYCLING', type: null })).toBe(true);
    expect(isCyclingActivity({ sport_type: 'MOUNTAIN_BIKING', type: null })).toBe(true);
  });

  it('rejects everything else', () => {
    for (const a of [
      { sport_type: 'RUNNING', type: 'Run' },
      { sport_type: 'TRAIL_RUNNING', type: 'TrailRun' },
      { sport_type: 'STRENGTH_TRAINING', type: 'WeightTraining' },
      { sport_type: 'HIKING', type: 'Hike' },
      {},
    ]) {
      expect(isCyclingActivity(a), JSON.stringify(a)).toBe(false);
    }
  });
});

describe('midZoneShare excludes non-rides', () => {
  it('does not read running power against a cycling FTP', () => {
    // Live data: runs carry effective_power of 350-430W. Against a 340W
    // cycling FTP that is RI 1.1+, which would score every jog as a hard
    // ride and invert the share.
    const runs = Array.from({ length: 6 }, () => ({
      sport_type: 'RUNNING', type: 'Run', effective_power: 390, moving_time: 3600,
    }));
    const easyRides = Array.from({ length: 6 }, () => ({
      sport_type: 'ROAD_BIKING', type: 'Ride', effective_power: 170, moving_time: 3600,
    }));
    expect(midZoneShare([...runs, ...easyRides], 340)).toBe(0);
  });
});

describe('isStrengthActivity', () => {
  it('recognises both vocabularies', () => {
    expect(isStrengthActivity({ type: 'WeightTraining' })).toBe(true);
    expect(isStrengthActivity({ sport_type: 'STRENGTH_TRAINING' })).toBe(true);
    expect(isStrengthActivity({ type: 'Ride', sport_type: 'ROAD_BIKING' })).toBe(false);
  });
});

describe('countStrengthSessions', () => {
  const at = (date) => ({ start_date: `${date}T10:00:00Z`, type: 'WeightTraining', sport_type: 'STRENGTH_TRAINING' });

  it('is null for an athlete who has never logged strength anywhere', () => {
    // A Strava-only athlete who lifts looks exactly like one who does not:
    // api/strava-webhook.js drops WeightTraining on import. Reporting 0 here
    // fires MST-3-strength at every masters athlete forever.
    expect(countStrengthSessions({ strength: [], strengthHistory: [] }, TODAY)).toBeNull();
    expect(countStrengthSessions({}, TODAY)).toBeNull();
  });

  it('counts device-imported sessions inside the window', () => {
    const data = { strength: [], strengthHistory: [at('2026-08-20'), at('2026-08-27')] };
    expect(countStrengthSessions(data, TODAY)).toBe(2);
  });

  it('counts the manual cross-training logger too', () => {
    const data = {
      strength: [{ activity_date: '2026-08-15', activity_types: { category: 'strength' } }],
      strengthHistory: [at('2026-08-20')],
    };
    expect(countStrengthSessions(data, TODAY)).toBe(2);
  });

  it('ignores non-strength cross-training', () => {
    const data = {
      strength: [{ activity_date: '2026-08-15', activity_types: { category: 'flexibility' } }],
      strengthHistory: [at('2026-08-20')],
    };
    expect(countStrengthSessions(data, TODAY)).toBe(1);
  });

  it('reports a real zero once the athlete has proved their data can show it', () => {
    // Logged strength six months ago, none in the last eight weeks. That IS
    // a gap, and MST-3-strength should fire on it.
    const data = { strength: [], strengthHistory: [at('2026-03-01')] };
    expect(countStrengthSessions(data, TODAY)).toBe(0);
  });
});

describe('daysBetween', () => {
  it('counts calendar days regardless of time of day', () => {
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0);
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-08-07', '2026-09-01')).toBe(25);
  });

  it('is null on a missing or malformed date', () => {
    expect(daysBetween(null, '2026-09-01')).toBeNull();
    expect(daysBetween('nope', '2026-09-01')).toBeNull();
  });
});

describe('goalTypeFor', () => {
  it('sorts long days from race days', () => {
    expect(goalTypeFor({ race_type: 'gravel' })).toBe('endurance_event');
    expect(goalTypeFor({ race_type: 'gran_fondo' })).toBe('endurance_event');
    expect(goalTypeFor({ race_type: 'century' })).toBe('endurance_event');
    expect(goalTypeFor({ race_type: 'criterium' })).toBe('race');
    expect(goalTypeFor({ race_type: 'cyclocross' })).toBe('race');
  });

  it('is general fitness with no goal event', () => {
    expect(goalTypeFor(null)).toBe('general_fitness');
  });
});

describe('dailyRss7d', () => {
  it('returns the last seven days, oldest first', () => {
    const rows = loadSeries(14, (back) => 100 - back);
    expect(dailyRss7d(rows, TODAY)).toEqual([93, 94, 95, 96, 97, 98, 99]);
  });

  it('is null when the series has a hole rather than padding it with zero', () => {
    // The rollforward cron writes a row for every day including rest days, so
    // a gap means the series is untrustworthy — padding it would manufacture
    // a monotony verdict out of missing data.
    const rows = loadSeries(14, (back) => 100 - back).filter((r, i) => i !== 10);
    expect(dailyRss7d(rows, TODAY)).toBeNull();
  });

  it('is null with no rows', () => {
    expect(dailyRss7d([], TODAY)).toBeNull();
    expect(dailyRss7d(null, TODAY)).toBeNull();
  });
});

describe('rss3wkMean', () => {
  it('averages the three weeks before the last one, per week', () => {
    const rows = loadSeries(28, () => 50);
    // 21 days at 50 → 1050 over three weeks → 350 per week.
    expect(rss3wkMean(rows, TODAY)).toBe(350);
  });

  it('is null without enough of the window', () => {
    expect(rss3wkMean(loadSeries(10, () => 50), TODAY)).toBeNull();
  });
});

// ─── The adapter as a whole ──────────────────────────────────────────────────

describe('toRiderState', () => {
  const base = {
    profile: { date_of_birth: '1974-03-02', ftp: 250 },
    coachSettings: { coaching_persona: 'hammer' },
    load: loadSeries(28, () => 50),
    activities: [
      { start_date: '2026-08-31T14:00:00Z', moving_time: 5400, effective_power: 212, type: 'Ride', sport_type: 'ROAD_BIKING' },
      { start_date: '2026-08-29T14:00:00Z', moving_time: 3600, effective_power: 212, type: 'Ride', sport_type: 'ROAD_BIKING' },
    ],
    calendar: [{ date: '2026-08-28', workout_type: 'intervals', status: 'done' }],
    strength: [],
  };

  it('maps the fields it can measure', () => {
    const s = toRiderState(base, {
      raceGoals: [{ name: 'Gravel Worlds', race_date: '2026-10-13', race_type: 'gravel', priority: 'A' }],
      todayStr: TODAY,
    });

    expect(s.age).toBe(52);
    expect(s.persona).toBe('hammer');
    expect(s.goalType).toBe('endurance_event');
    expect(s.weeksToEvent).toBe(6);
    expect(s.tfi).toBe(60);
    expect(s.afi).toBe(55);
    expect(s.fs).toBe(5);
    expect(s.rss7d).toHaveLength(7);
    expect(s.rss3wkMean).toBe(350);
    expect(s.hardSessions4wk).toBe(1);
    expect(s.weeklyHours4wkMean).toBeCloseTo(0.625, 3);
    expect(s.daysSinceLastRide).toBe(1); // last ride was 2026-08-31
  });

  it('treats "pending" persona as no persona', () => {
    const s = toRiderState({ ...base, coachSettings: { coaching_persona: 'pending' } }, { todayStr: TODAY });
    expect(s.persona).toBeNull();
  });

  it('leaves strength null when no source has ever shown any', () => {
    expect(toRiderState(base, { todayStr: TODAY }).strengthSessions8wk).toBeNull();
    expect(toRiderState({ ...base, strength: null }, { todayStr: TODAY }).strengthSessions8wk).toBeNull();
  });

  it('counts strength from whichever source has it', () => {
    const strength = [
      { activity_date: '2026-08-20', activity_types: { category: 'strength' } },
      { activity_date: '2026-08-13', activity_types: { category: 'flexibility' } },
    ];
    expect(toRiderState({ ...base, strength }, { todayStr: TODAY }).strengthSessions8wk).toBe(1);

    const strengthHistory = [
      { start_date: '2026-08-18T16:00:00Z', type: 'WeightTraining', sport_type: 'STRENGTH_TRAINING' },
    ];
    expect(toRiderState({ ...base, strengthHistory }, { todayStr: TODAY }).strengthSessions8wk).toBe(1);
  });

  it('leaves the Phase 3 and Phase 4 fields null', () => {
    const s = toRiderState(base, { todayStr: TODAY });
    for (const field of [
      'wellness', 'wellnessLowStreak', 'hrvBelowBandDays', 'hrvReadings7d', 'illnessFlag',
      'freshVsFatiguedDrop5min', 'longRideDecoupling', 'eventTempDeltaC', 'fearOfFailureFlag',
    ]) {
      expect(s[field], field).toBeNull();
    }
  });

  it('maps the evidence trends when the engine has run', () => {
    const evidenceSignals = {
      efficiency_factor: { qualified: true, score: 1 },
      power_duration: {
        qualified: true,
        movements: {
          p60: { attempted: true, movementPct: -8.0 },
          p300: { attempted: true, movementPct: -8.0 },
          p1200: { attempted: true, movementPct: 4.0 },
        },
      },
    };
    const s = toRiderState(base, { evidenceSignals, todayStr: TODAY });
    expect(s.efTrend).toBe('ahead');
    expect(s.pdShortTrend).toBe('behind');
    expect(s.pdLongTrend).toBe('ahead');
  });

  it('leaves the evidence trends null when the engine has never run', () => {
    // fitness_evidence_weekly does not exist in production yet, so this is
    // the live path, not an edge case.
    const s = toRiderState(base, { evidenceSignals: null, todayStr: TODAY });
    expect(s.efTrend).toBeNull();
    expect(s.pdShortTrend).toBeNull();
    expect(s.pdLongTrend).toBeNull();
  });

  it('produces an all-null state rather than throwing when every fetch failed', () => {
    const s = toRiderState(null, { todayStr: TODAY });
    expect(s.age).toBeNull();
    expect(s.tfi).toBeNull();
    expect(s.midZoneShare4wk).toBeNull();
    expect(s.hardSessions4wk).toBeNull();
    expect(s.goalType).toBe('general_fitness');
  });
});
