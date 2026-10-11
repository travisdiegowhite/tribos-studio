import { describe, it, expect } from 'vitest';
import { computeSeason } from './engine';
import { moveRace, setFocus, setPriority } from './edits';
import { DEFAULT_SEASON_WEEKS, defaultSeasonStart, toSeasonRaces, type RaceGoalRow } from './view';
import { MAX_QUESTION_CHARS, buildCoachPayload, countChanges, describeDiff, resetRows, toSnapshot } from './coachPayload';

const TODAY = '2026-10-11';
const ROWS: RaceGoalRow[] = [
  { id: 'old', name: 'Spring Crit', race_date: '2026-09-13', priority: 'C', race_type: 'criterium' },
  { id: 'rbx', name: 'Boulder Roubaix', race_date: '2027-04-25', priority: 'A', race_type: 'road_race', goal_time_minutes: 180 },
  { id: 'bwr', name: 'BWR San Diego', race_date: '2027-05-02', priority: 'A', race_type: 'gravel', distance_km: 113 },
  { id: 'ned', name: 'Ned Gravel', race_date: '2027-07-11', priority: 'B', race_type: 'gravel', distance_km: 113 },
];
const planFor = (rows: RaceGoalRow[]) =>
  computeSeason({ startDate: defaultSeasonStart(TODAY), weeks: DEFAULT_SEASON_WEEKS, races: toSeasonRaces(rows), typicalWeeklyHours: 8 });

describe('buildCoachPayload', () => {
  it('sends upcoming races only, with formatted dates', () => {
    const p = buildCoachPayload(planFor(ROWS), null, TODAY);
    expect(p.races.map((r) => r.name)).toEqual(['Boulder Roubaix', 'BWR San Diego', 'Ned Gravel']);
    expect(p.races[0].date).toBe('Sun, Apr 25, 2027');
    expect(p.races[0].role).toBe('Goal');
    expect(p.today).toBe('Sun, Oct 11, 2026');
  });

  it('carries no ISO dates anywhere', () => {
    const plan = planFor(ROWS);
    const p = buildCoachPayload(planFor(moveRace(ROWS, 'ned', -2)), toSnapshot(plan, ROWS), TODAY);
    expect(JSON.stringify(p)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('notes a back-to-back goal block, and whether the focus is confirmed', () => {
    const p = buildCoachPayload(planFor(ROWS), null, TODAY);
    const rbx = p.races.find((r) => r.name === 'Boulder Roubaix');
    expect(rbx?.blockNote).toMatch(/Shares one build with BWR San Diego/);
    expect(rbx?.blockNote).toMatch(/not confirmed/);
    expect(p.races.find((r) => r.name === 'Ned Gravel')?.blockNote).toBeNull();
  });

  it('is a first look without a baseline', () => {
    const p = buildCoachPayload(planFor(ROWS), null, TODAY);
    expect(p.firstLook).toBe(true);
    expect(p.changes).toEqual([]);
  });

  it('describes a move since the last conversation', () => {
    const before = planFor(ROWS);
    const after = moveRace(ROWS, 'ned', -2);
    const p = buildCoachPayload(planFor(after), toSnapshot(before, ROWS), TODAY);
    expect(p.firstLook).toBe(false);
    expect(p.changes[0]).toEqual({
      kind: 'moved',
      text: 'Ned Gravel moved 2 weeks earlier, from Sun, Jul 11, 2027 to Sun, Jun 27, 2027.',
    });
  });

  it('trims and clips the question', () => {
    expect(buildCoachPayload(planFor(ROWS), null, TODAY, '   ').question).toBeNull();
    expect(buildCoachPayload(planFor(ROWS), null, TODAY, ' Why? ').question).toBe('Why?');
    expect(buildCoachPayload(planFor(ROWS), null, TODAY, 'x'.repeat(900)).question).toHaveLength(MAX_QUESTION_CHARS);
  });
});

describe('describeDiff', () => {
  it('describes a priority change in the surface vocabulary', () => {
    const before = planFor(ROWS);
    const p = buildCoachPayload(planFor(setPriority(ROWS, 'ned', 'A')), toSnapshot(before, ROWS), TODAY);
    expect(p.changes).toContainEqual({ kind: 'priority', text: 'Ned Gravel changed from a target race to a goal race.' });
  });

  it('is empty for an empty diff', () => {
    expect(describeDiff({ changed: [], added: [], removed: [], priorityChanges: [], buildChanges: [], verdictChanges: [] })).toEqual([]);
  });
});

describe('focus changes', () => {
  it('tells the coach when the athlete picks the race a block builds toward', () => {
    const before = planFor(ROWS);
    const after = setFocus(ROWS, 'rbx', before);
    const p = buildCoachPayload(planFor(after), toSnapshot(before, ROWS), TODAY);
    expect(p.changes).toContainEqual({ kind: 'focus', text: 'Boulder Roubaix is now the race its back-to-back block builds toward.' });
    expect(countChanges(planFor(after), toSnapshot(before, ROWS))).toBe(1);
  });

  it('says nothing when a block partner is removed and the race is left alone', () => {
    const before = planFor(ROWS);
    const p = buildCoachPayload(planFor(ROWS.filter((r) => r.id !== 'bwr')), toSnapshot(before, ROWS), TODAY);
    expect(p.changes.filter((c) => c.kind === 'focus')).toEqual([]);
  });

  it('says nothing when the focus is unchanged', () => {
    const picked = setFocus(ROWS, 'rbx', planFor(ROWS));
    const p = buildCoachPayload(planFor(picked), toSnapshot(planFor(picked), picked), TODAY);
    expect(p.changes.filter((c) => c.kind === 'focus')).toEqual([]);
  });
});

describe('countChanges', () => {
  it('counts moves and priority changes, and is 0 without a baseline', () => {
    const before = planFor(ROWS);
    const after = setPriority(moveRace(ROWS, 'ned', 1), 'rbx', 'B');
    expect(countChanges(planFor(after), null)).toBe(0);
    expect(countChanges(planFor(after), toSnapshot(before, ROWS))).toBe(2);
  });
});

describe('resetRows', () => {
  it('puts date, priority and focus back for races in both versions', () => {
    const snapshot = toSnapshot(planFor(ROWS), ROWS);
    const edited = setPriority(moveRace(ROWS, 'ned', 2), 'rbx', 'B').map((r) => (r.id === 'bwr' ? { ...r, is_focus: true } : r));
    const { rows, addedSince, removedSince } = resetRows(edited, snapshot);
    expect(rows.map((r) => [r.id, String(r.race_date), r.priority, Boolean(r.is_focus)])).toEqual(
      ROWS.map((r) => [r.id, r.race_date, r.priority, false]),
    );
    expect(addedSince).toEqual([]);
    expect(removedSince).toEqual([]);
  });

  it('leaves untouched races as the same objects', () => {
    const snapshot = toSnapshot(planFor(ROWS), ROWS);
    const edited = moveRace(ROWS, 'ned', 1);
    const { rows } = resetRows(edited, snapshot);
    expect(rows.find((r) => r.id === 'rbx')).toBe(edited.find((r) => r.id === 'rbx'));
  });

  it('reports races added or removed since, without touching them', () => {
    const snapshot = toSnapshot(planFor(ROWS), ROWS);
    const added: RaceGoalRow = { id: 'new', name: 'Rad Dirt Fest', race_date: '2027-09-26', priority: 'A', race_type: 'gravel' };
    const edited = [...ROWS.filter((r) => r.id !== 'ned'), added];
    const { rows, addedSince, removedSince } = resetRows(edited, snapshot);
    expect(rows).toContain(added);
    expect(addedSince).toEqual(['Rad Dirt Fest']);
    expect(removedSince).toEqual(['Ned Gravel']);
  });
});
