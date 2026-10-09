import { describe, it, expect, afterEach } from 'vitest';
import {
  computeSeason,
  diffPlans,
  isEmptyDiff,
  typicalWeeklyHours,
  weekIndexOf,
  mondayOf,
  addDaysToDate,
  formatSeasonDate,
  dayNumber,
  FULL_BUILD_WEEKS,
  type SeasonRaceInput,
  type SeasonPlan,
} from './engine';

// Fixture from the build plan: season starts Monday 2026-10-05, with the
// mockup's sample season. Week indexes: crit 23, gravel 27, June A 36,
// State RR 41, fall A 48.
const START = '2026-10-05';
const BASE_RACES: SeasonRaceInput[] = [
  { id: 'crit', name: 'Spring Crit', date: '2027-03-21', priority: 'C' },
  { id: 'gravel-b', name: 'Gravel Opener', date: '2027-04-17', priority: 'B' },
  { id: 'june-a', name: 'June Gravel', date: '2027-06-19', priority: 'A' },
  { id: 'state-rr', name: 'State RR', date: '2027-07-24', priority: 'B' },
  { id: 'fall-a', name: 'Fall Gravel', date: '2027-09-11', priority: 'A' },
];

function plan(races: SeasonRaceInput[] = BASE_RACES): SeasonPlan {
  return computeSeason({ startDate: START, races, typicalWeeklyHours: 8 });
}

function withDate(id: string, date: string, races = BASE_RACES): SeasonRaceInput[] {
  return races.map((r) => (r.id === id ? { ...r, date } : r));
}

function race(p: SeasonPlan, id: string) {
  const r = p.races.find((x) => x.id === id);
  if (!r) throw new Error(`no race ${id}`);
  return r;
}

describe('plain-date helpers', () => {
  it('places the fixture races in the expected weeks', () => {
    expect(BASE_RACES.map((r) => weekIndexOf(START, r.date))).toEqual([23, 27, 36, 41, 48]);
  });

  it('snaps a non-Monday start back to its Monday', () => {
    expect(mondayOf('2026-10-08')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(computeSeason({ startDate: '2026-10-09', races: [], typicalWeeklyHours: 8 }).startDate).toBe(START);
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDaysToDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDate('2027-03-13', 1)).toBe('2027-03-14');
    expect(addDaysToDate('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => dayNumber('2027-6-19')).toThrow();
    expect(() => dayNumber('2027-02-30')).toThrow();
  });

  it('formats with the right weekday', () => {
    expect(formatSeasonDate('2027-06-19')).toBe('Sat, Jun 19, 2027');
    expect(formatSeasonDate('2027-03-21')).toBe('Sun, Mar 21, 2027');
  });
});

describe('phases', () => {
  it('lays out the baseline season', () => {
    const p = plan();
    const phaseAt = (w: number) => p.schedule[w].phase;
    expect([0, 1, 2, 3].map(phaseAt)).toEqual(['recover', 'recover', 'recover', 'recover']);
    expect(phaseAt(4)).toBe('base');
    expect(phaseAt(26)).toBe('base');
    // June A at 36: build 27–32, peak 33–34, taper 35–36, recover 37–38.
    expect([27, 32].map(phaseAt)).toEqual(['build', 'build']);
    expect([33, 34].map(phaseAt)).toEqual(['peak', 'peak']);
    expect([35, 36].map(phaseAt)).toEqual(['taper', 'taper']);
    expect([37, 38].map(phaseAt)).toEqual(['recover', 'recover']);
    // Fall A at 48: build 39–44, peak 45–46, taper 47–48, recover 49–50.
    expect([39, 44].map(phaseAt)).toEqual(['build', 'build']);
    expect([45, 46, 47, 48, 49, 50, 51].map(phaseAt)).toEqual([
      'peak', 'peak', 'taper', 'taper', 'recover', 'recover', 'base',
    ]);
  });

  it('gives week start dates as Mondays', () => {
    const p = plan();
    expect(p.schedule[0].startDate).toBe(START);
    expect(p.schedule[51].startDate).toBe('2027-09-27');
    expect(p.schedule).toHaveLength(52);
  });

  it('lets taper and peak win over a previous A race\'s recovery', () => {
    // A races 4 weeks apart: weeks 20 and 24. The second's peak (21–22) lands on the first's recovery.
    const p = computeSeason({
      startDate: START,
      typicalWeeklyHours: 8,
      races: [
        { id: 'a1', name: 'A One', date: addDaysToDate(START, 20 * 7 + 5), priority: 'A' },
        { id: 'a2', name: 'A Two', date: addDaysToDate(START, 24 * 7 + 5), priority: 'A' },
      ],
    });
    expect(p.schedule.slice(19, 25).map((w) => w.phase)).toEqual([
      'taper', 'taper', 'peak', 'peak', 'taper', 'taper',
    ]);
    expect(race(p, 'a2').verdict).toBe('conflict');
    expect(race(p, 'a2').relatedRaceId).toBe('a1');
  });

  it('applies phase multipliers to the typical hours', () => {
    const p = plan();
    expect(p.schedule[0].targetHours).toBe(4.4); // recover 0.55
    expect(p.schedule[10].targetHours).toBe(8); // base
    expect(p.schedule[30].targetHours).toBe(10.8); // build 1.35
    expect(p.schedule[33].targetHours).toBe(10); // peak 1.25
    expect(p.schedule[36].targetHours).toBe(6); // taper 0.75
  });
});

describe('acceptance fixtures', () => {
  it('Baseline: both A races On track; State RR is a mid-build tune-up', () => {
    const p = plan();
    expect(race(p, 'june-a')).toMatchObject({ verdict: 'on_track', buildWeeks: 6 });
    expect(race(p, 'fall-a')).toMatchObject({ verdict: 'on_track', buildWeeks: 6 });
    expect(race(p, 'state-rr').verdict).toBe('on_track');
    expect(race(p, 'state-rr').reason).toBe('A mid-build tune-up for Fall Gravel.');
    expect(race(p, 'crit').verdict).toBe('on_track');
    expect(race(p, 'gravel-b').verdict).toBe('on_track');
  });

  it('Squeeze second A: June A 3 weeks later → fall A build drops to 3 → Tight', () => {
    const before = plan();
    const after = plan(withDate('june-a', '2027-07-10'));
    expect(race(after, 'fall-a')).toMatchObject({ verdict: 'tight', buildWeeks: 3, relatedRaceId: 'june-a' });
    expect(race(after, 'fall-a').reason).toBe(
      'Only 3 build weeks before Fall Gravel because recovery from June Gravel eats into it.',
    );

    const diff = diffPlans(before, after);
    expect(diff.changed).toEqual([
      { raceId: 'june-a', name: 'June Gravel', fromDate: 'Sat, Jun 19, 2027', toDate: 'Sat, Jul 10, 2027', weeks: 3 },
    ]);
    expect(diff.buildChanges).toEqual([{ raceId: 'fall-a', name: 'Fall Gravel', fromWeeks: 6, toWeeks: 3 }]);
    expect(diff.verdictChanges).toContainEqual(
      expect.objectContaining({ raceId: 'fall-a', from: 'on_track', to: 'tight' }),
    );
  });

  it('Collapse: June A 6 weeks later → fall A Conflict', () => {
    const p = plan(withDate('june-a', '2027-07-31'));
    expect(race(p, 'fall-a')).toMatchObject({ verdict: 'conflict', buildWeeks: 0 });
  });

  it('B in taper: State RR 1 week before the fall A → Conflict naming the A race', () => {
    const p = plan(withDate('state-rr', '2027-09-04'));
    const r = race(p, 'state-rr');
    expect(r).toMatchObject({ verdict: 'conflict', gapWeeks: 1, relatedRaceId: 'fall-a' });
    expect(r.reason).toContain('Fall Gravel');
  });

  it('C in taper: crit 2 weeks before an A race → Tight', () => {
    const p = plan(withDate('crit', '2027-06-05'));
    expect(race(p, 'crit')).toMatchObject({ verdict: 'tight', gapWeeks: 2, relatedRaceId: 'june-a' });
    expect(race(p, 'crit').reason).toContain('ride it easy');
  });

  it('Post-A: B race 1 week after an A race → Tight (recovering)', () => {
    const p = plan(withDate('gravel-b', '2027-06-26'));
    expect(race(p, 'gravel-b')).toMatchObject({ verdict: 'tight', gapWeeks: -1, relatedRaceId: 'june-a' });
    expect(race(p, 'gravel-b').reason).toContain('still recovering');
  });

  it('Out of window: race past week 52 → Conflict, outside this season', () => {
    const p = plan(withDate('state-rr', '2027-10-09'));
    expect(race(p, 'state-rr')).toMatchObject({ verdict: 'conflict', week: null });
    expect(race(p, 'state-rr').reason).toContain('outside this season');
    // A race before the start is outside too.
    expect(race(plan(withDate('crit', '2026-09-27')), 'crit').verdict).toBe('conflict');
  });

  describe('Timezone', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it('computes identical plans in America/Denver and UTC', () => {
      process.env.TZ = 'America/Denver';
      const denver = plan();
      const denverDate = formatSeasonDate('2027-09-11');
      process.env.TZ = 'UTC';
      const utc = plan();
      expect(denver).toEqual(utc);
      expect(denverDate).toBe(formatSeasonDate('2027-09-11'));
    });
  });

  it('Round trip: later then earlier by the same amount → identical plan, empty diff', () => {
    const start = plan();
    const moved = plan(withDate('june-a', '2027-07-10'));
    const back = plan(withDate('june-a', '2027-06-19'));
    expect(isEmptyDiff(diffPlans(start, moved))).toBe(false);
    expect(back).toEqual(start);
    expect(isEmptyDiff(diffPlans(start, back))).toBe(true);
  });
});

describe('rule gaps decided 2026-10-09', () => {
  it('season-start Recover clips the first A build', () => {
    // A race at week 10: full build would be weeks 1–6; the floor is week 4, so 3 weeks → Tight.
    const p = computeSeason({
      startDate: START,
      typicalWeeklyHours: 8,
      races: [{ id: 'early', name: 'Early A', date: addDaysToDate(START, 10 * 7 + 5), priority: 'A' }],
    });
    expect(race(p, 'early')).toMatchObject({ verdict: 'tight', buildWeeks: 3, relatedRaceId: null });
    expect(race(p, 'early').reason).toContain('the season starts too close');
  });

  it('an A race in the first weeks has no build → Conflict', () => {
    const p = computeSeason({
      startDate: START,
      typicalWeeklyHours: 8,
      races: [{ id: 'now', name: 'Now A', date: addDaysToDate(START, 2 * 7), priority: 'A' }],
    });
    expect(race(p, 'now')).toMatchObject({ verdict: 'conflict', buildWeeks: 0 });
  });

  it('a B or C race in the same week as an A race → Conflict', () => {
    const b = plan(withDate('state-rr', '2027-09-12'));
    expect(race(b, 'state-rr')).toMatchObject({ verdict: 'conflict', gapWeeks: 0 });
    const c = plan(withDate('crit', '2027-06-17'));
    expect(race(c, 'crit')).toMatchObject({ verdict: 'conflict', gapWeeks: 0 });
  });

  it('the worst verdict wins when two rules hit one race', () => {
    // A races at 36 and 39; a B at 38 is 2 weeks after the first (Tight) and 1 before the second (Conflict).
    const races = withDate('fall-a', '2027-07-10', withDate('state-rr', '2027-07-03'));
    const p = plan(races);
    expect(race(p, 'state-rr')).toMatchObject({ verdict: 'conflict', relatedRaceId: 'fall-a' });
  });

  it('every race gets a reason', () => {
    for (const r of plan().races) expect(r.reason.length).toBeGreaterThan(10);
  });

  it('treats a missing or unknown priority as B', () => {
    const p = computeSeason({
      startDate: START,
      typicalWeeklyHours: 8,
      races: [
        { id: 'x', name: 'X', date: '2027-01-09', priority: null },
        { id: 'y', name: 'Y', date: '2027-01-16', priority: 'a' },
      ],
    });
    expect(race(p, 'x').priority).toBe('B');
    expect(race(p, 'y').priority).toBe('A');
  });

  it('caps a build at FULL_BUILD_WEEKS', () => {
    for (const r of plan().races) {
      if (r.buildWeeks !== null) expect(r.buildWeeks).toBeLessThanOrEqual(FULL_BUILD_WEEKS);
    }
  });
});

describe('diffPlans', () => {
  it('reports added, removed and priority changes', () => {
    const before = plan();
    const after = plan([
      ...BASE_RACES.filter((r) => r.id !== 'crit').map((r) => (r.id === 'state-rr' ? { ...r, priority: 'A' } : r)),
      { id: 'new', name: 'New Race', date: '2027-05-01', priority: 'C' },
    ]);
    const diff = diffPlans(before, after);
    expect(diff.added).toEqual([{ raceId: 'new', name: 'New Race', date: 'Sat, May 1, 2027', priority: 'C' }]);
    expect(diff.removed).toEqual([{ raceId: 'crit', name: 'Spring Crit', date: 'Sun, Mar 21, 2027', priority: 'C' }]);
    expect(diff.priorityChanges).toEqual([{ raceId: 'state-rr', name: 'State RR', from: 'B', to: 'A' }]);
  });
});

describe('typicalWeeklyHours', () => {
  it('takes the median of the last 8 non-empty weeks', () => {
    expect(typicalWeeklyHours([20, 20, 5, 6, 7, 8, 9, 10, 0, null], 4)).toBe(7.5);
  });

  it('falls back to the rider-entered number without history', () => {
    expect(typicalWeeklyHours([], 6)).toBe(6);
    expect(typicalWeeklyHours([0, null], 6)).toBe(6);
  });
});
