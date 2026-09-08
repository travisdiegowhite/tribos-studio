import { describe, it, expect } from 'vitest';
import {
  CATALOG_PARTS,
  COMPONENT_TYPE_IDS,
  WEAR_MODELS,
  PHOTO_SHOTS,
  getCatalogPart,
  getCatalogThresholds,
  partsForBikeType,
  effectiveWearMeters,
  classifyRideSurface,
  METERS_PER_MILE,
} from './gearCatalog.js';
import { DEFAULT_COMPONENT_THRESHOLDS, COMPONENT_TYPES, getDefaultThresholds } from './gearDefaults.js';

describe('gearCatalog: shape', () => {
  it('has unique, stable part ids', () => {
    expect(new Set(COMPONENT_TYPE_IDS).size).toBe(COMPONENT_TYPE_IDS.length);
    // The original ten types from migration 043 must survive: rows exist.
    for (const legacy of ['chain', 'cassette', 'tires_road', 'tires_gravel', 'wheels_road', 'wheels_gravel',
      'brake_pads_rim', 'brake_pads_disc', 'bar_tape', 'cables']) {
      expect(COMPONENT_TYPE_IDS).toContain(legacy);
    }
  });

  it('every part is internally consistent', () => {
    for (const p of CATALOG_PARTS) {
      expect(WEAR_MODELS).toContain(p.wearModel);
      if (p.wearModel === 'distance') {
        expect(p.replaceMeters).toBeGreaterThan(0);
        expect(p.warningMeters).toBeLessThan(p.replaceMeters);
        expect(p.wearFactors).toBeTruthy();
        for (const k of ['road', 'offroad', 'indoor', 'wet']) {
          expect(typeof p.wearFactors[k]).toBe('number');
        }
      } else {
        expect(p.wearFactors).toBeNull();
      }
      if (p.wearModel === 'time') expect(p.serviceMonths).toBeGreaterThan(0);
      if (p.wearModel === 'hours') expect(p.serviceHours).toBeGreaterThan(0);
      // A field can't be both photo-readable and rider-only.
      for (const f of p.photoReadable) expect(p.riderSupplied).not.toContain(f);
      // Every photoReadable metadata key exists in the schema (brand/model are identity, not metadata).
      for (const f of p.photoReadable) {
        if (f !== 'brand' && f !== 'model') expect(Object.keys(p.metadataSchema)).toContain(f);
      }
      if (p.photoHint) expect(PHOTO_SHOTS.map((s) => s.id)).toContain(p.photoHint);
      expect(p.whyItMatters.length).toBeGreaterThan(10);
    }
  });

  it('tires and pads accrue nothing on the trainer', () => {
    for (const t of ['tires_road', 'tires_gravel', 'brake_pads_disc', 'brake_pads_rim', 'brake_rotors']) {
      expect(getCatalogPart(t).wearFactors.indoor).toBe(0);
    }
    expect(getCatalogPart('chain').wearFactors.indoor).toBeGreaterThan(0);
  });
});

describe('gearCatalog: wear', () => {
  it('a dry road mile is a mile', () => {
    expect(effectiveWearMeters('chain', 1000, { surface: 'road', wet: false })).toBe(1000);
  });

  it('wet gravel multiplies both factors', () => {
    const chain = getCatalogPart('chain');
    const expected = 1000 * chain.wearFactors.offroad * chain.wearFactors.wet;
    expect(effectiveWearMeters('chain', 1000, { surface: 'offroad', wet: true })).toBeCloseTo(expected);
  });

  it('non-distance parts and bad input wear nothing', () => {
    expect(effectiveWearMeters('bar_tape', 1000, { surface: 'road', wet: true })).toBe(0);
    expect(effectiveWearMeters('nope', 1000, { surface: 'road', wet: false })).toBe(0);
    expect(effectiveWearMeters('chain', -5, { surface: 'road', wet: false })).toBe(0);
    expect(effectiveWearMeters('chain', NaN, { surface: 'road', wet: false })).toBe(0);
  });

  it('classifies surface with rider override first', () => {
    expect(classifyRideSurface({ surfaceOverride: 'gravel', activityType: 'Ride' })).toBe('offroad');
    expect(classifyRideSurface({ surfaceOverride: 'road', activityType: 'GravelRide' })).toBe('road');
    expect(classifyRideSurface({ activityType: 'VirtualRide' })).toBe('indoor');
    expect(classifyRideSurface({ activityType: 'Ride', trainer: true })).toBe('indoor');
    expect(classifyRideSurface({ activityType: 'MountainBikeRide' })).toBe('offroad');
    expect(classifyRideSurface({ activityType: 'Ride', bikeCategory: 'gravel' })).toBe('offroad');
    expect(classifyRideSurface({ activityType: 'Ride', bikeCategory: 'trainer' })).toBe('indoor');
    expect(classifyRideSurface({ activityType: 'Ride' })).toBe('road');
  });
});

describe('gearCatalog: filters and compatibility', () => {
  it('filters parts by bike category', () => {
    const road = partsForBikeType('road').map((p) => p.type);
    expect(road).toContain('tires_road');
    expect(road).not.toContain('tires_gravel');
    expect(road).not.toContain('fork_service');
    const mtb = partsForBikeType('mtb').map((p) => p.type);
    expect(mtb).toContain('fork_service');
    expect(mtb).not.toContain('brake_pads_rim');
    expect(partsForBikeType(null)).toHaveLength(CATALOG_PARTS.length);
  });

  it('gearDefaults keeps its historical thresholds and shape', () => {
    expect(getDefaultThresholds('chain')).toEqual({ warning: Math.round(1200 * METERS_PER_MILE), replace: Math.round(1500 * METERS_PER_MILE) });
    expect(getDefaultThresholds('unknown')).toEqual({ warning: null, replace: null });
    expect(DEFAULT_COMPONENT_THRESHOLDS.bar_tape).toEqual({ warning: null, replace: null, time_based_months: 12 });
    expect(DEFAULT_COMPONENT_THRESHOLDS.wheels_road).toEqual({ warning: null, replace: null });
    expect(DEFAULT_COMPONENT_THRESHOLDS.sealant.time_based_months).toBe(4);
    expect(COMPONENT_TYPES.find((c) => c.value === 'chain').label).toBe('Chain');
    expect(getCatalogThresholds('cassette').replace).toBe(Math.round(3000 * METERS_PER_MILE));
  });
});
