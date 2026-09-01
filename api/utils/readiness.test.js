import { describe, it, expect } from 'vitest';
import {
  buildWellness,
  isLowDay,
  wellnessLowStreak,
  illnessFlagFor,
  hrvBand,
  buildReadiness,
  MIN_HRV_READINGS_7D,
} from './readiness.js';
import { evaluateRules } from './rulesEngine.js';

const TODAY = '2026-09-01';
const dayBefore = (n) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

const checkin = (back, { sleep = 4, leg_feel = 4, motivation = 4, illness = null } = {}) => ({
  date: dayBefore(back), sleep, leg_feel, motivation, illness,
});

describe('buildWellness', () => {
  it('maps the check-in columns onto the contract', () => {
    expect(buildWellness({ sleep: 2, leg_feel: 3, motivation: 5 })).toEqual({
      sleep: 2, fatigue: 3, mood: 5,
    });
  });

  it('is null without a row', () => {
    expect(buildWellness(null)).toBeNull();
  });

  it('is null on a partial check-in rather than scoring what is there', () => {
    // RDY-3-cut separates "body fine, head off" from "everything low". That
    // reading is meaningless with an item missing, so half a check-in is a
    // missing signal, not a weak one.
    expect(buildWellness({ leg_feel: 3, motivation: 4 })).toBeNull();
    expect(buildWellness({ sleep: 3, motivation: 4 })).toBeNull();
    expect(buildWellness({ sleep: 3, leg_feel: 4 })).toBeNull();
  });

  it('is null for a row from before the sleep question existed', () => {
    expect(buildWellness({ sleep: null, leg_feel: 2, motivation: 2 })).toBeNull();
  });

  it('ignores energy, which has no slot in the contract', () => {
    expect(buildWellness({ sleep: 4, leg_feel: 4, motivation: 4, energy: 1 })).toEqual({
      sleep: 4, fatigue: 4, mood: 4,
    });
  });
});

describe('isLowDay', () => {
  it('is true when any single item is at or below 2', () => {
    expect(isLowDay({ sleep: 2, leg_feel: 5, motivation: 5 })).toBe(true);
    expect(isLowDay({ sleep: 5, leg_feel: 1, motivation: 5 })).toBe(true);
    expect(isLowDay({ sleep: 5, leg_feel: 5, motivation: 2 })).toBe(true);
  });

  it('is false at 3 and above', () => {
    expect(isLowDay({ sleep: 3, leg_feel: 3, motivation: 3 })).toBe(false);
  });
});

describe('wellnessLowStreak', () => {
  it('counts consecutive low days ending today', () => {
    const rows = [
      checkin(0, { sleep: 2 }),
      checkin(1, { leg_feel: 2 }),
      checkin(2, { motivation: 1 }),
      checkin(3),
    ];
    expect(wellnessLowStreak(rows, TODAY)).toBe(3);
  });

  it('is zero when today is fine', () => {
    expect(wellnessLowStreak([checkin(0), checkin(1, { sleep: 1 })], TODAY)).toBe(0);
  });

  it('is null without a scoreable check-in today', () => {
    // A streak counted off yesterday's check-in would describe a morning the
    // athlete never reported on.
    expect(wellnessLowStreak([checkin(1, { sleep: 1 })], TODAY)).toBeNull();
    expect(wellnessLowStreak([], TODAY)).toBeNull();
  });

  it('breaks the streak on a missing day rather than assuming it was bad', () => {
    const rows = [checkin(0, { sleep: 2 }), checkin(2, { sleep: 2 }), checkin(3, { sleep: 2 })];
    expect(wellnessLowStreak(rows, TODAY)).toBe(1);
  });
});

describe('illnessFlagFor', () => {
  it('reads today only', () => {
    expect(illnessFlagFor([checkin(0, { illness: true })], TODAY)).toBe(true);
    expect(illnessFlagFor([checkin(0, { illness: false })], TODAY)).toBe(false);
    expect(illnessFlagFor([checkin(1, { illness: true })], TODAY)).toBeNull();
  });

  it('is null when unasked, which is not the same as healthy', () => {
    expect(illnessFlagFor([checkin(0, { illness: null })], TODAY)).toBeNull();
    expect(illnessFlagFor([], TODAY)).toBeNull();
  });
});

// ─── HRV band ────────────────────────────────────────────────────────────────

/** Daily readings for `days` days back from TODAY, newest first. */
function hrvSeries(days, valueFor) {
  return Array.from({ length: days }, (_, back) => ({
    date: dayBefore(back),
    hrv_ms: valueFor(back),
  }));
}

describe('hrvBand', () => {
  it('is null with no readings at all', () => {
    expect(hrvBand([], TODAY)).toEqual({ hrvBelowBandDays: null, hrvReadings7d: null });
  });

  it('reports the reading count but no verdict below the weekly minimum', () => {
    // The brief: require >= 3 readings a week or leave null.
    const sparse = [{ date: dayBefore(0), hrv_ms: 60 }, { date: dayBefore(3), hrv_ms: 62 }];
    const out = hrvBand(sparse, TODAY);
    expect(out.hrvReadings7d).toBe(2);
    expect(out.hrvReadings7d).toBeLessThan(MIN_HRV_READINGS_7D);
    expect(out.hrvBelowBandDays).toBeNull();
  });

  it('is null when there is not enough history for a baseline', () => {
    const out = hrvBand(hrvSeries(10, () => 60), TODAY);
    expect(out.hrvReadings7d).toBe(7);
    expect(out.hrvBelowBandDays).toBeNull();
  });

  it('is zero for an athlete sitting inside their own band', () => {
    const out = hrvBand(hrvSeries(80, (back) => 60 + (back % 3)), TODAY);
    expect(out.hrvBelowBandDays).toBe(0);
  });

  it('does not fire on a perfectly flat series', () => {
    // No spread means no band. Calling that "below" on a rounding error
    // would tell an athlete with unchanging recovery to back off.
    const out = hrvBand(hrvSeries(80, () => 60), TODAY);
    expect(out.hrvBelowBandDays).toBe(0);
  });

  it('cannot let one bad morning reach the three-day threshold', () => {
    // A strap-contact artifact lands in exactly one rolling window — today's,
    // since the count walks backwards and each window ends on its own day. So
    // the worst a single reading can do is 1, and RDY-2 needs 3.
    const out = hrvBand(hrvSeries(80, (back) => (back === 0 ? 25 : 60 + (back % 3))), TODAY);
    expect(out.hrvBelowBandDays).toBeLessThan(3);
  });

  it('does not let one bad morning fire RDY-2', () => {
    const readiness = buildReadiness({
      checkins: [checkin(0)],
      hrv: hrvSeries(80, (back) => (back === 0 ? 25 : 60 + (back % 3))),
      todayStr: TODAY,
    });
    const ids = evaluateRules(stateWith(readiness)).fired.map((r) => r.id);
    expect(ids).not.toContain('RDY-2-hrv-band');
  });

  it('counts a sustained drop', () => {
    // Six days suppressed is enough to drag the 7-day mean under the band.
    const out = hrvBand(hrvSeries(80, (back) => (back < 6 ? 42 : 60 + (back % 3))), TODAY);
    expect(out.hrvBelowBandDays).toBeGreaterThanOrEqual(3);
  });

  it('stops counting at the first day back inside the band', () => {
    const out = hrvBand(hrvSeries(80, (back) => (back >= 10 && back < 20 ? 42 : 60)), TODAY);
    expect(out.hrvBelowBandDays).toBe(0);
  });

  it('works on the log scale, so the band is symmetric', () => {
    // rMSSD is right-skewed. An SD taken on raw milliseconds is dominated by
    // the high tail; a rise this large must not read as a drop.
    const out = hrvBand(hrvSeries(80, (back) => (back < 6 ? 130 : 60)), TODAY);
    expect(out.hrvBelowBandDays).toBe(0);
  });
});

// ─── The readiness rules, end to end ─────────────────────────────────────────

const RIDER_STATE_FIELDS = [
  'age', 'persona', 'goalType', 'weeksToEvent', 'weeklyHours4wkMean', 'fearOfFailureFlag',
  'tfi', 'afi', 'fs', 'rss7d', 'rss3wkMean',
  'midZoneShare4wk', 'hardSessions4wk', 'easySessions4wk', 'strengthSessions8wk', 'daysSinceLastRide',
  'efTrend', 'pdShortTrend', 'pdLongTrend', 'freshVsFatiguedDrop5min', 'longRideDecoupling',
  'wellness', 'wellnessLowStreak', 'hrvBelowBandDays', 'hrvReadings7d', 'illnessFlag',
  'eventTempDeltaC',
];

function stateWith(partial) {
  const s = {};
  for (const f of RIDER_STATE_FIELDS) s[f] = null;
  return { ...s, persona: 'scientist', ...partial };
}

function firedFrom({ checkins, hrv = [], extra = {} }) {
  const state = stateWith({ ...buildReadiness({ checkins, hrv, todayStr: TODAY }), ...extra });
  return evaluateRules(state).fired.map((r) => r.id);
}

describe('readiness inputs drive the RDY rules', () => {
  it('RDY-4: bad subjective with good HRV modifies, and never overrides the athlete', () => {
    // The Phase 3 done-when. Steady HRV, athlete reports poor sleep and heavy
    // legs: the coach goes with the athlete, not the numbers.
    const ids = firedFrom({
      checkins: [checkin(0, { sleep: 2, leg_feel: 2, motivation: 3 })],
      hrv: hrvSeries(80, (back) => 60 + (back % 3)),
    });
    expect(ids).toContain('RDY-4-trust-rider');
    expect(ids).not.toContain('RDY-3-skip');
    expect(ids).not.toContain('RDY-2-hrv-band');
  });

  it('RDY-3-skip: an illness answer beats every other signal', () => {
    const ids = firedFrom({
      checkins: [checkin(0, { sleep: 4, leg_feel: 4, motivation: 4, illness: true })],
    });
    expect(ids).toContain('RDY-3-skip');
  });

  it('RDY-3-skip: all three low is a rest day even with illness unanswered', () => {
    const ids = firedFrom({ checkins: [checkin(0, { sleep: 1, leg_feel: 2, motivation: 2 })] });
    expect(ids).toContain('RDY-3-skip');
  });

  it('RDY-3-modify: two low days on top of fatigue shortens the session', () => {
    const ids = firedFrom({
      checkins: [checkin(0, { sleep: 2, leg_feel: 2, motivation: 3 }), checkin(1, { sleep: 2 })],
      extra: { afi: 72, tfi: 60 },
    });
    expect(ids).toContain('RDY-3-modify');
    expect(ids).not.toContain('RDY-3-skip');
  });

  it('RDY-3-cut: body fine, head off, start and reassess', () => {
    const ids = firedFrom({ checkins: [checkin(0, { sleep: 4, leg_feel: 4, motivation: 2 })] });
    expect(ids).toContain('RDY-3-cut');
    expect(ids).not.toContain('RDY-3-modify');
  });

  it('RDY-2: three days under the band with the athlete feeling fine', () => {
    const ids = firedFrom({
      checkins: [checkin(0)],
      hrv: hrvSeries(80, (back) => (back < 6 ? 42 : 60 + (back % 3))),
    });
    expect(ids).toContain('RDY-2-hrv-band');
  });

  it('fires nothing for an athlete who has not checked in', () => {
    expect(firedFrom({ checkins: [] })).toEqual([]);
  });

  it('fires no readiness rule on a good morning', () => {
    const ids = firedFrom({
      checkins: [checkin(0)],
      hrv: hrvSeries(80, (back) => 60 + (back % 3)),
    });
    expect(ids.filter((id) => id.startsWith('RDY-'))).toEqual([]);
  });

  it('TPR-5: bad sleep during a build is an overload marker', () => {
    const ids = firedFrom({
      checkins: [checkin(0, { sleep: 2 }), checkin(1, { sleep: 2 })],
      extra: { afi: 80, tfi: 65, weeksToEvent: 8 },
    });
    expect(ids).toContain('TPR-5-sleep-signal');
  });

  it('a readiness call always outranks a prescription', () => {
    const ids = firedFrom({
      checkins: [checkin(0, { illness: true })],
      extra: { age: 55, strengthSessions8wk: 0, midZoneShare4wk: 0.5, hardSessions4wk: 0 },
    });
    expect(ids[0]).toBe('RDY-3-skip');
  });
});

describe('buildReadiness', () => {
  it('assembles all four fields', () => {
    const out = buildReadiness({
      checkins: [checkin(0, { sleep: 2, leg_feel: 3, motivation: 4, illness: false })],
      hrv: hrvSeries(80, (back) => 60 + (back % 3)),
      todayStr: TODAY,
    });
    expect(out.wellness).toEqual({ sleep: 2, fatigue: 3, mood: 4 });
    expect(out.wellnessLowStreak).toBe(1);
    expect(out.illnessFlag).toBe(false);
    expect(out.hrvBelowBandDays).toBe(0);
    expect(out.hrvReadings7d).toBe(7);
  });

  it('is all nulls for an athlete with neither source', () => {
    expect(buildReadiness({ todayStr: TODAY })).toEqual({
      wellness: null,
      wellnessLowStreak: null,
      illnessFlag: null,
      hrvBelowBandDays: null,
      hrvReadings7d: null,
    });
  });

  it('never throws on malformed input', () => {
    expect(() => buildReadiness({ checkins: [{}, null], hrv: [{}], todayStr: TODAY })).not.toThrow();
    expect(() => buildReadiness({})).not.toThrow();
  });
});
