import { describe, it, expect } from 'vitest';
import {
  freshnessFromFormScore,
  conditionsFromWeather,
  colorForZone,
} from './todayVocabulary';

describe('freshnessFromFormScore', () => {
  it('returns null for null/undefined', () => {
    expect(freshnessFromFormScore(null)).toBeNull();
    expect(freshnessFromFormScore(undefined)).toBeNull();
  });

  it('boundaries map to expected words', () => {
    expect(freshnessFromFormScore(-25)).toBe('drained');
    expect(freshnessFromFormScore(-15)).toBe('loaded');
    expect(freshnessFromFormScore(-7)).toBe('primed');
    expect(freshnessFromFormScore(0)).toBe('ready');
    expect(freshnessFromFormScore(8)).toBe('sharp');
    expect(freshnessFromFormScore(20)).toBe('stale');
  });
});

describe('conditionsFromWeather', () => {
  it('returns null when weather missing', () => {
    expect(conditionsFromWeather(null)).toBeNull();
    expect(conditionsFromWeather(undefined)).toBeNull();
    expect(conditionsFromWeather({ temperature: null, windSpeed: 5 })).toBeNull();
  });

  it('ideal: 18-24°C, calm wind, clear', () => {
    expect(conditionsFromWeather({ temperature: 20, windSpeed: 8, conditions: 'clear', visibility: 10 })).toBe('ideal');
  });

  it('decent: warmer or breezy', () => {
    expect(conditionsFromWeather({ temperature: 28, windSpeed: 10, conditions: 'clouds', visibility: 10 })).toBe('decent');
    expect(conditionsFromWeather({ temperature: 20, windSpeed: 18, conditions: 'clouds', visibility: 10 })).toBe('decent');
  });

  it('rough: rain or strong wind', () => {
    expect(conditionsFromWeather({ temperature: 15, windSpeed: 30, conditions: 'clouds' })).toBe('rough');
    expect(conditionsFromWeather({ temperature: 12, windSpeed: 8, conditions: 'rain' })).toBe('rough');
  });

  it('severe: extreme cold/heat or huge wind', () => {
    expect(conditionsFromWeather({ temperature: -5, windSpeed: 8, conditions: 'snow' })).toBe('severe');
    expect(conditionsFromWeather({ temperature: 38, windSpeed: 10, conditions: 'clear' })).toBe('severe');
    expect(conditionsFromWeather({ temperature: 20, windSpeed: 50, conditions: 'clear' })).toBe('severe');
  });
});

describe('colorForZone', () => {
  it('returns slate for null', () => {
    expect(colorForZone(null)).toContain('slate');
  });
  it('zones 1-2 → teal', () => {
    expect(colorForZone(1)).toContain('teal');
    expect(colorForZone(2)).toContain('teal');
  });
  it('zone 3 → gold', () => {
    expect(colorForZone(3)).toContain('gold');
  });
  it('zone 4 → orange', () => {
    expect(colorForZone(4)).toContain('orange');
  });
  it('zone 5+ → coral', () => {
    expect(colorForZone(5)).toContain('coral');
    expect(colorForZone(7)).toContain('coral');
  });
});
