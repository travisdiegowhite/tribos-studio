import { describe, it, expect } from 'vitest';
import { buildDayIndex, placeSession } from './calendarOccupancy.js';

const D = '2026-10-20';

describe('placeSession — two-a-days (multisport phase 3)', () => {
  it('puts a run beside a ride in the next slot', () => {
    const index = buildDayIndex([{ date: D, slot: 0, type: 'workout', sport: 'cycling' }]);
    expect(placeSession(index, D, { type: 'workout', sport: 'running' })).toEqual({ slot: 1 });
  });

  it('never stacks two sessions of one sport', () => {
    const index = buildDayIndex([{ date: D, slot: 0, type: 'workout', workout_id: 'run_easy' }]);
    expect(placeSession(index, D, { type: 'workout', sport: 'running' })).toEqual({ skip: 'day already has a running session' });
  });

  it('treats a workout with no sport as a ride, as before phase 3', () => {
    const index = buildDayIndex([{ date: D, slot: 0, type: 'workout' }]);
    expect('skip' in placeSession(index, D, { type: 'workout' })).toBe(true);
  });

  it('never adds training to a race day or a rest day', () => {
    const race = buildDayIndex([{ date: D, slot: 0, type: 'race', workout_type: 'gravel' }]);
    expect(placeSession(race, D, { type: 'workout', sport: 'running' })).toEqual({ skip: 'race day' });
    const rest = buildDayIndex([{ date: D, slot: 0, type: 'rest' }]);
    expect(placeSession(rest, D, { type: 'workout', sport: 'running' })).toEqual({ skip: 'rest day' });
  });

  it('lets a note share the day but puts a rest day only on an empty one', () => {
    const noted = buildDayIndex([{ date: D, slot: 0, type: 'note' }]);
    expect(placeSession(noted, D, { type: 'workout', sport: 'cycling' })).toEqual({ slot: 1 });
    expect(placeSession(noted, D, { type: 'rest' })).toEqual({ skip: 'day already has an entry' });
  });

  it('claims what it places, so a second pass adds nothing', () => {
    const index = buildDayIndex([]);
    expect(placeSession(index, D, { type: 'workout', sport: 'cycling' })).toEqual({ slot: 0 });
    expect(placeSession(index, D, { type: 'workout', sport: 'running' })).toEqual({ slot: 1 });
    expect('skip' in placeSession(index, D, { type: 'workout', sport: 'cycling' })).toBe(true);
  });
});
