/**
 * powerZones tests — parity with the DB trigger calculate_power_zones()
 * (migration 002) and the zone-lookup semantics used by the activity chart.
 */

import { describe, it, expect } from 'vitest';
import {
  zonesFromFtp,
  resolvePowerZones,
  zoneIndexForPower,
  ZONE_NAMES,
} from './powerZones';

describe('zonesFromFtp', () => {
  it('matches the DB trigger breakpoints for FTP 200', () => {
    const zones = zonesFromFtp(200)!;
    expect(zones.map((z) => z.minWatts)).toEqual([0, 110, 150, 180, 210, 240, 300]);
    expect(zones.map((z) => z.maxWatts)).toEqual([110, 150, 180, 210, 240, 300, null]);
    expect(zones.map((z) => z.name)).toEqual([...ZONE_NAMES]);
  });

  it('rounds like the trigger (ROUND, not floor) for odd FTPs', () => {
    // FTP 253: 253*0.55 = 139.15 → 139; 253*0.9 = 227.7 → 228
    const zones = zonesFromFtp(253)!;
    expect(zones[0].maxWatts).toBe(139);
    expect(zones[2].maxWatts).toBe(228);
  });

  it('returns null without a usable FTP', () => {
    expect(zonesFromFtp(null)).toBeNull();
    expect(zonesFromFtp(0)).toBeNull();
    expect(zonesFromFtp(NaN)).toBeNull();
  });
});

describe('resolvePowerZones', () => {
  const profileZones = Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((i) => [
      `z${i + 1}`,
      {
        name: ZONE_NAMES[i],
        min: i * 50,
        max: i === 6 ? null : (i + 1) * 50,
      },
    ])
  );

  it('prefers complete profile JSONB over FTP derivation', () => {
    const zones = resolvePowerZones(200, profileZones)!;
    expect(zones[1].minWatts).toBe(50);
    expect(zones[6].maxWatts).toBeNull();
  });

  it('falls back to FTP when the JSONB is partial or malformed', () => {
    const partial = { z1: { min: 0, max: 110 } };
    const zones = resolvePowerZones(200, partial)!;
    expect(zones[0].maxWatts).toBe(110); // from FTP derivation, same value
    expect(zones).toHaveLength(7);
    expect(resolvePowerZones(200, { z1: { name: 'broken' } })![6].minWatts).toBe(300);
  });

  it('returns null with neither source', () => {
    expect(resolvePowerZones(null, null)).toBeNull();
  });
});

describe('zoneIndexForPower', () => {
  const zones = zonesFromFtp(200)!;

  it('uses half-open [min, max) intervals', () => {
    expect(zoneIndexForPower(0, zones)).toBe(0);
    expect(zoneIndexForPower(109, zones)).toBe(0);
    expect(zoneIndexForPower(110, zones)).toBe(1); // boundary belongs to the upper zone
    expect(zoneIndexForPower(299, zones)).toBe(5);
    expect(zoneIndexForPower(300, zones)).toBe(6);
    expect(zoneIndexForPower(1500, zones)).toBe(6); // open-ended top
  });
});
