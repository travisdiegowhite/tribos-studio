import {
  classifyOpenerState,
  classifyFormState,
  classifyIntensityVsExpected,
  classifyWeekPosture,
} from './heroContext.js';
import { DEFAULT_FS_THRESHOLDS } from './archetypeOverrides.js';

const fs = DEFAULT_FS_THRESHOLDS;

describe('classifyOpenerState', () => {
  it('returns returning_from_layoff when days since last ride >= 7', () => {
    expect(classifyOpenerState({ daysSinceLastRide: 7, formScore: 0, fsThresholds: fs }))
      .toBe('returning_from_layoff');
    expect(classifyOpenerState({ daysSinceLastRide: 14, formScore: 20, fsThresholds: fs }))
      .toBe('returning_from_layoff');
  });

  it('returns resuming when 3-6 days since last ride', () => {
    expect(classifyOpenerState({ daysSinceLastRide: 3, formScore: 0, fsThresholds: fs }))
      .toBe('resuming');
    expect(classifyOpenerState({ daysSinceLastRide: 6, formScore: 10, fsThresholds: fs }))
      .toBe('resuming');
  });

  it('returns deeply_fatigued when form score below deeply_fatigued threshold', () => {
    expect(classifyOpenerState({ daysSinceLastRide: 1, formScore: -20, fsThresholds: fs }))
      .toBe('deeply_fatigued');
  });

  it('returns carrying_fatigue when form score in fatigued band', () => {
    expect(classifyOpenerState({ daysSinceLastRide: 1, formScore: -8, fsThresholds: fs }))
      .toBe('carrying_fatigue');
  });

  it('returns fresh when form score above fresh threshold', () => {
    expect(classifyOpenerState({ daysSinceLastRide: 1, formScore: 10, fsThresholds: fs }))
      .toBe('fresh');
  });

  it('returns holding in the neutral band', () => {
    expect(classifyOpenerState({ daysSinceLastRide: 1, formScore: 0, fsThresholds: fs }))
      .toBe('holding');
  });
});

describe('classifyFormState', () => {
  it('maps to fresh/neutral/fatigued/deeply_fatigued', () => {
    expect(classifyFormState(10, fs)).toBe('fresh');
    expect(classifyFormState(0, fs)).toBe('neutral');
    expect(classifyFormState(-8, fs)).toBe('fatigued');
    expect(classifyFormState(-20, fs)).toBe('deeply_fatigued');
  });
});

describe('classifyIntensityVsExpected', () => {
  it('returns none when there is no last ride', () => {
    expect(classifyIntensityVsExpected(null, null)).toBe('none');
  });

  it('returns unplanned when there is no planned match', () => {
    expect(classifyIntensityVsExpected({ rss: 50 }, null)).toBe('unplanned');
  });

  it('returns above when actual is >15% over target', () => {
    expect(classifyIntensityVsExpected({ rss: 120 }, { target_tss: 100 }))
      .toBe('above');
  });

  it('returns below when actual is >15% under target', () => {
    expect(classifyIntensityVsExpected({ rss: 80 }, { target_tss: 100 }))
      .toBe('below');
  });

  it('returns near when within +/-15%', () => {
    expect(classifyIntensityVsExpected({ rss: 105 }, { target_tss: 100 }))
      .toBe('near');
  });
});

describe('classifyWeekPosture', () => {
  it('nothing_planned when no workouts planned', () => {
    expect(classifyWeekPosture({ plannedThisWeek: 0, completedThisWeek: 0, daysIntoWeek: 2 }))
      .toBe('nothing_planned');
  });

  it('ahead when completed rides outpace the expected ratio', () => {
    // Day 3 of 7 → expected ratio ~ 0.57. Completing 5/5 = 1.0 ⇒ ahead.
    expect(classifyWeekPosture({ plannedThisWeek: 5, completedThisWeek: 5, daysIntoWeek: 2 }))
      .toBe('ahead');
  });

  it('behind when completion ratio trails expected by >0.25', () => {
    // Day 6 of 7 → expected ratio ~ 1.0. Completing 1/5 = 0.2 ⇒ behind.
    expect(classifyWeekPosture({ plannedThisWeek: 5, completedThisWeek: 1, daysIntoWeek: 5 }))
      .toBe('behind');
  });

  it('on_track when ratio is within the band', () => {
    // daysIntoWeek=3 (day 4 of 7) → expected ratio = 4/7 ≈ 0.57.
    // Completing 3/5 = 0.6 lands inside the ±band ⇒ on_track.
    expect(classifyWeekPosture({ plannedThisWeek: 5, completedThisWeek: 3, daysIntoWeek: 3 }))
      .toBe('on_track');
  });
});
