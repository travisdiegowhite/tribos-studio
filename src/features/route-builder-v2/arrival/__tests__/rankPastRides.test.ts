import { describe, it, expect } from 'vitest';
import { rankPastRidesByFit, type RankablePastRide } from '../rankPastRides';

function ride(id: string, distanceKm: number | null, movingTimeMinutes: number | null): RankablePastRide {
  return { id, name: id, startDate: null, distanceKm, movingTimeMinutes };
}

describe('rankPastRidesByFit', () => {
  it('keeps recency order and null fits with no target', () => {
    const rides = [ride('a', 40, 90), ride('b', 10, 30)];
    const ranked = rankPastRidesByFit(rides, null);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b']);
    expect(ranked.every((r) => r.fit === null)).toBe(true);
  });

  it('ranks closest to the distance target first with fit bands', () => {
    const rides = [ride('far', 58, null), ride('great', 41, null), ride('good', 48, null)];
    const ranked = rankPastRidesByFit(rides, { durationMinutes: null, distanceKm: 40 });
    expect(ranked.map((r) => r.id)).toEqual(['great', 'good', 'far']);
    expect(ranked[0].fit).toBe('great');
    expect(ranked[1].fit).toBe('good');
    expect(ranked[2].fit).toBe('far');
  });

  it('matches on duration when distance is unavailable', () => {
    const rides = [ride('short', null, 30), ride('close', null, 85)];
    const ranked = rankPastRidesByFit(rides, { durationMinutes: 90, distanceKm: null });
    expect(ranked[0].id).toBe('close');
    expect(ranked[0].fit).toBe('great');
  });

  it('uses the better of duration and distance similarity', () => {
    // Way off on distance but spot-on for duration → still a great fit.
    const rides = [ride('a', 200, 89)];
    const ranked = rankPastRidesByFit(rides, { durationMinutes: 90, distanceKm: 40 });
    expect(ranked[0].fit).toBe('great');
  });

  it('drops clear mismatches when similar rides exist', () => {
    const rides = [ride('match', 42, null), ride('mismatch', 150, null)];
    const ranked = rankPastRidesByFit(rides, { durationMinutes: null, distanceKm: 40 });
    expect(ranked.map((r) => r.id)).toEqual(['match']);
  });

  it('falls back to closest-first when nothing is similar', () => {
    const rides = [ride('a', 150, null), ride('b', 120, null)];
    const ranked = rankPastRidesByFit(rides, { durationMinutes: null, distanceKm: 40 });
    expect(ranked.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('caps the list at the limit', () => {
    const rides = Array.from({ length: 20 }, (_, i) => ride(`r${i}`, 40 + i, null));
    const ranked = rankPastRidesByFit(rides, { durationMinutes: null, distanceKm: 40 }, 8);
    expect(ranked).toHaveLength(8);
  });
});
