import { describe, it, expect } from 'vitest';
import {
  K_CLIMB,
  estimateRunLoad,
  estimateRunThresholds,
  gradedPaceSecPerKm,
  hasUsableHr,
  hrTss,
  resolveRunProfile,
} from './runLoad.js';

const run = (over = {}) => ({
  type: 'Run',
  sport_type: 'Run',
  moving_time: 3600,
  distance: 12000,
  total_elevation_gain: 0,
  ...over,
});

const PROFILE = {
  thresholdPaceSec: 300,
  paceFrom: 'profile',
  lthr: 168,
  maxHr: 189,
  restingHr: 60,
  hrFrom: 'profile',
};

describe('gradedPaceSecPerKm', () => {
  it('is plain pace on the flat', () => {
    expect(gradedPaceSecPerKm(run())).toBe(300);
  });

  it('turns climb into equivalent flat distance', () => {
    const gp = gradedPaceSecPerKm(run({ total_elevation_gain: 250 }));
    expect(gp).toBeCloseTo(3600 / ((12000 + K_CLIMB * 250) / 1000), 6);
  });

  it('ignores climb on a treadmill', () => {
    expect(gradedPaceSecPerKm(run({ sport_type: 'TREADMILL_RUNNING', total_elevation_gain: 250 }))).toBe(300);
  });

  it('is null without distance or time', () => {
    expect(gradedPaceSecPerKm(run({ distance: 0 }))).toBeNull();
    expect(gradedPaceSecPerKm(run({ moving_time: 0 }))).toBeNull();
  });
});

describe('hrTss', () => {
  it('scores an hour at LTHR as 100', () => {
    expect(hrTss(run({ average_heartrate: 168 }), PROFILE)).toBeCloseTo(100, 6);
  });

  it('scores an easy hour well below that', () => {
    const easy = hrTss(run({ average_heartrate: 140 }), PROFILE);
    expect(easy).toBeGreaterThan(40);
    expect(easy).toBeLessThan(60);
  });

  it('is null without HR or anchors', () => {
    expect(hrTss(run(), PROFILE)).toBeNull();
    expect(hrTss(run({ average_heartrate: 150 }), { ...PROFILE, lthr: null })).toBeNull();
  });
});

describe('estimateRunThresholds', () => {
  // Five hard 30-min efforts with a known graded pace each, plus easy runs.
  const hard = (paceSec, maxHr = 185) =>
    run({ moving_time: 1800, distance: (1800 / paceSec) * 1000, average_heartrate: 168, max_heartrate: maxHr });
  const easy = (maxHr = 170) => run({ average_heartrate: 135, max_heartrate: maxHr });

  it('takes the 98th-percentile max HR and the second-fastest normalised hard effort', () => {
    const runs = [hard(270), hard(280), hard(290), easy(), easy()];
    const est = estimateRunThresholds(runs);
    expect(est.maxHr).toBe(185);
    expect(est.candidates).toBe(3);
    // 280 s/km over 30 min, Riegel-normalised to 60 min.
    expect(est.thresholdPaceSec).toBe(Math.round(280 * Math.pow(2, 0.06)));
  });

  it('gives no pace with fewer than three hard efforts', () => {
    const est = estimateRunThresholds([hard(270), hard(280), easy(), easy(), easy()]);
    expect(est.maxHr).not.toBeNull();
    expect(est.thresholdPaceSec).toBeNull();
  });

  it('gives nothing from too few runs or an implausible max HR', () => {
    expect(estimateRunThresholds([hard(270), hard(280), hard(290)]).maxHr).toBeNull();
    const walker = Array.from({ length: 6 }, () => easy(130));
    expect(estimateRunThresholds(walker)).toMatchObject({ maxHr: null, thresholdPaceSec: null });
  });

  it('ignores junk max HR readings', () => {
    const runs = [easy(170), easy(172), easy(171), easy(169), easy(170), easy(255)];
    expect(estimateRunThresholds(runs).maxHr).toBeLessThanOrEqual(172);
  });
});

describe('resolveRunProfile', () => {
  const history = [
    run({ average_heartrate: 135, max_heartrate: 180 }),
    run({ average_heartrate: 135, max_heartrate: 180 }),
    run({ average_heartrate: 135, max_heartrate: 180 }),
    run({ average_heartrate: 135, max_heartrate: 180 }),
    run({ average_heartrate: 135, max_heartrate: 180 }),
  ];

  it('prefers entered values', () => {
    const p = resolveRunProfile({ threshold_pace_sec: 270, lthr: 170, max_hr: 190, resting_hr: 50 }, history);
    expect(p).toEqual({ thresholdPaceSec: 270, paceFrom: 'profile', lthr: 170, maxHr: 190, restingHr: 50, hrFrom: 'profile' });
  });

  it('falls back to VDOT, then history', () => {
    expect(resolveRunProfile({ vdot: 50 }, []).paceFrom).toBe('vdot');
    const p = resolveRunProfile(null, history);
    expect(p).toMatchObject({ thresholdPaceSec: null, maxHr: 180, lthr: 160, hrFrom: 'estimated', restingHr: 60 });
  });

  it('derives LTHR from an entered max HR', () => {
    expect(resolveRunProfile({ max_hr: 200 }, [])).toMatchObject({ lthr: 178, hrFrom: 'profile_max' });
  });
});

describe('estimateRunLoad tier order', () => {
  it('uses an entered threshold pace first: an hour at threshold = 100', () => {
    expect(estimateRunLoad(run({ average_heartrate: 140 }), PROFILE)).toEqual({ tss: 100, source: 'power', confidence: 0.75 });
  });

  it('uses HR on a trail run even with an entered pace', () => {
    const trail = run({ type: 'TrailRun', sport_type: 'TRAIL_RUNNING', distance: 8000, total_elevation_gain: 600, average_heartrate: 168 });
    expect(estimateRunLoad(trail, PROFILE)).toMatchObject({ tss: 100, source: 'hr', confidence: 0.65 });
  });

  it('ranks HR above an ESTIMATED pace', () => {
    const est = { ...PROFILE, paceFrom: 'estimated', hrFrom: 'estimated' };
    expect(estimateRunLoad(run({ average_heartrate: 168 }), est)).toMatchObject({ source: 'hr', confidence: 0.55 });
    // No HR → the estimated pace is still better than the heuristic.
    expect(estimateRunLoad(run(), est)).toEqual({ tss: 100, source: 'power', confidence: 0.65 });
  });

  it('treats a dropped-strap average HR as no HR', () => {
    const est = { ...PROFILE, thresholdPaceSec: null, paceFrom: null };
    expect(hasUsableHr(run({ average_heartrate: 80 }), est)).toBe(false);
    expect(estimateRunLoad(run({ average_heartrate: 80 }), est)).toBeNull();
  });

  it('returns null with nothing to go on, so the caller uses the heuristic', () => {
    expect(estimateRunLoad(run(), null)).toBeNull();
    expect(estimateRunLoad(run(), { thresholdPaceSec: null, lthr: null, restingHr: 60 })).toBeNull();
  });
});
