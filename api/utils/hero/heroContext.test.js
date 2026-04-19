import {
  classifyOpenerState,
  classifyFormState,
  classifyIntensityVsExpected,
  classifyWeekPosture,
  classifyFitnessTrend,
  classifyWorkoutType,
  mapBlockPhase,
} from './heroContext.js';
import { DEFAULT_FS_THRESHOLDS } from './archetypeOverrides.js';

const fs = DEFAULT_FS_THRESHOLDS;

describe('classifyOpenerState', () => {
  const base = {
    hasActivePlan: true,
    hasRecentActivity: true,
    daysSinceLastRide: 1,
    efi: 80,
    blockPhase: 'base',
    fitnessTrend: 'maintaining',
  };

  it('cold_start when rider has no active plan', () => {
    expect(classifyOpenerState({ ...base, hasActivePlan: false })).toBe('cold_start');
  });

  it('cold_start when rider has no recent activity', () => {
    expect(classifyOpenerState({ ...base, hasRecentActivity: false })).toBe('cold_start');
  });

  it('resuming when days since last ride >= 2', () => {
    expect(classifyOpenerState({ ...base, daysSinceLastRide: 2 })).toBe('resuming');
    expect(classifyOpenerState({ ...base, daysSinceLastRide: 5 })).toBe('resuming');
  });

  it('drifting when EFI is below 60', () => {
    expect(classifyOpenerState({ ...base, efi: 45 })).toBe('drifting');
  });

  it('peaking when phase is taper or peak', () => {
    expect(classifyOpenerState({ ...base, blockPhase: 'taper' })).toBe('peaking');
    expect(classifyOpenerState({ ...base, blockPhase: 'peak' })).toBe('peaking');
  });

  it('recovering when phase is recovery or trend is recovering/detraining', () => {
    expect(classifyOpenerState({ ...base, blockPhase: 'recovery' })).toBe('recovering');
    expect(classifyOpenerState({ ...base, fitnessTrend: 'recovering' })).toBe('recovering');
    expect(classifyOpenerState({ ...base, fitnessTrend: 'detraining' })).toBe('recovering');
  });

  it('building as default when nothing else fires', () => {
    expect(classifyOpenerState(base)).toBe('building');
  });
});

describe('classifyFormState', () => {
  it('maps to fresh / neutral / fatigued / deeply_fatigued', () => {
    expect(classifyFormState(10, fs)).toBe('fresh');
    expect(classifyFormState(0, fs)).toBe('neutral');
    expect(classifyFormState(-8, fs)).toBe('fatigued');
    expect(classifyFormState(-20, fs)).toBe('deeply_fatigued');
  });
});

describe('classifyIntensityVsExpected', () => {
  it('returns as_expected when there is no last ride', () => {
    expect(classifyIntensityVsExpected(null, null)).toBe('as_expected');
  });

  it('returns as_expected when there is no planned match', () => {
    expect(classifyIntensityVsExpected({ rss: 50 }, null)).toBe('as_expected');
  });

  it('returns harder when actual exceeds target by >20%', () => {
    expect(classifyIntensityVsExpected({ rss: 130 }, { target_tss: 100 })).toBe('harder');
  });

  it('returns easier when actual is more than 20% under target', () => {
    expect(classifyIntensityVsExpected({ rss: 70 }, { target_tss: 100 })).toBe('easier');
  });

  it('returns as_expected when within +/-20%', () => {
    expect(classifyIntensityVsExpected({ rss: 110 }, { target_tss: 100 })).toBe('as_expected');
  });
});

describe('classifyWeekPosture', () => {
  it('nothing_planned when no workouts planned', () => {
    expect(classifyWeekPosture({ plannedThisWeek: 0, completedThisWeek: 0, daysIntoWeek: 2 }))
      .toBe('nothing_planned');
  });

  it('ahead when completion outpaces the expected ratio', () => {
    expect(classifyWeekPosture({ plannedThisWeek: 5, completedThisWeek: 5, daysIntoWeek: 2 }))
      .toBe('ahead');
  });

  it('behind when trailing the expected ratio', () => {
    expect(classifyWeekPosture({ plannedThisWeek: 5, completedThisWeek: 1, daysIntoWeek: 5 }))
      .toBe('behind');
  });

  it('on_track within the band', () => {
    expect(classifyWeekPosture({ plannedThisWeek: 5, completedThisWeek: 3, daysIntoWeek: 3 }))
      .toBe('on_track');
  });
});

describe('classifyFitnessTrend', () => {
  it('maps delta-% into the four trend states', () => {
    expect(classifyFitnessTrend(12)).toBe('building');
    expect(classifyFitnessTrend(3)).toBe('maintaining');
    expect(classifyFitnessTrend(-1)).toBe('maintaining');
    expect(classifyFitnessTrend(-5)).toBe('recovering');
    expect(classifyFitnessTrend(-12)).toBe('detraining');
  });

  it('defaults to maintaining when null/invalid', () => {
    expect(classifyFitnessTrend(null)).toBe('maintaining');
    expect(classifyFitnessTrend(undefined)).toBe('maintaining');
    expect(classifyFitnessTrend(Number.NaN)).toBe('maintaining');
  });
});

describe('mapBlockPhase', () => {
  it('maps derivePhase blockName strings to the spec enum', () => {
    expect(mapBlockPhase('Base Building')).toBe('base');
    expect(mapBlockPhase('Build')).toBe('build');
    expect(mapBlockPhase('Peak')).toBe('peak');
    expect(mapBlockPhase('Taper')).toBe('taper');
    expect(mapBlockPhase('Recovery Week')).toBe('recovery');
    expect(mapBlockPhase(null)).toBe('base');
  });
});

describe('classifyWorkoutType', () => {
  it('prefers planned workout_type over activity type', () => {
    expect(classifyWorkoutType({ workout_type: 'vo2max' }, { type: 'Ride' })).toBe('vo2');
    expect(classifyWorkoutType({ workout_type: 'threshold' }, null)).toBe('threshold');
    expect(classifyWorkoutType({ workout_type: 'sweet_spot' }, null)).toBe('sweet_spot');
    expect(classifyWorkoutType({ workout_type: 'recovery_spin' }, null)).toBe('recovery');
    expect(classifyWorkoutType({ workout_type: 'tempo' }, null)).toBe('tempo');
    expect(classifyWorkoutType({ workout_type: 'race' }, null)).toBe('race');
    expect(classifyWorkoutType({ workout_type: 'long_endurance' }, null)).toBe('long_ride');
  });

  it('falls back to endurance when nothing matches', () => {
    expect(classifyWorkoutType(null, { type: 'Ride' })).toBe('endurance');
    expect(classifyWorkoutType(null, null)).toBe('endurance');
  });
});
