import { describe, it, expect } from 'vitest';
import { HR_ZONE_DEFS, POWER_ZONE_DEFS, hrZoneFor, powerZoneFor, zoneLowerBound } from './rideZones';

describe('powerZoneFor', () => {
  const ftp = 250;
  it('classifies on inclusive lower bounds as % of FTP', () => {
    expect(powerZoneFor(100, ftp)?.zone).toBe(1); // 40%
    expect(powerZoneFor(137.5, ftp)?.zone).toBe(2); // exactly 55%
    expect(powerZoneFor(200, ftp)?.zone).toBe(3); // 80%
    expect(powerZoneFor(250, ftp)?.zone).toBe(4); // 100%
    expect(powerZoneFor(275, ftp)?.zone).toBe(5); // 110%
    expect(powerZoneFor(330, ftp)?.zone).toBe(6); // 132%
    expect(powerZoneFor(600, ftp)?.zone).toBe(7); // 240%
  });
  it('is null without a usable value or FTP', () => {
    expect(powerZoneFor(null, ftp)).toBeNull();
    expect(powerZoneFor(0, ftp)).toBeNull();
    expect(powerZoneFor(200, null)).toBeNull();
    expect(powerZoneFor(200, 0)).toBeNull();
  });
  it('has seven contiguous zones', () => {
    expect(POWER_ZONE_DEFS).toHaveLength(7);
    for (let i = 1; i < POWER_ZONE_DEFS.length; i++) {
      expect(POWER_ZONE_DEFS[i].min).toBe(POWER_ZONE_DEFS[i - 1].max);
    }
  });
});

describe('hrZoneFor', () => {
  const maxHr = 180;
  it('classifies as % of max HR', () => {
    expect(hrZoneFor(100, maxHr)?.zone).toBe(1); // 56%
    expect(hrZoneFor(108, maxHr)?.zone).toBe(2); // 60%
    expect(hrZoneFor(140, maxHr)?.zone).toBe(3); // 78%
    expect(hrZoneFor(150, maxHr)?.zone).toBe(4); // 83%
    expect(hrZoneFor(175, maxHr)?.zone).toBe(5); // 97%
  });
  it('has five contiguous zones', () => {
    expect(HR_ZONE_DEFS).toHaveLength(5);
    for (let i = 1; i < HR_ZONE_DEFS.length; i++) {
      expect(HR_ZONE_DEFS[i].min).toBe(HR_ZONE_DEFS[i - 1].max);
    }
  });
});

describe('zoneLowerBound', () => {
  it('converts a zone floor to the metric unit', () => {
    expect(zoneLowerBound(POWER_ZONE_DEFS[3], 250)).toBe(225);
    expect(zoneLowerBound(HR_ZONE_DEFS[1], 180)).toBe(108);
  });
});
