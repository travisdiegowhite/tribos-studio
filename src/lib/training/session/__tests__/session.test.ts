import { describe, it, expect } from 'vitest';
import {
  resolveSession,
  powerZoneFor,
  paceZoneFor,
  zoneColor,
  complianceFor,
  bandForRatio,
  sportNoun,
  doneLabel,
  activityNoun,
  normalizeSport,
  usesPower,
  stepsFromStructure,
  stepsMinutes,
  stepsLoad,
  fitSteps,
  peakZone,
} from '..';
import { WORKOUT_LIBRARY } from '../../../../data/workoutLibrary';

const TODAY = '2026-11-21';

describe('zones', () => {
  it('uses one set of inclusive %FTP edges', () => {
    expect(powerZoneFor(55)).toBe(1);
    expect(powerZoneFor(75)).toBe(2);
    expect(powerZoneFor(76)).toBe(3);
    expect(powerZoneFor(90)).toBe(3.5);
    expect(powerZoneFor(105)).toBe(4);
    expect(powerZoneFor(106)).toBe(5);
    expect(powerZoneFor(200)).toBe(7);
  });

  it('zones a run by % of threshold pace (higher = slower)', () => {
    expect(paceZoneFor(100)).toBe(4);
    expect(paceZoneFor(110)).toBe(3);
    expect(paceZoneFor(125)).toBe(2);
    expect(paceZoneFor(150)).toBe(1);
    expect(paceZoneFor(90)).toBe(5);
    expect(paceZoneFor(80)).toBe(6);
  });

  it('gives every zone a real CSS variable (no invisible VO2 bars)', () => {
    expect(zoneColor(5)).toBe('var(--zone-5)');
    expect(zoneColor(3.5)).toBe('var(--zone-3-5)');
    expect(zoneColor(null)).toBe('var(--color-border)');
  });
});

describe('sport copy', () => {
  it('names each sport', () => {
    expect(sportNoun('running')).toBe('run');
    expect(sportNoun('cycling', { plural: true, capital: true })).toBe('Rides');
    expect(sportNoun('other')).toBe('session');
    expect(doneLabel('running')).toBe('Run');
    expect(doneLabel('cycling')).toBe('Ridden');
    expect(activityNoun(['cycling', 'running'])).toBe('activities');
    expect(activityNoun(['Run', 'TRAIL_RUNNING'])).toBe('runs');
  });

  it('normalizes provider spellings', () => {
    expect(normalizeSport('VirtualRide')).toBe('cycling');
    expect(normalizeSport('TRAIL_RUNNING')).toBe('running');
    expect(normalizeSport('WeightTraining')).toBe('other');
    expect(usesPower('running')).toBe(false);
  });
});

describe('compliance', () => {
  const planned = { load: 55, durationMin: 60 };

  it('bands like TrainingPeaks / intervals.icu', () => {
    expect(bandForRatio(1)).toBe('on_target');
    expect(bandForRatio(0.8)).toBe('on_target');
    expect(bandForRatio(1.21)).toBe('partial');
    expect(bandForRatio(0.5)).toBe('partial');
    expect(bandForRatio(0.49)).toBe('off');
    expect(bandForRatio(1.6)).toBe('off');
  });

  it('compares on load first', () => {
    // The 2026-11-20 sweet spot: planned 55, ridden 49.
    const c = complianceFor({ planned, actual: { load: 49, durationMin: 50 }, status: 'done', date: '2026-11-20', today: TODAY });
    expect(c).toEqual({ band: 'on_target', ratio: 0.89, basis: 'load' });
  });

  it('falls back to time when the plan has no load', () => {
    const c = complianceFor({ planned: { durationMin: 60 }, actual: { durationMin: 30 }, status: 'done', date: '2026-11-20', today: TODAY });
    expect(c.basis).toBe('time');
    expect(c.band).toBe('partial');
  });

  it('tells missed, skipped, upcoming and unplanned apart', () => {
    expect(complianceFor({ planned, status: 'planned', date: '2026-11-19', today: TODAY }).band).toBe('missed');
    expect(complianceFor({ planned, status: 'skipped', date: '2026-11-19', today: TODAY }).band).toBe('skipped');
    expect(complianceFor({ planned, status: 'planned', date: TODAY, today: TODAY }).band).toBe('upcoming');
    expect(complianceFor({ planned: null, actual: { load: 40 }, status: 'done', today: TODAY }).band).toBe('unplanned');
  });
});

describe('steps', () => {
  it('flattens a library ride with zones from its %FTP', () => {
    const steps = stepsFromStructure(WORKOUT_LIBRARY.four_by_eight_vo2.structure, 'cycling');
    expect(stepsMinutes(steps)).toBe(69);
    const work = steps.filter((s) => s.phase === 'work');
    expect(work).toHaveLength(4);
    expect(work[0].target?.kind).toBe('power');
    expect(peakZone(steps)).toBe(5);
  });

  it('fits a longer day with easy time, never longer reps', () => {
    const steps = stepsFromStructure(WORKOUT_LIBRARY.four_by_eight_vo2.structure, 'cycling');
    const fitted = fitSteps(steps, 120);
    expect(stepsMinutes(fitted)).toBeCloseTo(120, 0);
    expect(fitted.filter((s) => s.phase === 'work').every((s) => s.durationMin === 8)).toBe(true);
  });

  it('never shrinks the reps on a short day', () => {
    const steps = stepsFromStructure(WORKOUT_LIBRARY.four_by_eight_vo2.structure, 'cycling');
    const fitted = fitSteps(steps, 30);
    expect(fitted.filter((s) => s.phase === 'work').every((s) => s.durationMin === 8)).toBe(true);
  });
});

describe('resolveSession', () => {
  it('draws the designer sweet spot exactly, with its planned and actual load', () => {
    const s = resolveSession(
      {
        id: 'e1',
        scheduled_date: '2026-11-20',
        entry_type: 'workout',
        name: 'Sweet Spot Intervals',
        workout_id: 'three_by_ten_sst',
        workout_type: 'sweet_spot',
        sport: 'cycling',
        target_duration: 60,
        target_rss: 55,
        actual_rss: 49,
        actual_duration: 50,
        activity_id: 'a1',
        status: 'done',
        details: {
          prescription: {
            version: 1,
            source: 'designer',
            predicted_load: 55,
            warmup_min: 10,
            cooldown_min: 6,
            intervals: [{ repeats: 3, duration_min: 12, recovery_min: 4, target_pct_ftp_min: 82, target_pct_ftp_max: 86 }],
          },
        },
      },
      { today: TODAY },
    );
    expect(s.source).toBe('prescribed');
    expect(s.sport).toBe('cycling');
    expect(s.steps.filter((x) => x.phase === 'work')).toHaveLength(3);
    expect(s.steps.find((x) => x.phase === 'work')?.target).toEqual({ kind: 'power', value: 84, min: 82, max: 86 });
    // The library workout_id is provenance only: its 3×10 text must not describe this 3×12.
    expect(s.description).toBeNull();
    expect(s.compliance.band).toBe('on_target');
  });

  it('keeps a coach run prescription as pace, not a cycling stand-in', () => {
    const s = resolveSession(
      {
        scheduled_date: '2026-11-25',
        entry_type: 'workout',
        name: 'Threshold Run',
        workout_type: 'threshold',
        sport: 'running',
        target_duration: 50,
        details: {
          prescription: {
            version: 1,
            source: 'coach',
            basis: 'pace',
            intervals: [{ repeats: 4, duration_min: 5, recovery_min: 2, target_pct_threshold_pace_min: 98, target_pct_threshold_pace_max: 102 }],
          },
        },
      },
      { today: TODAY },
    );
    expect(s.source).toBe('prescribed');
    const work = s.steps.filter((x) => x.phase === 'work');
    expect(work).toHaveLength(4);
    expect(work[0].target).toEqual({ kind: 'pace', value: 100, min: 98, max: 102 });
    expect(work[0].zone).toBe(4);
    expect(s.workout?.sportType).toBe('running');
  });

  it('draws an untyped run from the running library, not a bike workout', () => {
    const s = resolveSession(
      { scheduled_date: '2026-11-27', name: 'Easy Run', workout_type: 'endurance', sport: 'running', target_duration: 40 },
      { today: TODAY },
    );
    expect(s.source).toBe('inferred');
    expect(s.workout?.sportType).toBe('running');
    expect(s.steps.every((x) => x.target?.kind === 'pace')).toBe(true);
  });

  it('uses a running library workout\'s pace structure, fitted to the day', () => {
    const s = resolveSession(
      { scheduled_date: '2026-11-22', name: 'Long Run', workout_id: 'run_long_run', workout_type: 'endurance', sport: 'running', target_duration: 100 },
      { today: TODAY },
    );
    expect(s.source).toBe('library');
    expect(stepsMinutes(s.steps)).toBeCloseTo(100, 0);
    expect(s.description).toBeTruthy();
  });

  it('has no steps for gym work, rest or a note', () => {
    expect(resolveSession({ name: 'Hip Mobility', workout_type: 'strength', sport: 'other', target_duration: 20 }, { today: TODAY }).steps).toEqual([]);
    expect(resolveSession({ entry_type: 'rest', name: 'Rest' }, { today: TODAY }).kind).toBe('rest');
    expect(resolveSession({ entry_type: 'note', name: 'Travel' }, { today: TODAY }).sport).toBeNull();
  });

  it('marks a past planned session missed', () => {
    const s = resolveSession(
      { scheduled_date: '2026-11-18', name: 'Foundation', workout_type: 'endurance', sport: 'cycling', target_duration: 60, target_rss: 48, status: 'planned' },
      { today: TODAY },
    );
    expect(s.compliance.band).toBe('missed');
  });

  it('fills planned numbers from the structure when the row has none', () => {
    const s = resolveSession({ name: 'VO2', workout_id: 'four_by_eight_vo2', sport: 'cycling' }, { today: TODAY });
    expect(s.planned.durationMin).toBe(75);
    expect(s.planned.load).toBe(stepsLoad(s.steps));
  });
});
