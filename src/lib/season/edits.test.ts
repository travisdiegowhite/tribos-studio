import { describe, it, expect } from 'vitest';
import { computeSeason } from './engine';
import { describeChange, eventsFor, moveRace, removeRace, sameRace, setFocus, setPriority } from './edits';
import { DEFAULT_SEASON_WEEKS, defaultSeasonStart, toSeasonRaces, type RaceGoalRow } from './view';

const ROWS: RaceGoalRow[] = [
  { id: 'rbx', name: 'Boulder Roubaix', race_date: '2027-04-25', priority: 'A', race_type: 'road_race', goal_time_minutes: 180 },
  { id: 'bwr', name: 'BWR San Diego', race_date: '2027-05-02', priority: 'A', race_type: 'gravel', distance_km: 113 },
  { id: 'ned', name: 'Ned Gravel', race_date: '2027-07-11', priority: 'B', race_type: 'gravel', distance_km: 113 },
];
const byId = (rows: RaceGoalRow[], id: string) => rows.find((r) => r.id === id) as RaceGoalRow;

describe('moveRace', () => {
  it('moves by whole weeks and keeps the weekday', () => {
    expect(byId(moveRace(ROWS, 'rbx', 1), 'rbx').race_date).toBe('2027-05-02');
    expect(byId(moveRace(ROWS, 'rbx', -2), 'rbx').race_date).toBe('2027-04-11');
  });

  it('crosses month, year and DST boundaries without shifting a day', () => {
    const rows: RaceGoalRow[] = [
      { id: 'x', name: 'X', race_date: '2026-12-27', priority: 'B' },
      { id: 'y', name: 'Y', race_date: '2027-03-07', priority: 'B' }, // US DST starts Mar 14, 2027
      { id: 'z', name: 'Z', race_date: '2027-10-31', priority: 'B' }, // DST ends Nov 7, 2027
    ];
    expect(byId(moveRace(rows, 'x', 1), 'x').race_date).toBe('2027-01-03');
    expect(byId(moveRace(rows, 'y', 1), 'y').race_date).toBe('2027-03-14');
    expect(byId(moveRace(rows, 'z', 1), 'z').race_date).toBe('2027-11-07');
  });

  it('accepts a timestamp-shaped race_date and returns a plain date', () => {
    const rows: RaceGoalRow[] = [{ id: 'x', name: 'X', race_date: '2027-04-25T00:00:00', priority: 'B' }];
    expect(byId(moveRace(rows, 'x', 1), 'x').race_date).toBe('2027-05-02');
  });

  it('leaves other races alone (same objects)', () => {
    const moved = moveRace(ROWS, 'rbx', 1);
    expect(byId(moved, 'ned')).toBe(byId(ROWS, 'ned'));
  });
});

describe('setPriority and removeRace', () => {
  it('changes one race priority', () => {
    expect(byId(setPriority(ROWS, 'ned', 'A'), 'ned').priority).toBe('A');
  });

  it('removes one race', () => {
    expect(removeRace(ROWS, 'ned').map((r) => r.id)).toEqual(['rbx', 'bwr']);
  });
});

describe('setFocus', () => {
  const plan = computeSeason({
    startDate: defaultSeasonStart('2026-10-11'),
    weeks: DEFAULT_SEASON_WEEKS,
    races: toSeasonRaces(ROWS),
    typicalWeeklyHours: 8,
  });

  it('marks the chosen race and clears the rest of its block', () => {
    const withBwr = setFocus(ROWS.map((r) => (r.id === 'bwr' ? { ...r, is_focus: true } : r)), 'rbx', plan);
    expect(byId(withBwr, 'rbx').is_focus).toBe(true);
    expect(byId(withBwr, 'bwr').is_focus).toBe(false);
    expect(byId(withBwr, 'ned').is_focus).toBeUndefined(); // not in the block
  });

  it('does nothing for a race outside any block', () => {
    expect(setFocus(ROWS, 'ned', plan)).toBe(ROWS);
  });

  it('feeds back into the engine: the block now aims at the chosen race', () => {
    const next = setFocus(ROWS, 'rbx', plan);
    const replanned = computeSeason({ startDate: plan.startDate, weeks: plan.weeks, races: toSeasonRaces(next), typicalWeeklyHours: 8 });
    const rbx = replanned.races.find((r) => r.id === 'rbx')!;
    expect(rbx).toMatchObject({ blockFocusId: 'rbx', focusConfirmed: true });
  });
});

describe('eventsFor and describeChange', () => {
  const before = byId(ROWS, 'rbx');

  it('collapses several clicks into one move from the saved date to the final one', () => {
    const after = byId(moveRace(moveRace(moveRace(ROWS, 'rbx', 1), 'rbx', 1), 'rbx', -1), 'rbx');
    expect(eventsFor(before, after)).toEqual([
      { raceId: 'rbx', kind: 'move', before: { race_date: '2027-04-25' }, after: { race_date: '2027-05-02' } },
    ]);
    expect(describeChange(before, after)).toBe('Moved Boulder Roubaix to Sun, May 2, 2027.');
  });

  it('reports nothing when clicks cancel out', () => {
    const after = byId(moveRace(moveRace(ROWS, 'rbx', 1), 'rbx', -1), 'rbx');
    expect(eventsFor(before, after)).toEqual([]);
    expect(sameRace(before, after)).toBe(true);
  });

  it('logs priority and focus changes', () => {
    const after = { ...before, priority: 'B', is_focus: true };
    expect(eventsFor(before, after).map((e) => e.kind)).toEqual(['priority', 'focus']);
    expect(describeChange(before, after)).toBe('Updated Boulder Roubaix.');
    expect(describeChange(before, { ...before, priority: 'C' })).toBe('Boulder Roubaix is now a tune-up race.');
    expect(describeChange(before, { ...before, is_focus: true })).toBe(
      'Boulder Roubaix is now the race that matters most in its block.',
    );
  });

  it('logs adds and removes with a snapshot', () => {
    expect(eventsFor(before, undefined)).toEqual([
      {
        raceId: 'rbx',
        kind: 'remove',
        before: { id: 'rbx', name: 'Boulder Roubaix', race_date: '2027-04-25', priority: 'A', race_type: 'road_race', is_focus: false },
        after: null,
      },
    ]);
    expect(eventsFor(undefined, before)[0].kind).toBe('add');
    expect(describeChange(before, undefined)).toBe('Removed Boulder Roubaix.');
  });
});

describe('recompute speed', () => {
  it('re-plans a 60-week season with 15 races in well under 100 ms', () => {
    const rows: RaceGoalRow[] = Array.from({ length: 15 }, (_, i) => ({
      id: `r${i}`,
      name: `Race ${i}`,
      race_date: `2027-${String(1 + Math.floor(i / 2)).padStart(2, '0')}-${i % 2 ? '20' : '06'}`,
      priority: i % 3 === 0 ? 'A' : 'B',
      race_type: 'gravel',
      distance_km: 100,
    }));
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      computeSeason({ startDate: '2026-08-17', weeks: 60, races: toSeasonRaces(moveRace(rows, 'r3', i % 2 ? 1 : -1)), typicalWeeklyHours: 8 });
    }
    expect((performance.now() - start) / 10).toBeLessThan(100);
  });
});
