import { describe, it, expect } from 'vitest';
import { formatCadence, runningPaceTargets } from '../runningTargets';
import { RUNNING_WORKOUT_LIBRARY } from '../../../data/runningWorkoutLibrary';

describe('formatCadence', () => {
  it('labels cadence by sport and never doubles a unit', () => {
    expect(formatCadence('85-95', 'cycling')).toBe('85-95 rpm');
    expect(formatCadence('170-180', 'running')).toBe('170-180 spm');
    expect(formatCadence('160-170 spm', 'running')).toBe('160-170 spm');
    expect(formatCadence(null, 'running')).toBeNull();
  });
});

describe('runningPaceTargets', () => {
  it('lists a pace for every paced part of every library run', () => {
    for (const w of Object.values(RUNNING_WORKOUT_LIBRARY)) {
      if (!w.runningStructure) continue;
      const lines = runningPaceTargets(w.runningStructure);
      expect(lines.length, w.id).toBeGreaterThan(0);
      for (const l of lines) expect(l.pace, w.id).toBeTruthy();
    }
  });

  it('names repeats by count and distance', () => {
    const lines = runningPaceTargets({
      warmup: null,
      main: [{ type: 'repeat', sets: 6, work: { distance: 800, paceZone: 5, targetPace: '3:50-4:00/km', description: 'Hard' }, rest: { duration: 2, paceZone: null } }],
      cooldown: null,
    });
    expect(lines).toEqual([{ label: '6 × 800 m', pace: '3:50-4:00/km' }]);
  });
});
