import { describe, it, expect } from 'vitest';
import {
  normalizeIntervals,
  buildPrescription,
  withPrescription,
  readPrescription,
  PRESCRIPTION_VERSION,
} from './prescription.js';

const SET = { repeats: 5, duration_min: 4, target_pct_ftp_min: 110, target_pct_ftp_max: 120, recovery_min: 4 };

describe('normalizeIntervals', () => {
  it('passes a well-formed set through, rounded and trimmed', () => {
    const { intervals, errors } = normalizeIntervals([{ ...SET, notes: '  seated, 90 rpm ' }]);
    expect(errors).toEqual([]);
    expect(intervals).toEqual([{ ...SET, notes: 'seated, 90 rpm' }]);
  });

  it('treats absent and empty input as "no structure", not as an error', () => {
    expect(normalizeIntervals(undefined)).toEqual({ intervals: null, errors: [] });
    expect(normalizeIntervals(null)).toEqual({ intervals: null, errors: [] });
    expect(normalizeIntervals([])).toEqual({ intervals: null, errors: [] });
  });

  it('accepts the sequencer spelling and a single %FTP value', () => {
    const { intervals } = normalizeIntervals([
      { sets: 3, durationMin: 10, target_pct_ftp: 90, recovery_min: 5 },
    ]);
    expect(intervals).toEqual([
      { repeats: 3, duration_min: 10, target_pct_ftp_min: 90, target_pct_ftp_max: 90, recovery_min: 5 },
    ]);
  });

  it('rejects the WHOLE list when any set is unusable, with a specific error', () => {
    const { intervals, errors } = normalizeIntervals([SET, { ...SET, repeats: 0 }], 'op 2, intervals');
    expect(intervals).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/op 2, intervals\[2\]: repeats/);
  });

  it('rejects an inverted or absurd power band and a negative recovery', () => {
    expect(normalizeIntervals([{ ...SET, target_pct_ftp_min: 120, target_pct_ftp_max: 110 }]).errors[0]).toMatch(/band/);
    expect(normalizeIntervals([{ ...SET, target_pct_ftp_max: 400 }]).errors[0]).toMatch(/band/);
    expect(normalizeIntervals([{ ...SET, recovery_min: -1 }]).errors[0]).toMatch(/recovery_min/);
  });

  it('rejects a non-array', () => {
    expect(normalizeIntervals('5x4').intervals).toBeNull();
    expect(normalizeIntervals('5x4').errors[0]).toMatch(/array/);
  });
});

describe('buildPrescription', () => {
  it('stamps version, source and bookends', () => {
    const p = buildPrescription([SET], 'coach', { warmupMin: 15, cooldownMin: 10, rationale: ['SES-VO2-2: week 2'] });
    expect(p.version).toBe(PRESCRIPTION_VERSION);
    expect(p.source).toBe('coach');
    expect(p.warmup_min).toBe(15);
    expect(p.cooldown_min).toBe(10);
    expect(p.rationale).toEqual(['SES-VO2-2: week 2']);
    expect(typeof p.created_at).toBe('string');
  });

  it('returns null for nothing and refuses an unknown source', () => {
    expect(buildPrescription(null, 'coach')).toBeNull();
    expect(buildPrescription([], 'coach')).toBeNull();
    expect(() => buildPrescription([SET], 'robot')).toThrow(/source/);
  });
});

describe('withPrescription / readPrescription', () => {
  it('merges over existing details and removes cleanly', () => {
    const p = buildPrescription([SET], 'arc');
    const merged = withPrescription({ race_priority: 'A' }, p);
    expect(merged.race_priority).toBe('A');
    expect(readPrescription(merged).intervals).toEqual([SET]);

    const removed = withPrescription(merged, null);
    expect(removed).toEqual({ race_priority: 'A' });
    expect(readPrescription(removed)).toBeNull();
    expect(withPrescription(null, null)).toBeNull();
  });

  it('tolerates junk in details', () => {
    expect(readPrescription(null)).toBeNull();
    expect(readPrescription({ prescription: 'nope' })).toBeNull();
    expect(readPrescription({ prescription: { intervals: [] } })).toBeNull();
  });
});

describe('normalizeIntervals — pace bands for runs (multisport phase 3)', () => {
  const PACE = { repeats: 4, duration_min: 5, target_pct_threshold_pace_min: 95, target_pct_threshold_pace_max: 100, recovery_min: 2 };

  it('stores a run set as a %threshold-pace band and drops watts', () => {
    const { intervals, errors } = normalizeIntervals([{ ...PACE, target_watts_min: 200, target_watts_max: 220 }], 'intervals', 'running');
    expect(errors).toEqual([]);
    expect(intervals).toEqual([
      { repeats: 4, duration_min: 5, target_pct_threshold_pace_min: 95, target_pct_threshold_pace_max: 100, recovery_min: 2 },
    ]);
  });

  it('reads a pace-only set as a run when no sport is given', () => {
    expect(normalizeIntervals([PACE]).intervals[0]).toHaveProperty('target_pct_threshold_pace_min', 95);
  });

  it('rejects a pace band outside 70-150, or reversed', () => {
    expect(normalizeIntervals([{ ...PACE, target_pct_threshold_pace_max: 160 }], 'i', 'running').errors).toHaveLength(1);
    expect(normalizeIntervals([{ ...PACE, target_pct_threshold_pace_min: 110 }], 'i', 'running').errors).toHaveLength(1);
  });

  it('still requires %FTP on a ride', () => {
    expect(normalizeIntervals([PACE], 'i', 'cycling').errors.join(' ')).toMatch(/target_pct_ftp/);
  });

  it('records the basis on the stored prescription', () => {
    expect(buildPrescription(normalizeIntervals([PACE], 'i', 'running').intervals, 'coach').basis).toBe('pace');
    const ride = normalizeIntervals([{ repeats: 3, duration_min: 10, target_pct_ftp_min: 90, target_pct_ftp_max: 95, recovery_min: 5 }]);
    expect(buildPrescription(ride.intervals, 'coach').basis).toBe('power');
  });
});
