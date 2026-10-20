import { describe, it, expect } from 'vitest';
import { mergeRaces, pickNextGoalRace } from './raceAnchor.js';
import { buildTemporalAnchor } from './temporalAnchor.js';

// Mirrors production on 2026-10-18: The Rad (a race_goal, still 'upcoming'
// three weeks later) plus a cyclocross season the coach wrote to the
// calendar only, and a distant A race.
const TODAY = '2026-10-18';

const CALENDAR = [
  { id: 'rad', scheduled_date: '2026-09-26', name: 'The Rad', status: 'done', sport: 'cycling', details: { priority: 'A', race_type: 'gravel' } },
  { id: 'louisville', scheduled_date: '2026-10-17', name: 'CycloX Louisville', status: 'done', sport: 'cycling', details: null },
  { id: 'hustle', scheduled_date: '2026-10-24', name: 'The Hustle CX', status: 'planned', sport: 'cycling', details: null },
  { id: 'boulder', scheduled_date: '2026-10-31', name: 'CycloX Boulder Reservoir', status: 'planned', sport: 'cycling', details: null },
  { id: 'skipped', scheduled_date: '2026-11-01', name: 'Skipped race', status: 'skipped', sport: 'cycling', details: null },
  { id: 'omw', scheduled_date: '2027-02-07', name: 'OMW', status: 'planned', sport: 'cycling', details: { priority: 'A' } },
];

const GOALS = [
  { id: 'rad', name: 'The Rad', race_date: '2026-09-26', race_type: 'gravel', priority: 'A', status: 'upcoming', distance_km: 182 },
  { id: 'omw', name: 'OMW', race_date: '2027-02-07', race_type: 'gravel', priority: 'A', status: 'upcoming' },
  { id: 'orphan', name: 'Goal with no calendar twin', race_date: '2026-11-21', priority: 'B', status: 'upcoming' },
  { id: 'dns', name: 'Did not start', race_date: '2026-11-28', priority: 'B', status: 'dns' },
];

describe('mergeRaces', () => {
  const { upcoming, recent } = mergeRaces(CALENDAR, GOALS, TODAY);

  it('splits past from upcoming by date, not by race_goals.status', () => {
    expect(upcoming.map((r) => r.id)).toEqual(['hustle', 'boulder', 'orphan', 'omw']);
    expect(upcoming.some((r) => r.id === 'rad')).toBe(false);
  });

  it('lists recent races most recent first', () => {
    expect(recent.map((r) => r.id)).toEqual(['louisville', 'rad']);
    expect(recent[1]).toMatchObject({ name: 'The Rad', done: true, distance_km: 182 });
  });

  it('drops skipped, cancelled and dns races', () => {
    const ids = [...upcoming, ...recent].map((r) => r.id);
    expect(ids).not.toContain('skipped');
    expect(ids).not.toContain('dns');
  });

  it('never invents a priority for calendar-only races', () => {
    expect(upcoming.find((r) => r.id === 'hustle').priority).toBeNull();
  });

  it('goal race is the soonest A', () => {
    expect(pickNextGoalRace(upcoming).id).toBe('omw');
  });
});

describe('temporal anchor with calendar races', () => {
  const now = new Date('2026-10-18T15:00:00Z');
  const { upcoming, recent } = mergeRaces(CALENDAR, GOALS, TODAY);
  const block = buildTemporalAnchor('America/Denver', [], upcoming, now, { recentRaces: recent });

  it('names the race next Saturday, not only the distant A race', () => {
    expect(block).toContain('NEXT_A_RACE: OMW 2027-02-07');
    expect(block).toContain('NEXT_RACE: The Hustle CX 2026-10-24 (6 days)');
  });

  it('frames finished races as history', () => {
    expect(block).toContain('RECENT_RACES (finished — history, not targets):');
    expect(block).toContain('CycloX Louisville 2026-10-17 (yesterday, done)');
    expect(block).toContain('The Rad 2026-09-26 (22 days ago, done)');
  });

  it('marks a race with no priority instead of leaving a blank to fill in', () => {
    expect(block).toContain('the_hustle_cx: 6 (no priority set)');
  });

  it('puts the Hustle on the anchor calendar', () => {
    expect(block).toContain('goal_event: the_hustle_cx');
  });
});
