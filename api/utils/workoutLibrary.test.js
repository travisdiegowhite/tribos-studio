import { describe, it, expect } from 'vitest';
import { WORKOUT_LIBRARY_FOR_AI } from './workoutLibrary.js';
import { WORKOUT_LIBRARY } from '../../src/data/workoutLibrary';
import { RUNNING_WORKOUT_LIBRARY } from '../../src/data/runningWorkoutLibrary';

const app = { ...WORKOUT_LIBRARY, ...RUNNING_WORKOUT_LIBRARY };
const lines = [...WORKOUT_LIBRARY_FOR_AI.matchAll(/^- (\w+): (\d+)min, (\d+) RSS/gm)].map(([, id, min, rss]) => ({ id, min: Number(min), rss: Number(rss) }));

describe('the coach\'s workout list matches the app library', () => {
  it('lists workouts', () => {
    expect(lines.length).toBeGreaterThan(40);
  });

  it('names only workouts the app knows', () => {
    expect(lines.filter((l) => !app[l.id]).map((l) => l.id)).toEqual([]);
  });

  it('gives each the app\'s planned load and length', () => {
    const drift = lines
      .filter((l) => l.rss !== app[l.id].targetTSS || l.min !== app[l.id].duration)
      .map((l) => `${l.id}: prompt ${l.min}min/${l.rss}, app ${app[l.id].duration}min/${app[l.id].targetTSS}`);
    expect(drift).toEqual([]);
  });
});
