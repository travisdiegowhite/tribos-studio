import { describe, it, expect } from 'vitest';
import { assembleBikeHistory, buildVerdict, type RideInput, type ComponentInput, type BikeInput } from './wearSeries';
import { METERS_PER_MILE } from './catalog';

const MI = METERS_PER_MILE;
const NOW = new Date(2026, 8, 9, 12, 0, 0); // 2026-09-09 local noon

const bike: BikeInput = { id: 'b1', name: 'Aethos', category: 'road', totalDistanceLoggedM: 4120 * MI, isTrainerBike: false, purchasePrice: null };

function ride(id: string, day: string, miles: number, extra: Partial<RideInput> = {}): RideInput {
  return {
    id, name: id, startDate: `${day}T14:00:00Z`, startDateLocal: `${day}T08:00:00`, distanceM: miles * MI,
    movingTimeS: null, type: 'Ride', trainer: false, surfaceOverride: null, isWet: null, ...extra,
  };
}
function comp(id: string, type: string, extra: Partial<ComponentInput> = {}): ComponentInput {
  return {
    id, componentType: type, brand: null, model: null, status: 'active', installedDate: '2026-01-01', replacedDate: null,
    distanceAtInstallM: 0, warningThresholdM: null, replaceThresholdM: null, createdAt: null, ...extra,
  };
}

describe('assembleBikeHistory', () => {
  it('handles a bike with no rides', () => {
    const h = assembleBikeHistory({ bike, components: [comp('c1', 'chain')], rides: [], useImperial: true, now: NOW });
    expect(h.componentWear[0].effectiveWearM).toBe(0);
    expect(h.componentWear[0].level).toBe('ok');
    expect(h.componentWear[0].word).toBe('fresh');
    expect(h.isLowerBound).toBe(true);
    expect(h.rideStrip.length).toBeGreaterThan(0);
    expect(h.rideStrip.every((b) => b.distanceM === 0)).toBe(true);
    expect(h.verdict).toBe('Everything is fresh. Nothing needs doing.');
  });

  it('says a 1,380 of 1,500 mile chain is nearly done', () => {
    const rides = Array.from({ length: 23 }, (_, i) => ride(`r${i}`, `2026-0${3 + Math.floor(i / 8)}-${String(1 + (i % 8) * 3).padStart(2, '0')}`, 60));
    const h = assembleBikeHistory({ bike, components: [comp('c1', 'chain')], rides, useImperial: true, now: NOW });
    const chain = h.componentWear[0];
    expect(Math.round(chain.effectiveWearM / MI)).toBe(1380);
    expect(chain.word).toBe('nearly done');
    expect(chain.level).toBe('warning');
    expect(chain.pct).toBeCloseTo(0.92, 2);
    expect(chain.sentence).toBe('Chain is nearly done — 1,380 of 1,500 miles.');
    expect(h.verdict).toBe(chain.sentence);
  });

  it('excludes rides before install and hands rides after a replacement to the successor', () => {
    const rides = [ride('a', '2026-03-01', 100), ride('b', '2026-05-01', 100), ride('c', '2026-07-01', 100)];
    const old = comp('old', 'chain', { status: 'replaced', installedDate: '2026-02-01', replacedDate: '2026-06-01' });
    const fresh = comp('new', 'chain', { installedDate: '2026-06-01' });
    const h = assembleBikeHistory({ bike, components: [old, fresh], rides, useImperial: true, now: NOW });
    const byId = Object.fromEntries(h.componentWear.map((c) => [c.componentId, c]));
    expect(Math.round(byId.old.effectiveWearM / MI)).toBe(200);
    expect(Math.round(byId.new.effectiveWearM / MI)).toBe(100);
    // two series segments, one ending with a replace event
    const series = Object.fromEntries(h.wearSeries.map((s) => [s.componentId, s]));
    expect(series.old.current).toBe(false);
    expect(series.old.events.map((e) => e.kind)).toContain('replace');
    expect(series.new.events.map((e) => e.kind)).toContain('install');
    // active part is listed first
    expect(h.componentWear[0].componentId).toBe('new');
  });

  it('multiplies gravel and wet miles, and sends trainer rides indoors', () => {
    const rides = [
      ride('road', '2026-08-01', 100),
      ride('gravel', '2026-08-02', 100, { type: 'GravelRide' }),
      ride('wet', '2026-08-03', 100, { isWet: true }),
      ride('turbo', '2026-08-04', 100, { type: 'VirtualRide' }),
    ];
    const h = assembleBikeHistory({ bike, components: [comp('c1', 'chain'), comp('t1', 'tires_road')], rides, useImperial: true, now: NOW });
    const chain = h.componentWear.find((c) => c.componentType === 'chain')!;
    const tires = h.componentWear.find((c) => c.componentType === 'tires_road')!;
    // chain: 100 + 160 + 200 + 80
    expect(Math.round(chain.effectiveWearM / MI)).toBe(540);
    expect(Math.round(chain.wetM / MI)).toBe(100);
    expect(Math.round(chain.offroadM / MI)).toBe(100);
    expect(Math.round(chain.indoorM / MI)).toBe(100);
    // tires accrue nothing on the trainer: 100 + 180 + 110 + 0
    expect(Math.round(tires.effectiveWearM / MI)).toBe(390);
    expect(h.isLowerBound).toBe(false);
    const wetBucket = h.rideStrip.find((b) => b.wetM > 0)!;
    expect(Math.round(wetBucket.wetM / MI)).toBe(100);
    expect(Math.round(h.totals.indoorM / MI)).toBe(100);
    expect(h.totals.rides).toBe(4);
  });

  it('lets a rider override win over the ride type, and a gravel bike default to offroad', () => {
    const rides = [ride('x', '2026-08-01', 100, { type: 'GravelRide', surfaceOverride: 'road' })];
    const h = assembleBikeHistory({ bike, components: [comp('c1', 'chain')], rides, useImperial: true, now: NOW });
    expect(Math.round(h.componentWear[0].effectiveWearM / MI)).toBe(100);
    const g = assembleBikeHistory({ bike: { ...bike, category: 'gravel' }, components: [comp('c1', 'chain')], rides: [ride('y', '2026-08-01', 100)], useImperial: true, now: NOW });
    expect(Math.round(g.componentWear[0].effectiveWearM / MI)).toBe(160);
  });

  it('buckets by day for short histories and by Monday weeks for long ones, pre-seeded', () => {
    const short = assembleBikeHistory({ bike, components: [], rides: [ride('a', '2026-08-20', 10)], useImperial: true, now: NOW });
    expect(short.domain.bucket).toBe('day');
    expect(short.rideStrip[0].key).toBe('2026-08-20');
    expect(short.rideStrip[short.rideStrip.length - 1].key).toBe('2026-09-09');
    expect(short.rideStrip.length).toBe(21);

    const long = assembleBikeHistory({ bike, components: [], rides: [ride('a', '2026-01-15', 10)], useImperial: true, now: NOW });
    expect(long.domain.bucket).toBe('week');
    expect(long.rideStrip[0].key).toBe('2026-01-12'); // Monday of the week of Jan 15
    expect(long.rideStrip.every((b) => new Date(b.t).getDay() === 1)).toBe(true);
    expect(long.rideStrip.filter((b) => b.distanceM > 0)).toHaveLength(1);
  });

  it('caps the window at a year and carries earlier wear as the series start', () => {
    const rides = [ride('old', '2024-06-01', 500), ride('recent', '2026-08-01', 100)];
    const h = assembleBikeHistory({ bike, components: [comp('c1', 'chain', { installedDate: '2024-01-01' })], rides, useImperial: true, now: NOW });
    expect(h.domain.startKey >= '2025-09-01').toBe(true);
    expect(Math.round(h.componentWear[0].effectiveWearM / MI)).toBe(600);
    expect(Math.round(h.wearSeries[0].startM / MI)).toBe(500);
    expect(h.wearSeries[0].points).toHaveLength(1);
    expect(h.rideStrip.filter((b) => b.distanceM > 0)).toHaveLength(1);
  });

  it('reports age for time-based parts and no series', () => {
    const h = assembleBikeHistory({ bike, components: [comp('s1', 'sealant', { installedDate: '2026-04-01' })], rides: [], useImperial: true, now: NOW });
    const s = h.componentWear[0];
    expect(s.wearModel).toBe('time');
    expect(s.ageDays).toBe(161);
    expect(s.word).toBe('past due');
    expect(s.sentence).toBe('Tubeless sealant is past due — 5 of 4 months.');
    expect(h.wearSeries).toHaveLength(0);
  });

  it('keeps the raw alert-consistent number regardless of factors, and formats metric', () => {
    const h = assembleBikeHistory({
      bike: { ...bike, totalDistanceLoggedM: 2000 * 1000 },
      components: [comp('c1', 'chain', { distanceAtInstallM: 500 * 1000, replaceThresholdM: 2400 * 1000 })],
      rides: [ride('g', '2026-08-01', 100, { type: 'GravelRide' })],
      useImperial: false, now: NOW,
    });
    const c = h.componentWear[0];
    expect(c.rawWearM).toBe(1500 * 1000);
    expect(c.sentence).toMatch(/^Chain is fresh — 257 of 2,400 km\.$/);
    expect(h.unit).toBe('km');
  });

  it('writes a two-problem verdict, worst first', () => {
    const rides = Array.from({ length: 40 }, (_, i) => ride(`r${i}`, `2026-0${3 + Math.floor(i / 8)}-${String(1 + (i % 8) * 3).padStart(2, '0')}`, 60));
    const h = assembleBikeHistory({ bike, components: [comp('c1', 'chain'), comp('p1', 'brake_pads_disc')], rides, useImperial: true, now: NOW });
    expect(h.verdict).toMatch(/^Two things need doing\. The (chain|brake pads) is past due/);
    expect(buildVerdict([], true)).toMatch(/No parts tracked yet/);
  });
});
