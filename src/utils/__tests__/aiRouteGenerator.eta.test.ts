/**
 * estimateRideMinutes — the seam between the generator's elevation profile
 * and the ETA model.
 *
 * These two disagree about units: `directions.js fetchElevationProfile`
 * reports per-point `distance` in **metres**, while `calculatePersonalizedETA`
 * reads that same field as **kilometres**. Handing one to the other
 * unconverted is a silent 1000× error, so the conversion is the thing under
 * test here (T1.1 distance-unit contract).
 */
import { describe, it, expect } from 'vitest';
import { estimateRideMinutes } from '../aiRouteGenerator';
import { calculatePersonalizedETA } from '../personalizedETA.js';

/** A flat profile in the generator's shape: `distance` in METRES. */
function flatProfileMetres(distanceKm: number) {
  return [
    { distance: 0, elevation: 100 },
    { distance: distanceKm * 1000, elevation: 100 },
  ];
}

describe('estimateRideMinutes', () => {
  it('converts the metres-based profile to km before pricing it', () => {
    const distanceKm = 30;
    const minutes = estimateRideMinutes(distanceKm, flatProfileMetres(distanceKm), {
      routeProfile: 'road',
      trainingGoal: 'endurance',
    });

    // The same ride, priced directly in the ETA model's own units.
    const expected = (
      calculatePersonalizedETA({
        distanceKm,
        elevationProfile: [
          { distance: 0, elevation: 100 },
          { distance: distanceKm, elevation: 100 },
        ],
        routeProfile: 'road',
        trainingGoal: 'endurance',
      }) as { totalSeconds: number }
    ).totalSeconds / 60;

    expect(minutes).toBeCloseTo(expected, 3);
    // And a sanity floor: 30 km can never be a multi-day ride, which is what
    // the unconverted profile would have implied.
    expect(minutes).toBeLessThan(240);
  });

  it('prices a steep route slower than a flat one of the same length', () => {
    // Grade only bites once the quadratic penalty outruns the descent bonus —
    // personalizedETA's curves cross around 8%, so this uses 12% to test the
    // conversion rather than that crossover. A profile left in metres would
    // compute a ~0% grade here and lose the difference entirely.
    const distanceKm = 20;
    const flat = estimateRideMinutes(distanceKm, flatProfileMetres(distanceKm), {
      routeProfile: 'road',
    });
    const steep = estimateRideMinutes(
      distanceKm,
      [
        { distance: 0, elevation: 100 },
        { distance: 10_000, elevation: 1300 },
        { distance: 20_000, elevation: 100 },
      ],
      { routeProfile: 'road' },
    );
    expect(steep).toBeGreaterThan(flat as number);
  });

  it('still estimates when there is no usable profile', () => {
    expect(estimateRideMinutes(30, [], { routeProfile: 'road' })).toBeGreaterThan(0);
    expect(estimateRideMinutes(30, null as never, { routeProfile: 'road' })).toBeGreaterThan(0);
  });

  it('maps the mtb routing profile onto the mountain pace', () => {
    const mtb = estimateRideMinutes(20, flatProfileMetres(20), { routeProfile: 'mtb' });
    const road = estimateRideMinutes(20, flatProfileMetres(20), { routeProfile: 'road' });
    expect(mtb).toBeGreaterThan(road as number);
  });

  it('returns null for a route with no length', () => {
    expect(estimateRideMinutes(0, flatProfileMetres(10), {})).toBeNull();
  });

  it('ignores malformed points rather than throwing', () => {
    const minutes = estimateRideMinutes(
      10,
      [
        { distance: 0, elevation: 100 },
        { distance: NaN, elevation: 200 },
        { distance: 10_000, elevation: 100 },
      ] as never,
      { routeProfile: 'road' },
    );
    expect(minutes).toBeGreaterThan(0);
  });
});
