import { describe, it, expect } from 'vitest';
import {
  toAthleteDesign,
  ftpAgeDaysFromSnapshots,
  bestsFromActivities,
  criticalPowerFromBests,
  ridesPerWeek,
  afiGrowth4dFromLoad,
} from './athleteDesignInputs.js';

const TODAY = '2026-09-07';

describe('ftpAgeDaysFromSnapshots', () => {
  it('measures the streak of weekly snapshots that carry the current FTP', () => {
    const snapshots = [
      { snapshot_week: '2026-08-31', ftp: 250 },
      { snapshot_week: '2026-08-24', ftp: 250 },
      { snapshot_week: '2026-08-17', ftp: 250 },
      { snapshot_week: '2026-08-10', ftp: 240 },
    ];
    expect(ftpAgeDaysFromSnapshots(250, snapshots, TODAY)).toBe(21);
  });

  it('reads a profile FTP the newest snapshot does not yet carry as freshly set', () => {
    const snapshots = [{ snapshot_week: '2026-08-31', ftp: 240 }];
    expect(ftpAgeDaysFromSnapshots(250, snapshots, TODAY)).toBeLessThanOrEqual(6);
  });

  it('is null, not zero, with no snapshots or no FTP', () => {
    expect(ftpAgeDaysFromSnapshots(250, [], TODAY)).toBeNull();
    expect(ftpAgeDaysFromSnapshots(null, [{ snapshot_week: '2026-08-31', ftp: 250 }], TODAY)).toBeNull();
  });
});

describe('bests and critical power', () => {
  const activities = [
    { start_date: '2026-09-01T10:00:00Z', sport_type: 'cycling', power_curve_summary: { '60s': 400, '300s': 310, '600s': 285, '1200s': 262 } },
    { start_date: '2026-08-20T10:00:00Z', sport_type: 'cycling', power_curve_summary: { '60s': 420, '300s': 300, '1200s': 268 } },
    // A run with running power must not count.
    { start_date: '2026-08-25T10:00:00Z', sport_type: 'running', type: 'Run', power_curve_summary: { '60s': 500, '300s': 450, '1200s': 400 } },
  ];

  it('takes the best at each duration from rides only', () => {
    expect(bestsFromActivities(activities)).toEqual({ p60: 420, p300: 310, p600: 285, p1200: 268 });
  });

  it('is null with no power', () => {
    expect(bestsFromActivities([{ start_date: '2026-09-01', sport_type: 'cycling', power_curve_summary: null }])).toBeNull();
  });

  it('fits CP and W′ from three or more points, and refuses implausible fits', () => {
    const cpw = criticalPowerFromBests({ p60: 420, p300: 310, p600: 285, p1200: 268 });
    expect(cpw.cp).toBeGreaterThan(240);
    expect(cpw.cp).toBeLessThan(275);
    expect(cpw.wPrime).toBeGreaterThan(5000);
    expect(criticalPowerFromBests({ p60: 420, p300: 310 })).toBeNull();
  });
});

describe('consistency and fatigue growth', () => {
  it('counts rides per week over the last 28 days', () => {
    const activities = Array.from({ length: 12 }, (_, i) => ({
      start_date: `2026-08-${String(10 + i).padStart(2, '0')}T10:00:00Z`, sport_type: 'cycling',
    }));
    expect(ridesPerWeek(activities, TODAY)).toBe(3);
  });

  it('computes four-day AFI growth from the load rows, null with too few', () => {
    const rows = [
      { date: '2026-09-07', afi: 90 }, { date: '2026-09-06', afi: 80 }, { date: '2026-09-05', afi: 70 },
      { date: '2026-09-04', afi: 65 }, { date: '2026-09-03', afi: 60 },
    ];
    expect(afiGrowth4dFromLoad(rows)).toBeCloseTo(0.5, 5);
    expect(afiGrowth4dFromLoad(rows.slice(0, 3))).toBeNull();
  });
});

describe('toAthleteDesign', () => {
  it('maps a full athlete, leaving what it cannot measure null', () => {
    const athlete = toAthleteDesign(
      {
        profile: { ftp: 250, weight_kg: 72, recovery_mode: 'conservative', birth_year: 1978 },
        snapshots: [{ snapshot_week: '2026-08-31', ftp: 250, estimated_ftp: 262, ftp_estimation_confidence: 'high' }],
        activities: [{ start_date: '2026-09-01T10:00:00Z', sport_type: 'cycling', power_curve_summary: { '300s': 318, '1200s': 268 } }],
        load: [{ date: '2026-09-07', tfi: 70, afi: 75, form_score: -5, fs_confidence: 'high' }],
      },
      { todayStr: TODAY, readinessCall: 'modify', pdShortTrend: 'behind', goalDurationMin: 300 },
    );
    expect(athlete.ftp).toBe(250);
    expect(athlete.ftpAgeDays).toBe(7);
    expect(athlete.estimatedFtp).toBe(262);
    expect(athlete.recoveryMode).toBe('conservative');
    expect(athlete.afiGrowthCeiling).toBeLessThanOrEqual(0.25);
    expect(athlete.bests.p300).toBe(318);
    expect(athlete.cp).toBeNull(); // two points is not a fit
    expect(athlete.afiGrowth4d).toBeNull();
    expect(athlete.formScore).toBe(-5);
    expect(athlete.readinessCall).toBe('modify');
    expect(athlete.pdShortTrend).toBe('behind');
    expect(athlete.goalDurationMin).toBe(300);
  });

  it('survives an empty fetch', () => {
    const athlete = toAthleteDesign(null, { todayStr: TODAY });
    expect(athlete.ftp).toBeNull();
    expect(athlete.bests).toBeNull();
    expect(athlete.ridesPerWeek4wk).toBeNull();
  });
});
