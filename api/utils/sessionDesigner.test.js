/**
 * Designer fixtures. Each is a whole athlete and a whole request, and the
 * assertions read the rationale as well as the numbers: a design the coach
 * cannot explain is not done.
 */
import { describe, it, expect } from 'vitest';
import {
  designSession,
  calibrateFtp,
  segmentLoad,
  ftpStaleWindowDays,
  LOAD_TOLERANCE_RSS,
  FTP_STALE_DAYS,
} from './sessionDesigner.js';
import { normalizeIntervals } from './prescription.js';

const NOW = '2026-09-07T12:00:00Z';

/** A consistent trainer with a fresh FTP and a full power curve. */
const FRESH = {
  ftp: 250, ftpAgeDays: 12, ridesPerWeek4wk: 4.2,
  bests: { p60: 420, p300: 318, p600: 290, p1200: 268 },
  cp: 258, wPrime: 18000,
  formScore: 4, afiGrowth4d: 0.08, afiGrowthCeiling: 0.25,
  recoveryMode: 'standard', readinessCall: null, pdShortTrend: 'consistent',
};

const rationaleText = (r) => r.rationale.join('\n');

describe('load arithmetic', () => {
  it('scores an hour at FTP as 100 RSS', () => {
    expect(segmentLoad(100, 60)).toBeCloseTo(100, 5);
    expect(segmentLoad(50, 60)).toBeCloseTo(25, 5);
  });
});

describe('FTP staleness window', () => {
  it('is 30 days for a very consistent trainer, 45 for a consistent one, 90 otherwise', () => {
    expect(ftpStaleWindowDays(4.5)).toBe(FTP_STALE_DAYS.high);
    expect(ftpStaleWindowDays(2.5)).toBe(FTP_STALE_DAYS.consistent);
    expect(ftpStaleWindowDays(1)).toBe(FTP_STALE_DAYS.sparse);
    expect(ftpStaleWindowDays(null)).toBe(FTP_STALE_DAYS.sparse);
  });

  it('keeps a fresh FTP and says so', () => {
    const cal = calibrateFtp(FRESH);
    expect(cal.source).toBe('profile');
    expect(cal.ftpUsed).toBe(250);
    expect(cal.rationale).toMatch(/inside the 30-day window/);
  });

  it('lets the bests override a stale FTP, stored against the profile FTP', () => {
    const cal = calibrateFtp({ ...FRESH, ftpAgeDays: 77, bests: { ...FRESH.bests, p1200: 280 } });
    expect(cal.source).toBe('bests');
    expect(cal.ftpUsed).toBe(266); // 95% of 280
    expect(cal.storedAgainst).toBe(250);
    expect(cal.rationale).toMatch(/77 days old against a 30-day window/);
  });

  it('does not let a stale FTP be overridden by a best inside the 3% band', () => {
    // 95% of 268 is 255 — 2% off 250, so the FTP stands.
    const cal = calibrateFtp({ ...FRESH, ftpAgeDays: 77 });
    expect(cal.source).toBe('profile');
  });

  it('keeps a stale FTP the bests agree with', () => {
    const cal = calibrateFtp({ ...FRESH, ftpAgeDays: 77, bests: { p1200: 264 } }); // 95% = 251
    expect(cal.source).toBe('profile');
  });
});

describe('a 75-minute VO2 day for a fresh, consistent athlete', () => {
  const r = designSession({ session: { type: 'vo2max', durationMin: 75, targetLoad: 80, weekInBlock: 1 }, athlete: FRESH, now: NOW });

  it('designs 4-minute efforts in week two and lands on the budget', () => {
    expect(r.ok).toBe(true);
    expect(r.format.id).toBe('vo2_5x4');
    expect(Math.abs(r.predictedLoad - 80)).toBeLessThanOrEqual(LOAD_TOLERANCE_RSS);
    expect(r.prescription.source).toBe('designer');
    expect(r.prescription.intervals).toHaveLength(1);
    expect(r.prescription.intervals[0].duration_min).toBe(4);
  });

  it('sets the targets from the 5-minute best, expressed against the profile FTP', () => {
    const set = r.prescription.intervals[0];
    // medium role: 0.90–0.97 × 318 = 286–308 W → 114–123 %
    expect(set.target_watts_min).toBe(286);
    expect(set.target_watts_max).toBe(308);
    expect(set.target_pct_ftp_min).toBe(114);
    expect(set.target_pct_ftp_max).toBe(123);
    expect(rationaleText(r)).toMatch(/SES-CAL-3/);
  });

  it('fits the planned length with the bookends and stores a valid prescription', () => {
    const p = r.prescription;
    const set = p.intervals[0];
    const total = p.warmup_min + p.cooldown_min + set.repeats * 4 + (set.repeats - 1) * 4;
    expect(total).toBe(75);
    expect(normalizeIntervals(p.intervals).errors).toEqual([]);
    expect(p.calibration).toMatchObject({ ftp_used: 250, stored_against: 250, source: 'profile' });
    expect(p.created_at).toBe(NOW.replace('12:00:00Z', '12:00:00.000Z'));
  });

  it('explains every choice with a rule id', () => {
    for (const line of r.rationale) expect(line).toMatch(/^[A-Z]+-[A-Z0-9-]+:/);
  });
});

describe('the worked example: stale FTP, strong 5-minute best', () => {
  const athlete = { ...FRESH, ftpAgeDays: 77, cp: null, wPrime: null, bests: { ...FRESH.bests, p1200: 280 } };
  const r = designSession({ session: { type: 'vo2max', durationMin: 75, targetLoad: 90, weekInBlock: 1 }, athlete });

  it('calibrates from the bests and says the FTP is stale', () => {
    expect(rationaleText(r)).toMatch(/SES-CAL-1: FTP 250 W is 77 days old/);
    expect(r.prescription.calibration.source).toBe('bests');
    expect(r.prescription.calibration.ftp_used).toBe(266);
    // Stored %FTP is still against the 250 W the device holds.
    expect(r.prescription.calibration.stored_against).toBe(250);
  });

  it('says plainly when a budget cannot be met by the format in the time', () => {
    // 90 RSS in 75 minutes of 4-minute efforts is more than six of them give.
    expect(r.predictedLoad).toBeLessThan(90);
    expect(rationaleText(r)).toMatch(/SES-DOSE-1: predicted \d+ RSS against a 90 RSS budget/);
  });
});

describe('W′ cap', () => {
  it('lowers a band the athlete could not complete, and says why', () => {
    // Weak W′: 8 kJ. An 8-minute effort at 105–112% (263–280 W over CP 240)
    // would spend (280−240)×480 = 19 kJ.
    const athlete = { ...FRESH, bests: null, cp: 240, wPrime: 8000, ridesPerWeek4wk: 4 };
    const r = designSession({ session: { type: 'vo2max', durationMin: 90, targetLoad: 100, weekInBlock: 3 }, athlete });
    expect(r.format.id).toBe('vo2_4x8');
    const set = r.prescription.intervals[0];
    // cap = 240 + 0.85×8000/480 = 254 W → 102 %
    expect(set.target_watts_max).toBe(254);
    expect(set.target_pct_ftp_max).toBe(102);
    expect(rationaleText(r)).toMatch(/SES-CAL-2/);
  });
});

describe('no power on file', () => {
  it('still designs, keeps the format band, and tells the athlete to ride by feel', () => {
    const athlete = { ftp: null, bests: null, cp: null, wPrime: null, ridesPerWeek4wk: 3 };
    const r = designSession({ session: { type: 'threshold', durationMin: 70, targetLoad: 85, weekInBlock: 0 }, athlete });
    expect(r.ok).toBe(true);
    expect(r.format.id).toBe('thr_2x20');
    const set = r.prescription.intervals[0];
    expect(set.target_pct_ftp_min).toBe(95);
    expect(set.target_watts_min).toBeUndefined();
    expect(set.notes).toMatch(/ride these by feel/);
    expect(r.prescription.calibration.source).toBe('none');
  });
});

describe('masters, conservative recovery', () => {
  it('stays with 4-minute efforts late in the block', () => {
    const r = designSession({
      session: { type: 'vo2max', durationMin: 70, targetLoad: 80, weekInBlock: 3 },
      athlete: { ...FRESH, recoveryMode: 'conservative', afiGrowthCeiling: 0.2 },
    });
    expect(r.format.id).toBe('vo2_5x4');
    expect(rationaleText(r)).toMatch(/conservative recovery mode/);
  });
});

describe('time-crunched', () => {
  it('picks a short format for a 45-minute day and never overruns it', () => {
    const r = designSession({ session: { type: 'threshold', durationMin: 45, targetLoad: 70, weekInBlock: 2 }, athlete: FRESH });
    expect(r.format.id).toBe('thr_3x8');
    const p = r.prescription;
    const set = p.intervals[0];
    const total = p.warmup_min + p.cooldown_min + set.repeats * 8 + (set.repeats - 1) * 4;
    expect(total).toBeLessThanOrEqual(45);
    // The budget cannot be met in 45 minutes, and the design says so.
    expect(rationaleText(r)).toMatch(/SES-DOSE-1: predicted \d+ RSS against a 70 RSS budget/);
  });
});

describe('30/15s are stored as sets of sets', () => {
  it('nests three sets with a longer break between, in week one', () => {
    const r = designSession({ session: { type: 'vo2max', durationMin: 75, targetLoad: 85, weekInBlock: 0 }, athlete: FRESH });
    expect(r.format.id).toBe('vo2_30_15');
    const set = r.prescription.intervals[0];
    expect(set.sets).toBe(3);
    expect(set.set_recovery_min).toBe(3);
    expect(set.duration_min).toBe(0.5);
    expect(normalizeIntervals(r.prescription.intervals).intervals[0].sets).toBe(3);
  });

  it('defends a lagging top end with short intervals whatever the week', () => {
    const r = designSession({
      session: { type: 'vo2max', durationMin: 75, targetLoad: 85, weekInBlock: 3 },
      athlete: { ...FRESH, pdShortTrend: 'behind' },
    });
    expect(r.format.id).toBe('vo2_30_15');
    expect(rationaleText(r)).toMatch(/Short power is behind/);
  });
});

describe('readiness and fatigue gates', () => {
  it('turns a quality day into endurance at form score −15', () => {
    const r = designSession({ session: { type: 'threshold', durationMin: 75, targetLoad: 90 }, athlete: { ...FRESH, formScore: -18 } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('steady');
    expect(r.sessionType).toBe('endurance');
    expect(r.targetLoad).toBe(55);
    expect(rationaleText(r)).toMatch(/GATE-FS/);
  });

  it('trims the dose by a quarter when fatigue grew past the ceiling', () => {
    const r = designSession({ session: { type: 'sweet_spot', durationMin: 75, targetLoad: 80 }, athlete: { ...FRESH, afiGrowth4d: 0.4 } });
    expect(r.ok).toBe(true);
    expect(r.targetLoad).toBe(60);
    expect(r.gate).toBe('trim');
    expect(rationaleText(r)).toMatch(/GATE-AFI/);
  });

  it('halves the session on a modify call and rests on a skip', () => {
    const modify = designSession({ session: { type: 'vo2max', durationMin: 75, targetLoad: 90, weekInBlock: 1 }, athlete: { ...FRESH, readinessCall: 'modify' } });
    expect(modify.ok).toBe(true);
    expect(modify.durationMin).toBe(45);
    expect(modify.targetLoad).toBe(45);
    expect(modify.prescription.intervals[0].repeats).toBeLessThanOrEqual(4);
    expect(rationaleText(modify)).toMatch(/RDY-3-modify/);

    const skip = designSession({ session: { type: 'vo2max', durationMin: 75, targetLoad: 90 }, athlete: { ...FRESH, readinessCall: 'skip' } });
    expect(skip.ok).toBe(false);
    expect(skip.reason).toBe('rest');
  });
});

describe('sessions with nothing to design', () => {
  it('reports steady, rest, off-bike and unknown types honestly', () => {
    expect(designSession({ session: { type: 'endurance', durationMin: 120, targetLoad: 90 }, athlete: FRESH }).reason).toBe('steady');
    expect(designSession({ session: { type: 'rest' }, athlete: FRESH }).reason).toBe('rest');
    expect(designSession({ session: { type: 'strength', durationMin: 45 }, athlete: FRESH }).reason).toBe('off_bike');
    expect(designSession({ session: { type: 'kitesurfing', durationMin: 45 }, athlete: FRESH }).reason).toBe('unknown_type');
  });

  it('designs a race simulation as two blocks', () => {
    const r = designSession({ session: { type: 'racing', durationMin: 90, targetLoad: 100 }, athlete: FRESH });
    expect(r.ok).toBe(true);
    expect(r.prescription.intervals).toHaveLength(2);
    expect(r.prescription.intervals[1].duration_min).toBe(0.5);
  });
});

describe('determinism', () => {
  it('returns the same design for the same inputs', () => {
    const a = designSession({ session: { type: 'threshold', durationMin: 75, targetLoad: 90, weekInBlock: 1 }, athlete: FRESH, now: NOW });
    const b = designSession({ session: { type: 'threshold', durationMin: 75, targetLoad: 90, weekInBlock: 1 }, athlete: FRESH, now: NOW });
    expect(a).toEqual(b);
  });
});
