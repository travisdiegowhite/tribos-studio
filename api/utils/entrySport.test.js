import { describe, it, expect } from 'vitest';
import { inferEntrySport, entrySport } from './entrySport.js';

describe('inferEntrySport — the migration 134 backfill rules, from the row alone', () => {
  it('gives rest days and notes no sport', () => {
    expect(inferEntrySport({ type: 'rest' })).toBeNull();
    expect(inferEntrySport({ type: 'note' })).toBeNull();
    expect(inferEntrySport(null)).toBeNull();
  });

  it('reads a run race and a multisport race from workout_type', () => {
    expect(inferEntrySport({ type: 'race', workout_type: 'half_marathon' })).toBe('running');
    expect(inferEntrySport({ type: 'race', workout_type: 'triathlon' })).toBe('multi');
    expect(inferEntrySport({ type: 'race', workout_type: 'cyclocross' })).toBe('cycling');
  });

  it('reads a running library workout from its id', () => {
    expect(inferEntrySport({ type: 'workout', workout_id: 'run_tempo_20' })).toBe('running');
    expect(inferEntrySport({ type: 'workout', workout_id: 'three_by_ten_sst' })).toBe('cycling');
    expect(inferEntrySport({ type: 'workout' })).toBe('cycling');
  });
});

describe('entrySport', () => {
  it('prefers a valid stored sport over inference', () => {
    expect(entrySport({ type: 'workout', workout_id: 'endurance', sport: 'running' })).toBe('running');
    expect(entrySport({ type: 'workout', workout_id: 'run_easy', sport: 'bogus' })).toBe('running');
  });
});
