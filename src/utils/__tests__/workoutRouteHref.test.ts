import { describe, it, expect } from 'vitest';
import { buildWorkoutRouteHref } from '../workoutRouteHref';

const workout = {
  workout_type: 'threshold',
  workout_id: 'thr_4x8',
  name: '4x8 Threshold',
  target_duration: 75,
  target_distance_km: 40,
};

describe('buildWorkoutRouteHref', () => {
  it('targets the canonical builder at /ride/new with the RB2 query contract', () => {
    const href = buildWorkoutRouteHref(workout, '2026-06-10');
    expect(href.startsWith('/ride/new?')).toBe(true);
    const p = new URLSearchParams(href.split('?')[1]);
    expect(p.get('workoutId')).toBe('thr_4x8');
    expect(p.get('goal')).toBe('threshold');
    expect(p.get('duration')).toBe('75');
    expect(p.get('distance')).toBe('40');
    expect(p.get('workoutName')).toBe('4x8 Threshold');
    expect(p.get('scheduledDate')).toBe('2026-06-10');
  });

  it('omits optional params and defaults duration when absent', () => {
    const href = buildWorkoutRouteHref({ workout_type: 'endurance' }, '2026-06-10');
    const p = new URLSearchParams(href.split('?')[1]);
    expect(p.get('duration')).toBe('60');
    expect(p.has('workoutId')).toBe(false);
    expect(p.has('distance')).toBe(false);
    expect(p.has('workoutName')).toBe(false);
  });
});
