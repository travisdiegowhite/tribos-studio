import { describe, it, expect } from 'vitest';
import {
  ageFromProfile,
  ageFromDob,
  ageFromBirthYear,
  ageColumnsForBirthYear,
  yearOfDob,
  minBirthYear,
  maxBirthYear,
} from '../athleteAge';

// Local-time construction: these helpers deliberately use local calendar
// fields, so a UTC-midnight literal would drift a day west of Greenwich.
const NOW = new Date(2026, 8, 1, 12, 0, 0); // 2026-09-01 local

describe('ageFromDob', () => {
  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageFromDob('1974-08-31', NOW)).toBe(52);
    expect(ageFromDob('1974-09-01', NOW)).toBe(52);
    expect(ageFromDob('1974-09-02', NOW)).toBe(51);
  });

  it('is null for missing or malformed dates', () => {
    expect(ageFromDob(null, NOW)).toBeNull();
    expect(ageFromDob(undefined, NOW)).toBeNull();
    expect(ageFromDob('', NOW)).toBeNull();
    expect(ageFromDob('not-a-date', NOW)).toBeNull();
    expect(ageFromDob('1974-08', NOW)).toBeNull();
  });
});

describe('ageFromBirthYear', () => {
  it('reports the age reached this year', () => {
    expect(ageFromBirthYear(1974, NOW)).toBe(52);
  });

  it('rejects anything that is not a plausible stored year', () => {
    expect(ageFromBirthYear(null, NOW)).toBeNull();
    expect(ageFromBirthYear(1899, NOW)).toBeNull();
    expect(ageFromBirthYear(2101, NOW)).toBeNull();
    expect(ageFromBirthYear(1974.5, NOW)).toBeNull();
    expect(ageFromBirthYear(2030, NOW)).toBeNull(); // future: no negative ages
  });
});

describe('ageFromProfile', () => {
  it('is null when the athlete answered none of the three', () => {
    expect(ageFromProfile(null, NOW)).toBeNull();
    expect(ageFromProfile({}, NOW)).toBeNull();
  });

  it('prefers the exact date, then the year, then the stated age', () => {
    // The date says 51 (birthday not reached); the year alone would say 52.
    expect(
      ageFromProfile({ date_of_birth: '1974-09-02', birth_year: 1974, metrics_age: 30 }, NOW)
    ).toBe(51);
    expect(ageFromProfile({ birth_year: 1974, metrics_age: 30 }, NOW)).toBe(52);
    expect(ageFromProfile({ metrics_age: 44 }, NOW)).toBe(44);
  });

  it('falls past a source that is present but unusable', () => {
    expect(ageFromProfile({ date_of_birth: 'not-a-date', birth_year: 1986 }, NOW)).toBe(40);
    expect(ageFromProfile({ birth_year: 0, metrics_age: 44 }, NOW)).toBe(44);
  });

  it('holds metrics_age to migration 066 bounds rather than passing junk through', () => {
    expect(ageFromProfile({ metrics_age: 12 }, NOW)).toBeNull();
    expect(ageFromProfile({ metrics_age: 101 }, NOW)).toBeNull();
  });

  it('answers the masters gate the rules actually ask', () => {
    // MST-2/3/4 all gate on age >= 40; this is the only question ever asked.
    expect((ageFromProfile({ birth_year: 1986 }, NOW) ?? 0) >= 40).toBe(true);
    expect((ageFromProfile({ birth_year: 1987 }, NOW) ?? 0) >= 40).toBe(false);
  });

  it('agrees with the server-side copy in api/utils/coachingBible.js', () => {
    // Not an import — that module is serverless code outside the Vite graph.
    // This is the reminder that the two must not drift.
    const cases: { date_of_birth?: string; birth_year?: number; metrics_age?: number }[] = [
      { date_of_birth: '1974-09-02' },
      { birth_year: 1974 },
      { metrics_age: 44 },
      { date_of_birth: '1980-01-01', birth_year: 1990, metrics_age: 20 },
    ];
    expect(cases.map((c) => ageFromProfile(c, NOW))).toEqual([51, 52, 44, 46]);
  });
});

describe('ageColumnsForBirthYear', () => {
  it('writes the year and derives metrics_age for the tau cron', () => {
    expect(ageColumnsForBirthYear(1984, null, NOW)).toEqual({
      birth_year: 1984,
      metrics_age: 42,
    });
  });

  it('leaves an AGREEING date_of_birth alone — it is strictly more precise', () => {
    expect(ageColumnsForBirthYear(1984, '1984-06-15', NOW)).toEqual({
      birth_year: 1984,
      metrics_age: 42,
    });
  });

  it('retires a CONTRADICTING date_of_birth, which would otherwise outrank it', () => {
    // Without this the correction is silently ignored: ageFromProfile reads
    // date_of_birth first, so the athlete would keep seeing the old age.
    expect(ageColumnsForBirthYear(1984, '1979-06-15', NOW)).toEqual({
      birth_year: 1984,
      metrics_age: 42,
      date_of_birth: null,
    });
  });

  it('clears every age column when the year is cleared or unusable', () => {
    const cleared = { birth_year: null, metrics_age: null, date_of_birth: null };
    expect(ageColumnsForBirthYear(null, '1979-06-15', NOW)).toEqual(cleared);
    expect(ageColumnsForBirthYear('', null, NOW)).toEqual(cleared);
    expect(ageColumnsForBirthYear(1800, null, NOW)).toEqual(cleared);
    expect(ageColumnsForBirthYear(NOW.getFullYear(), null, NOW)).toEqual(cleared);
  });

  it('accepts exactly the range the inputs offer', () => {
    expect(ageColumnsForBirthYear(minBirthYear(NOW), null, NOW).birth_year).toBe(1926);
    expect(ageColumnsForBirthYear(maxBirthYear(NOW), null, NOW).birth_year).toBe(2013);
    expect(ageColumnsForBirthYear(minBirthYear(NOW) - 1, null, NOW).birth_year).toBeNull();
    expect(ageColumnsForBirthYear(maxBirthYear(NOW) + 1, null, NOW).birth_year).toBeNull();
  });

  it('round-trips: a saved year reads back as the same age', () => {
    const written = ageColumnsForBirthYear(1984, null, NOW);
    expect(ageFromProfile(written, NOW)).toBe(written.metrics_age);
  });
});

describe('yearOfDob', () => {
  it('extracts the year, or null', () => {
    expect(yearOfDob('1984-06-15')).toBe(1984);
    expect(yearOfDob('1984-06-15T00:00:00Z')).toBe(1984);
    expect(yearOfDob(null)).toBeNull();
    expect(yearOfDob('1984')).toBeNull();
  });
});
