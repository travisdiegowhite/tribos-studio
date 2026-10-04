import { describe, it, expect } from 'vitest';
import {
  toOneHz,
  computeRideDurability,
  freshVsFatiguedDrop,
  latestDecoupling,
  BUCKET_KJ,
} from './durability.js';
import { toRiderState } from './toRiderState.js';
import { evaluateRules } from './rulesEngine.js';

const T0 = Date.parse('2026-09-20T08:00:00Z');

/** One FIT-style point per `step` seconds for `seconds`, from (t) => {power, hr}. */
function ride(seconds, fn, step = 1) {
  const pts = [];
  for (let t = 0; t < seconds; t += step) {
    const { power, hr } = fn(t);
    pts.push({ timestamp: new Date(T0 + t * 1000).toISOString(), power, heartRate: hr });
  }
  return pts;
}

describe('toOneHz', () => {
  it('expands smart-recording samples to one value per second', () => {
    const { power, hr } = toOneHz(ride(20, () => ({ power: 200, hr: 140 }), 4));
    expect(power).toHaveLength(17); // 5 samples: 4 × 4 s, the last one 1 s
    expect(new Set(power)).toEqual(new Set([200]));
    expect(hr.every((h) => h === 140)).toBe(true);
  });

  it('collapses a pause to one second instead of counting it as riding', () => {
    const pts = [
      { timestamp: new Date(T0).toISOString(), power: 200, heartRate: 140 },
      { timestamp: new Date(T0 + 1800 * 1000).toISOString(), power: 210, heartRate: 141 },
    ];
    expect(toOneHz(pts).power).toEqual([200, 210]);
  });

  it('treats a dropout as zero power and missing heart rate', () => {
    const { power, hr } = toOneHz([
      { timestamp: new Date(T0).toISOString(), power: null, heartRate: null },
    ]);
    expect(power).toEqual([0]);
    expect(hr).toEqual([null]);
  });
});

describe('computeRideDurability', () => {
  it('returns null for a ride with no power', () => {
    expect(computeRideDurability(ride(1200, () => ({ power: null, hr: 130 })))).toBeNull();
  });

  it('bins the best 5 minutes by work done before the effort started', () => {
    // 200 W steady for 2 h (1440 kJ), with a 5-min 350 W effort at minute 10
    // and a 5-min 300 W effort in the last 10 minutes.
    const d = computeRideDurability(
      ride(7200, (t) => {
        if (t >= 600 && t < 900) return { power: 350, hr: 170 };
        if (t >= 6600 && t < 6900) return { power: 300, hr: 168 };
        return { power: 200, hr: 140 };
      })
    );
    expect(d.version).toBe(1);
    expect(d.bucket_kj).toBe(BUCKET_KJ);
    const byBand = new Map(d.p300_by_prior_kj.map(([kj, w, hr]) => [kj, { w, hr }]));
    // 600 s × 200 W = 120 kJ before the fresh effort → the 100 kJ band.
    expect(byBand.get(100)).toEqual({ w: 350, hr: 170 });
    // ~1,365 kJ before the late one → the 1,300 kJ band.
    expect(byBand.get(1300)).toEqual({ w: 300, hr: 168 });
    expect(d.total_kj).toBe(1515); // 1,440 + 45 + 30
  });

  it('measures drift on a long steady ride', () => {
    // Power flat at 200 W; heart rate creeps from 130 to 145.
    const d = computeRideDurability(ride(3 * 3600, (t) => ({ power: 200, hr: 130 + (15 * t) / (3 * 3600) })));
    expect(d.decoupling.decoupling).toBeGreaterThan(0.05);
    expect(d.decoupling.decoupling).toBeLessThan(0.12);
  });

  it('does not read a ride with hard work at the end as a steady one', () => {
    const d = computeRideDurability(
      ride(3 * 3600, (t) => (t > 2.2 * 3600 ? { power: 280, hr: 165 } : { power: 190, hr: 135 }))
    );
    expect(d.decoupling).toBeNull();
  });

  it('needs two hours and heart rate for drift', () => {
    expect(computeRideDurability(ride(5400, () => ({ power: 200, hr: 140 }))).decoupling).toBeNull();
    expect(computeRideDurability(ride(9000, () => ({ power: 200, hr: null }))).decoupling).toBeNull();
  });
});

describe('freshVsFatiguedDrop', () => {
  // 70 kg: fresh is anything ending before 700 kJ, fatigued starts at 1,400 kJ.
  const block = (efforts) => ({ durability: { version: 1, bucket_kj: 100, p300_by_prior_kj: efforts } });

  it('compares the best fatigued effort with the best fresh one', () => {
    const rides = [block([[100, 330, 168], [1500, 280, 162]]), block([[0, 340, 170], [1800, 290, 165]])];
    expect(freshVsFatiguedDrop(rides, 70)).toBeCloseTo(1 - 290 / 340, 3);
  });

  it('ignores a late "best" the athlete was not trying on', () => {
    // 220 W at 128 bpm after 1,500 kJ is an easy ride, not a fade.
    const rides = [block([[0, 340, 170], [1500, 220, 128]])];
    expect(freshVsFatiguedDrop(rides, 70)).toBeNull();
  });

  it('leaves bands straddling either line out', () => {
    // 650–750 kJ crosses 10 kJ/kg; 1,300–1,400 sits below 20 kJ/kg.
    const rides = [block([[650, 400, 175], [100, 330, 168], [1300, 320, 170]])];
    expect(freshVsFatiguedDrop(rides, 70)).toBeNull();
  });

  it('is null without a weight, without heart rate, or without a late effort', () => {
    const rides = [block([[0, 340, 170], [1500, 290, 165]])];
    expect(freshVsFatiguedDrop(rides, null)).toBeNull();
    expect(freshVsFatiguedDrop([block([[0, 340, null], [1500, 290, 165]])], 70)).toBeNull();
    expect(freshVsFatiguedDrop([block([[0, 340, 170]])], 70)).toBeNull();
  });

  it('never reports a negative drop', () => {
    expect(freshVsFatiguedDrop([block([[0, 300, 170], [1500, 310, 172]])], 70)).toBe(0);
  });
});

describe('latestDecoupling', () => {
  const withDrift = (start_date, decoupling) => ({ start_date, durability: { decoupling: { decoupling } } });

  it('takes the most recent long steady ride in six weeks', () => {
    const rides = [withDrift('2026-09-01T08:00:00Z', 0.03), withDrift('2026-09-15T08:00:00Z', 0.08)];
    expect(latestDecoupling(rides, '2026-09-20')).toBe(0.08);
  });

  it('is null when the last one is older than six weeks', () => {
    expect(latestDecoupling([withDrift('2026-07-01T08:00:00Z', 0.08)], '2026-09-20')).toBeNull();
  });
});

describe('Phase 4 end to end: rides → RiderState → rules', () => {
  const gravelGoal = [{ race_date: '2026-11-15', race_type: 'gravel', priority: 'A', status: 'upcoming' }];
  const fader = {
    profile: { ftp: 260, weight_kg: 70 },
    coachSettings: { coaching_persona: 'pragmatist' },
    durabilityRides: [
      {
        start_date: '2026-09-13T08:00:00Z',
        type: 'Ride',
        durability: {
          version: 1,
          bucket_kj: 100,
          p300_by_prior_kj: [[100, 330, 170], [1500, 270, 166]],
          decoupling: { decoupling: 0.07 },
        },
      },
    ],
  };

  it('populates both fields and fires the durability rules for a gravel goal', () => {
    const state = toRiderState(fader, { raceGoals: gravelGoal, todayStr: '2026-09-20' });
    expect(state.freshVsFatiguedDrop5min).toBeCloseTo(1 - 270 / 330, 3);
    expect(state.longRideDecoupling).toBe(0.07);

    const ids = evaluateRules(state).fired.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['DUR-1-low', 'DUR-2-decoupling', 'DUR-3-prescribe']));
    expect(ids).not.toContain('DUR-4-no-ftp-inference');
  });

  it('ignores durability blocks from runs', () => {
    const runner = { ...fader, durabilityRides: fader.durabilityRides.map((r) => ({ ...r, type: 'Run' })) };
    const state = toRiderState(runner, { raceGoals: gravelGoal, todayStr: '2026-09-20' });
    expect(state.freshVsFatiguedDrop5min).toBeNull();
    expect(state.longRideDecoupling).toBeNull();
  });
});
