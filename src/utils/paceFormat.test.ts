import { describe, it, expect } from 'vitest';
import { formatPace, formatPaceClock, paceSecPerKm, speedToPaceSecPerKm, paceUnit } from './paceFormat';

describe('paceFormat', () => {
  it('turns a speed into seconds per km, refusing walking-pace noise', () => {
    expect(speedToPaceSecPerKm(1000 / 300)).toBeCloseTo(300);
    expect(speedToPaceSecPerKm(0.5)).toBeNull();
    expect(speedToPaceSecPerKm(null)).toBeNull();
  });

  it('turns a distance and time into seconds per km', () => {
    expect(paceSecPerKm(10000, 3000)).toBe(300);
    expect(paceSecPerKm(0, 3000)).toBeNull();
    expect(paceSecPerKm(100, 3000)).toBeNull();
  });

  it('formats per km or per mile, rolling 60 seconds into the minute', () => {
    expect(formatPace(300)).toBe('5:00/km');
    expect(formatPace(300, true)).toBe('8:03/mi');
    expect(formatPaceClock(299.7)).toBe('5:00');
    expect(formatPace(null)).toBe('—');
    expect(paceUnit(true)).toBe('/mi');
  });
});
