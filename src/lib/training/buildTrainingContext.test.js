import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildTrainingContext, getSportTypeForActivity } from './buildTrainingContext';
import { EMPTY, FULL } from './__fixtures__/trainingContextFixtures';

// Pins the coach's training context. Snapshots were checked byte-for-byte
// against the copy that lived in TrainingDashboard.jsx before the move.
afterEach(() => vi.useRealTimers());

describe('buildTrainingContext', () => {
  for (const [name, args] of [['an athlete with no data', EMPTY], ['an athlete with a plan, races and rides', FULL]]) {
    it(`${name}`, () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-14T18:00:00Z'));
      expect(buildTrainingContext(...args)).toMatchSnapshot();
    });
  }
});

describe('getSportTypeForActivity', () => {
  it('reads sport_type, then the provider type', () => {
    expect(getSportTypeForActivity({ sport_type: 'running', type: 'Ride' })).toBe('running');
    expect(getSportTypeForActivity({ type: 'TrailRun' })).toBe('running');
    expect(getSportTypeForActivity({ type: 'GravelRide' })).toBe('cycling');
    expect(getSportTypeForActivity({ type: 'Swim' })).toBe('other');
  });
});
