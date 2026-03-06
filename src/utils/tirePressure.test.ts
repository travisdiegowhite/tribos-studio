import { describe, it, expect } from 'vitest';
import {
  calculateTirePressure,
  mapRouteSurfaceToPressSurface,
  formatPressure,
  formatPressureSummary,
} from './tirePressure';
import type { TirePressureInput } from './tirePressure';

const BASE_INPUT: TirePressureInput = {
  riderWeightKg: 75,
  bikeWeightKg: 9,
  tireWidthMm: 28,
  surface: 'paved',
  tubeless: false,
};

describe('calculateTirePressure', () => {
  it('returns front and rear pressure in PSI and BAR', () => {
    const result = calculateTirePressure(BASE_INPUT);
    expect(result.frontPsi).toBeGreaterThan(0);
    expect(result.rearPsi).toBeGreaterThan(0);
    expect(result.frontBar).toBeGreaterThan(0);
    expect(result.rearBar).toBeGreaterThan(0);
    expect(result.frontPsi).toBeLessThan(result.rearPsi);
  });

  it('rear is higher than front due to 40/60 weight distribution', () => {
    const result = calculateTirePressure(BASE_INPUT);
    expect(result.rearPsi).toBeGreaterThan(result.frontPsi);
  });

  it('tubeless lowers pressure by ~8%', () => {
    const clincher = calculateTirePressure({ ...BASE_INPUT, tubeless: false });
    const tubeless = calculateTirePressure({ ...BASE_INPUT, tubeless: true });
    expect(tubeless.frontPsi).toBeLessThan(clincher.frontPsi);
    expect(tubeless.rearPsi).toBeLessThan(clincher.rearPsi);
    expect(tubeless.tubeless).toBe(true);
  });

  it('gravel surface lowers pressure vs paved', () => {
    const paved = calculateTirePressure({ ...BASE_INPUT, surface: 'paved' });
    const gravel = calculateTirePressure({ ...BASE_INPUT, surface: 'gravel' });
    expect(gravel.frontPsi).toBeLessThan(paved.frontPsi);
    expect(gravel.rearPsi).toBeLessThan(paved.rearPsi);
  });

  it('wider tires produce lower pressure', () => {
    const narrow = calculateTirePressure({ ...BASE_INPUT, tireWidthMm: 25 });
    const wide = calculateTirePressure({ ...BASE_INPUT, tireWidthMm: 40 });
    expect(wide.frontPsi).toBeLessThan(narrow.frontPsi);
    expect(wide.rearPsi).toBeLessThan(narrow.rearPsi);
  });

  it('heavier rider produces higher pressure', () => {
    const light = calculateTirePressure({ ...BASE_INPUT, riderWeightKg: 60 });
    const heavy = calculateTirePressure({ ...BASE_INPUT, riderWeightKg: 100 });
    expect(heavy.rearPsi).toBeGreaterThan(light.rearPsi);
  });

  it('cold temperature increases pressure recommendation', () => {
    const warm = calculateTirePressure({ ...BASE_INPUT, temperatureCelsius: 21 });
    const cold = calculateTirePressure({ ...BASE_INPUT, temperatureCelsius: 0 });
    expect(cold.frontPsi).toBeGreaterThan(warm.frontPsi);
    expect(cold.temperatureAdjusted).toBe(true);
  });

  it('hot temperature decreases pressure recommendation', () => {
    const warm = calculateTirePressure({ ...BASE_INPUT, temperatureCelsius: 21 });
    const hot = calculateTirePressure({ ...BASE_INPUT, temperatureCelsius: 38 });
    expect(hot.frontPsi).toBeLessThan(warm.frontPsi);
  });

  it('adds cold weather warning below 5°C', () => {
    const result = calculateTirePressure({ ...BASE_INPUT, temperatureCelsius: 2 });
    expect(result.warnings).toContain('Cold weather: check pressure before your ride');
  });

  it('adds hot weather warning above 35°C', () => {
    const result = calculateTirePressure({ ...BASE_INPUT, temperatureCelsius: 40 });
    expect(result.warnings).toContain('Hot weather: pressure may increase during your ride');
  });

  it('clamps pressure to not exceed max rated PSI', () => {
    const result = calculateTirePressure({
      ...BASE_INPUT,
      tireWidthMm: 25,
      riderWeightKg: 100,
      maxPressurePsi: 60,
    });
    expect(result.frontPsi).toBeLessThanOrEqual(60);
    expect(result.rearPsi).toBeLessThanOrEqual(60);
    expect(result.warnings.some((w) => w.includes('exceeds max rated pressure'))).toBe(true);
  });

  it('wider rim reduces pressure slightly', () => {
    const narrow = calculateTirePressure({ ...BASE_INPUT, rimWidthMm: 17 });
    const wide = calculateTirePressure({ ...BASE_INPUT, rimWidthMm: 25 });
    expect(wide.frontPsi).toBeLessThan(narrow.frontPsi);
  });

  it('returns no warnings for normal conditions', () => {
    const result = calculateTirePressure(BASE_INPUT);
    expect(result.warnings).toHaveLength(0);
  });

  it('uses default bike weight when not provided', () => {
    const result = calculateTirePressure({
      riderWeightKg: 75,
      tireWidthMm: 28,
      surface: 'paved',
      tubeless: false,
    });
    expect(result.frontPsi).toBeGreaterThan(0);
  });

  it('clamps very narrow tires to min 50 PSI floor', () => {
    const result = calculateTirePressure({
      riderWeightKg: 50,
      bikeWeightKg: 7,
      tireWidthMm: 23,
      surface: 'paved',
      tubeless: true,
    });
    expect(result.frontPsi).toBeGreaterThanOrEqual(50);
  });

  it('clamps wide tires to max 55 PSI ceiling', () => {
    const result = calculateTirePressure({
      riderWeightKg: 120,
      bikeWeightKg: 15,
      tireWidthMm: 45,
      surface: 'paved',
      tubeless: false,
    });
    expect(result.rearPsi).toBeLessThanOrEqual(55);
  });
});

describe('mapRouteSurfaceToPressSurface', () => {
  it('maps road to paved', () => {
    expect(mapRouteSurfaceToPressSurface('road')).toBe('paved');
  });

  it('maps gravel to gravel', () => {
    expect(mapRouteSurfaceToPressSurface('gravel')).toBe('gravel');
  });

  it('maps mountain to unpaved', () => {
    expect(mapRouteSurfaceToPressSurface('mountain')).toBe('unpaved');
  });

  it('maps bike to paved', () => {
    expect(mapRouteSurfaceToPressSurface('bike')).toBe('paved');
  });

  it('maps unknown values to mixed', () => {
    expect(mapRouteSurfaceToPressSurface('something')).toBe('mixed');
    expect(mapRouteSurfaceToPressSurface('')).toBe('mixed');
  });

  it('is case-insensitive', () => {
    expect(mapRouteSurfaceToPressSurface('Road')).toBe('paved');
    expect(mapRouteSurfaceToPressSurface('GRAVEL')).toBe('gravel');
  });
});

describe('formatPressure', () => {
  it('formats PSI as integer', () => {
    expect(formatPressure(72, 'psi')).toBe('72 PSI');
  });

  it('formats BAR with one decimal', () => {
    expect(formatPressure(72, 'bar')).toBe('5.0 bar');
  });
});

describe('formatPressureSummary', () => {
  it('returns a readable summary', () => {
    const result = calculateTirePressure(BASE_INPUT);
    const summary = formatPressureSummary(result, 'psi');
    expect(summary).toContain('F ');
    expect(summary).toContain('R ');
    expect(summary).toContain('28c');
    expect(summary).toContain('clincher');
    expect(summary).toContain('paved');
  });

  it('shows tubeless when applicable', () => {
    const result = calculateTirePressure({ ...BASE_INPUT, tubeless: true });
    const summary = formatPressureSummary(result, 'psi');
    expect(summary).toContain('tubeless');
  });
});
