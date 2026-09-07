import { describe, it, expect } from 'vitest';
import {
  seedFromNotes,
  weekInBlockFor,
  makeCalendarDesigner,
  summarizeDesign,
  formatPowerProfileBlock,
} from './designForCalendar.js';
import { designSession } from './sessionDesigner.js';

const TODAY = '2026-09-07';
const ATHLETE = {
  ftp: 250, ftpAgeDays: 12, ridesPerWeek4wk: 4,
  bests: { p60: 420, p300: 318, p600: 290, p1200: 268 },
  cp: 258, wPrime: 18000,
  formScore: 4, afiGrowth4d: 0.05, afiGrowthCeiling: 0.25,
  recoveryMode: 'standard', readinessCall: null, pdShortTrend: null,
};

describe('seedFromNotes', () => {
  it('reads a coach-named set, with or without a recovery', () => {
    expect(seedFromNotes('5x3min at VO2 effort, 3min easy between')).toEqual({ repeats: 5, workMin: 3, restMin: 3 });
    expect(seedFromNotes('4 x 8 min threshold')).toEqual({ repeats: 4, workMin: 8, restMin: null });
    expect(seedFromNotes('12x30s sprints, 30s off')).toEqual({ repeats: 12, workMin: 0.5, restMin: 0.5 });
  });
  it('is null for prose with no set', () => {
    expect(seedFromNotes('VO2 quality, week 1.')).toBeNull();
    expect(seedFromNotes(null)).toBeNull();
  });
});

describe('weekInBlockFor', () => {
  const entries = [
    { date: '2026-08-25', type: 'workout', workout_type: 'vo2max', status: 'done' },
    { date: '2026-09-01', type: 'workout', workout_type: 'vo2max', status: 'planned' },
    { date: '2026-09-02', type: 'workout', workout_type: 'endurance', status: 'planned' },
  ];
  it('counts consecutive prior weeks with a same-family session', () => {
    expect(weekInBlockFor('vo2max', '2026-09-08', entries)).toBe(2);
    expect(weekInBlockFor('threshold', '2026-09-08', entries)).toBe(0);
  });
  it('stops at the first empty week', () => {
    expect(weekInBlockFor('vo2max', '2026-09-22', entries)).toBe(0);
  });
});

describe('makeCalendarDesigner', () => {
  const design = makeCalendarDesigner({ athlete: ATHLETE, todayStr: TODAY, entries: [] });

  it('designs a hard day the coach described only by type, length and load', () => {
    const r = design({ date: '2026-09-15', type: 'workout', workout_type: 'vo2max', title: 'VO2', target_duration_min: 75, target_load: 80 });
    expect(r.prescription.source).toBe('designer');
    expect(r.prescription.intervals[0].target_watts_min).toBeGreaterThan(0);
    expect(r.summary).toMatch(/RSS/);
  });

  it('leaves steady, rest and race entries alone', () => {
    expect(design({ date: '2026-09-15', type: 'workout', workout_type: 'endurance', target_duration_min: 120 })).toBeNull();
    expect(design({ date: '2026-09-15', type: 'race', workout_type: 'cyclocross' })).toBeNull();
    expect(design({ date: '2026-09-15', type: 'workout', workout_type: 'rest' })).toBeNull();
  });

  it('keeps a set the coach named in the notes', () => {
    const r = design({ date: '2026-09-15', type: 'workout', workout_type: 'vo2max', title: 'Openers', target_duration_min: 60, target_load: 70, notes: '5x3min at VO2, 3min easy.' });
    expect(r.prescription.intervals[0].repeats).toBe(5);
    expect(r.prescription.intervals[0].duration_min).toBe(3);
    expect(r.prescription.intervals[0].recovery_min).toBe(3);
    expect(r.prescription.rationale.join(' ')).toMatch(/SES-COACH-1/);
  });

  it('uses the block week the expander gives it', () => {
    const wk0 = design({ date: '2026-09-15', type: 'workout', workout_type: 'threshold', target_duration_min: 75, target_load: 85 }, { weekIndex: 0 });
    const wk2 = design({ date: '2026-09-29', type: 'workout', workout_type: 'threshold', target_duration_min: 75, target_load: 85 }, { weekIndex: 2 });
    expect(wk0.prescription.format).toBe('thr_2x20');
    expect(wk2.prescription.format).toBe('thr_4x10');
  });

  it('gates only the next two days: a far-out session is designed ungated', () => {
    const tired = makeCalendarDesigner({ athlete: { ...ATHLETE, formScore: -20 }, todayStr: TODAY, entries: [] });
    const far = tired({ date: '2026-09-20', type: 'workout', workout_type: 'threshold', target_duration_min: 75, target_load: 85 });
    expect(far.prescription).toBeTruthy();
    const near = tired({ date: '2026-09-08', type: 'workout', workout_type: 'threshold', target_duration_min: 75, target_load: 85 });
    expect(near.prescription).toBeNull();
    expect(near.patch.workout_type).toBe('endurance');
    expect(near.patch.notes).toMatch(/GATE-FS/);
    expect(near.summary).toMatch(/eased/);
  });

  it('returns null without an athlete', () => {
    expect(makeCalendarDesigner({ athlete: null, todayStr: TODAY })).toBeNull();
  });
});

describe('summaries and the prompt block', () => {
  it('summarises a design in one line the coach can say', () => {
    const r = designSession({ session: { type: 'vo2max', durationMin: 75, targetLoad: 80, weekInBlock: 1 }, athlete: ATHLETE });
    expect(summarizeDesign(r)).toMatch(/^5×4min: \d+×4min at \d+–\d+ W, about \d+ RSS\.$/);
  });
  it('describes the athlete\'s power profile and the designer\'s contract', () => {
    const block = formatPowerProfileBlock(ATHLETE);
    expect(block).toMatch(/FTP 250 W, set 12 days ago \(stale past 30 days/);
    expect(block).toMatch(/5 min 318 W/);
    expect(block).toMatch(/Critical power 258 W/);
    expect(block).toMatch(/DESIGNS the intervals/);
    expect(formatPowerProfileBlock(null)).toBeNull();
  });
});
