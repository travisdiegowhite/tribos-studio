import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/calendar/calendarMutations', () => ({ linkEntryToActivity: vi.fn() }));
vi.mock('../../utils/adaptationTrigger', () => ({ triggerAdaptationDetection: vi.fn() }));

const { entryAcceptsActivity } = await import('../useActivityAutoLink');

describe('entryAcceptsActivity (multisport phase 3)', () => {
  it('links an activity only to a session of its own sport', () => {
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout', sport: 'running' }, 'running')).toBe(true);
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout', sport: 'cycling' }, 'running')).toBe(false);
  });

  it('infers the sport of an entry that does not store one', () => {
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout', workout_id: 'run_easy' }, 'running')).toBe(true);
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout' }, 'cycling')).toBe(true);
  });

  it('never completes a rest day or a note', () => {
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'rest' }, 'cycling')).toBe(false);
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'note' }, 'running')).toBe(false);
  });

  it('lets either sport complete a multisport race', () => {
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'race', workout_type: 'triathlon' }, 'running')).toBe(true);
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'race', workout_type: 'triathlon' }, 'cycling')).toBe(true);
  });
});
