import { describe, expect, it } from 'vitest';
import { formatCardDate, formatCardDuration, splitValueUnit, truncateToWidth } from './format';

describe('formatCardDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatCardDuration(4 * 3600 + 12 * 60)).toBe('4h 12m');
  });
  it('formats sub-hour durations as minutes', () => {
    expect(formatCardDuration(58 * 60)).toBe('58m');
  });
  it('formats sub-minute durations as seconds', () => {
    expect(formatCardDuration(45)).toBe('45s');
  });
  it('handles empty values', () => {
    expect(formatCardDuration(0)).toBe('—');
    expect(formatCardDuration(null)).toBe('—');
    expect(formatCardDuration(undefined)).toBe('—');
  });
});

describe('formatCardDate', () => {
  it('formats a local timestamp as a field-guide date line', () => {
    expect(formatCardDate('2026-07-26T08:30:00')).toBe('SUN · JUL 26 2026');
  });
  it('returns empty string for missing/invalid input', () => {
    expect(formatCardDate(null)).toBe('');
    expect(formatCardDate('not-a-date')).toBe('');
  });
});

describe('splitValueUnit', () => {
  it('splits space-separated units', () => {
    expect(splitValueUnit('42.3 km')).toEqual({ value: '42.3', unit: 'km' });
    expect(splitValueUnit('18.2 km/h')).toEqual({ value: '18.2', unit: 'km/h' });
  });
  it('splits attached units', () => {
    expect(splitValueUnit('830m')).toEqual({ value: '830', unit: 'm' });
  });
  it('passes through unit-less values', () => {
    expect(splitValueUnit('148')).toEqual({ value: '148', unit: '' });
  });
  it('handles empty input', () => {
    expect(splitValueUnit(null)).toEqual({ value: '—', unit: '' });
  });
});

describe('truncateToWidth', () => {
  // Fake measure: 10px per character — jsdom has no real canvas.
  const ctx = {
    measureText: (text: string) => ({ width: text.length * 10 }),
  } as unknown as CanvasRenderingContext2D;

  it('returns text unchanged when it fits', () => {
    expect(truncateToWidth(ctx, 'Morning Ride', 200)).toBe('Morning Ride');
  });
  it('truncates with an ellipsis when too long', () => {
    const result = truncateToWidth(ctx, 'A very long activity name indeed', 100);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length * 10).toBeLessThanOrEqual(100);
  });
  it('handles empty text', () => {
    expect(truncateToWidth(ctx, '', 100)).toBe('');
  });
});
