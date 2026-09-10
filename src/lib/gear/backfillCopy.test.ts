import { describe, it, expect } from 'vitest';
import { describeLinked, describeProviderGear, describeSkipped, describeSummary, describeUnassigned, providerGearName } from './backfillCopy';
import { METERS_PER_MILE } from './catalog';
import type { BackfillSkipped, BackfillSummary, ProviderGearItem } from '../../hooks/useGear';

const MI = METERS_PER_MILE;
const summary = (over: Partial<BackfillSummary> = {}): BackfillSummary => ({
  rides: 212, distanceM: 4120 * MI, firstDate: '2025-03-02', lastDate: '2026-09-01',
  bySurface: { road: 3900 * MI, offroad: 220 * MI, indoor: 0 },
  byType: { road: 200, gravel: 12, mtb: 0, ebike: 0, indoor: 0 },
  ...over,
});
const skipped = (over: Partial<BackfillSkipped> = {}): BackfillSkipped => ({ alreadyHere: 0, protected: 0, otherBike: 0, byGear: [], ...over });

describe('backfill copy', () => {
  it('writes the preview line with the surface mix', () => {
    expect(describeSummary(summary(), true)).toBe('212 rides, 4,120 mi — 3,900 road, 220 gravel or trail.');
    expect(describeSummary(summary({ bySurface: { road: 4120 * MI, offroad: 0, indoor: 0 } }), true)).toBe('212 rides, 4,120 mi.');
    expect(describeSummary(summary({ rides: 0, distanceM: 0 }), true)).toBe('No rides to link.');
    expect(describeSummary(summary({ rides: 1, distanceM: 50_000, bySurface: { road: 50_000, offroad: 0, indoor: 0 } }), false)).toBe('1 ride, 50 km.');
  });

  it('says what stays put, and why', () => {
    const s = skipped({ protected: 14, otherBike: 8, byGear: [{ gearId: 'a', name: 'Tarmac', protected: 14, otherBike: 8 }] });
    expect(describeSkipped(s, true)).toBe('14 are on Tarmac by hand and stay there. 8 Strava put on Tarmac stay there.');
    expect(describeSkipped(s, false)).toBe('14 are on Tarmac by hand and stay there. 8 are on Tarmac already — untick the box to take them over.');
    expect(describeSkipped(skipped({ alreadyHere: 3 }), true)).toBe('3 are on this bike already.');
    expect(describeSkipped(skipped(), true)).toBe('');
    const two = skipped({ protected: 2, byGear: [{ gearId: 'a', name: 'Tarmac', protected: 1, otherBike: 0 }, { gearId: 'b', name: 'Turbo', protected: 1, otherBike: 0 }] });
    expect(describeSkipped(two, true)).toBe('2 are on Tarmac and Turbo by hand and stay there.');
  });

  it('opens with how many rides are on no bike', () => {
    expect(describeUnassigned(212, '2024-03-15')).toBe('212 rides aren’t on any bike yet, going back to Mar 2024.');
    expect(describeUnassigned(1, null)).toBe('1 ride isn’t on any bike yet.');
    expect(describeUnassigned(0, null)).toBe('Every ride you have is on a bike.');
  });

  it('writes the toast', () => {
    expect(describeLinked(212, 4120 * MI, true)).toBe('Linked 212 rides, 4,120 mi.');
    expect(describeLinked(0, 0, true)).toMatch(/already here/);
  });

  it('names and describes a Strava bike', () => {
    const item: ProviderGearItem = {
      ...summary(), providerGearId: 'b123', name: null, brand: 'Specialized', model: 'Aethos', frameType: 3, retired: false,
      suggestedCategory: 'road', claimedByGearId: null, claimedByName: null, claimedByStatus: null,
    };
    expect(providerGearName(item)).toBe('Specialized Aethos');
    expect(providerGearName({ ...item, name: 'Big Red' })).toBe('Big Red');
    expect(providerGearName({ ...item, brand: null, model: null })).toBe('Strava bike b123');
    expect(describeProviderGear(item, true)).toBe('212 rides · 4,120 mi · Mar 2025 – Sep 2026');
  });
});
