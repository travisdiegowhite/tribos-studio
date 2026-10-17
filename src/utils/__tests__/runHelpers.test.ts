import { describe, it, expect } from 'vitest';
import { formatPace, paceSecPerKm, speedToPaceSecPerKm } from '../paceFormat';
import { nounForSport, runCadenceSpm } from '../sportType';
import { streamBestEfforts, wholeRunBests, mergeBests } from '../runBestEfforts';

/** A straight line heading north, `n` points `stepM` metres apart. */
function line(n: number, stepM: number): Array<[number, number]> {
  const dLat = stepM / 111195; // metres per degree of latitude (haversine radius)
  return Array.from({ length: n }, (_, i) => [-105, 40 + i * dLat] as [number, number]);
}

describe('paceFormat', () => {
  it('formats per km and per mile', () => {
    expect(formatPace(300)).toBe('5:00/km');
    expect(formatPace(300, true)).toBe('8:03/mi');
    expect(formatPace(299.6)).toBe('5:00/km');
    expect(formatPace(null)).toBe('—');
  });

  it('refuses paces that are standing still', () => {
    expect(paceSecPerKm(10000, 3000)).toBe(300);
    expect(paceSecPerKm(100, 3000)).toBeNull();
    expect(paceSecPerKm(0, 3000)).toBeNull();
    expect(speedToPaceSecPerKm(4)).toBe(250);
    expect(speedToPaceSecPerKm(0.5)).toBeNull();
  });
});

describe('sport words', () => {
  it('names a sport', () => {
    expect(nounForSport('running')).toBe('run');
    expect(nounForSport('cycling', 'plural')).toBe('rides');
    expect(nounForSport(null)).toBe('activity');
  });

  it('doubles one-leg run cadence only', () => {
    expect(runCadenceSpm(85)).toBe(170);
    expect(runCadenceSpm(172)).toBe(172);
    expect(runCadenceSpm(0)).toBeNull();
  });
});

describe('runBestEfforts', () => {
  it('a constant 4 m/s run gives exact 1k and 5k times', () => {
    const coords = line(121, 50); // 6 km
    const speed = coords.map(() => 4);
    const best = streamBestEfforts({ coords, speed });
    expect(best['1k']).toBeCloseTo(250, 0);
    expect(best['5k']).toBeCloseTo(1250, 0);
    expect(best['10k']).toBeUndefined();
  });

  it('finds the fast kilometre inside a slower run', () => {
    const coords = line(101, 50); // 5 km
    // 3 m/s, with 1 km at 5 m/s in the middle.
    const speed = coords.map((_, i) => (i >= 40 && i <= 60 ? 5 : 3));
    const best = streamBestEfforts({ coords, speed });
    expect(best['1k']).toBeLessThan(215);
    expect(best['1k']).toBeGreaterThan(195);
  });

  it('skips stopped segments like moving time', () => {
    const coords = line(41, 50); // 2 km
    const speed = coords.map((_, i) => (i === 20 ? 0 : 4));
    // Two segments touch the stopped point, so their distance is not counted.
    const best = streamBestEfforts({ coords, speed });
    expect(best['1k']).toBeCloseTo(250, 0);
  });

  it('ignores GPS-glitch speeds', () => {
    const coords = line(41, 50);
    const speed = coords.map(() => 12); // 1:23/km
    expect(streamBestEfforts({ coords, speed })['1k']).toBeUndefined();
  });

  it('whole-run bests use average pace for runs at least the distance', () => {
    const best = wholeRunBests([
      { id: 'a', start_date: '2026-10-01', distance: 5200, moving_time: 1560 }, // 5:00/km
      { id: 'b', start_date: '2026-10-05', distance: 10500, moving_time: 3360 }, // 5:20/km
    ]);
    expect(best['5k']?.activityId).toBe('a');
    expect(best['5k']?.seconds).toBeCloseTo(1500, 5);
    expect(best['10k']?.activityId).toBe('b');
    expect(best.half).toBeUndefined();
  });

  it('merge keeps the faster result and says where it came from', () => {
    const coords = line(121, 50);
    const merged = mergeBests(
      [{ id: 'slow', start_date: '2026-10-01', distance: 6000, moving_time: 1800 }], // 5:00/km whole run
      [{ id: 'gps', start_date: '2026-10-02', distance: 6000, moving_time: 1500, activity_streams: { coords, speed: coords.map(() => 4) } }],
    );
    const fiveK = merged.find((m) => m.key === '5k');
    expect(fiveK?.source).toBe('stream');
    expect(fiveK?.activityId).toBe('gps');
    expect(merged.map((m) => m.key)).toEqual(['1k', '5k']);
  });
});
