/**
 * The athlete's age, from whichever of the three profile columns is set.
 *
 * Three, because the column was added twice before anyone noticed. This
 * mirrors `ageFromProfile` in api/utils/coachingBible.js — deliberately
 * duplicated rather than imported, because that module is serverless code
 * under api/ and is outside the Vite build's module graph. If the precedence
 * changes in one, change it in the other.
 *
 * Precedence:
 *   date_of_birth  exact, self-updating, three profiles have it. Preferred.
 *   birth_year     what capture writes now (migration 119). Nothing asks for a
 *                  birthday — only which side of 40 the athlete is on — and a
 *                  year answers that to within twelve months.
 *   metrics_age    a typed-in integer gating adaptive EWA tau (migration 066).
 *                  Last, because it is a SNAPSHOT that goes a year stale
 *                  annually — but read anyway, since it was set on five
 *                  profiles against date_of_birth's three.
 */

export type AgeSources = {
  date_of_birth?: string | null;
  birth_year?: number | null;
  metrics_age?: number | null;
};

/** Bounds from migration 066's CHECK constraint. */
const MIN_STATED_AGE = 13;
const MAX_STATED_AGE = 100;

/** Bounds from migration 119's CHECK constraint. */
const MIN_BIRTH_YEAR_STORED = 1900;
const MAX_BIRTH_YEAR_STORED = 2100;

export function ageFromProfile(
  profile: AgeSources | null | undefined,
  now: Date = new Date()
): number | null {
  const fromDob = ageFromDob(profile?.date_of_birth, now);
  if (fromDob != null) return fromDob;

  const fromYear = ageFromBirthYear(profile?.birth_year, now);
  if (fromYear != null) return fromYear;

  const stated = Number(profile?.metrics_age);
  if (Number.isInteger(stated) && stated >= MIN_STATED_AGE && stated <= MAX_STATED_AGE) {
    return stated;
  }

  return null;
}

/** Whole years between a YYYY-MM-DD birth date and `now`, or null. */
export function ageFromDob(
  dob: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(String(dob))) return null;
  const [y, m, d] = String(dob).slice(0, 10).split('-').map(Number);
  let age = now.getFullYear() - y;
  const beforeBirthday =
    now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/**
 * Age from a birth year. Reports the age the athlete reaches THIS year, which
 * is right for most of it and one year high for the rest — consistently rather
 * than randomly, and never low. Erring high on a masters gate starts the rules
 * a few months early; erring low withholds them from someone who qualifies,
 * which is the worse failure.
 */
export function ageFromBirthYear(
  birthYear: number | null | undefined,
  now: Date = new Date()
): number | null {
  const year = Number(birthYear);
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR_STORED || year > MAX_BIRTH_YEAR_STORED) {
    return null;
  }
  const age = now.getFullYear() - year;
  return age >= 0 && age < 120 ? age : null;
}

/** The columns any reader of `ageFromProfile` must SELECT. */
export const AGE_COLUMNS = 'date_of_birth, birth_year, metrics_age';

/** Widest birth year we will accept as input, from the stated-age bounds. */
export const minBirthYear = (now: Date = new Date()) =>
  now.getFullYear() - MAX_STATED_AGE;
export const maxBirthYear = (now: Date = new Date()) =>
  now.getFullYear() - MIN_STATED_AGE;

/**
 * The `user_profiles` columns to write for a stated birth year, or nulls to
 * clear every age the athlete has on file.
 *
 * `metrics_age` is derived rather than asked for: the adaptive-tau cron
 * (api/recompute-user-tau.js) selects on that column and nothing else, and
 * asking the same person their age AND their birth year in adjacent boxes is
 * how this table came to have three age columns. Re-deriving on every save
 * also refreshes an age that would otherwise sit a year stale.
 *
 * `date_of_birth` outranks `birth_year` everywhere it is read, so a year that
 * CONTRADICTS a stored date has to retire that date or the correction is
 * silently ignored. An agreeing year leaves it alone — the date is strictly
 * more precise and there is no reason to throw it away.
 */
export function ageColumnsForBirthYear(
  rawYear: unknown,
  storedDob: string | null | undefined = null,
  now: Date = new Date()
): { birth_year: number | null; metrics_age: number | null; date_of_birth?: null } {
  const year = Number(rawYear);
  const usable =
    Number.isInteger(year) && year >= minBirthYear(now) && year <= maxBirthYear(now);

  if (!usable) {
    return { birth_year: null, metrics_age: null, date_of_birth: null };
  }

  const columns: { birth_year: number; metrics_age: number; date_of_birth?: null } = {
    birth_year: year,
    metrics_age: now.getFullYear() - year,
  };
  if (storedDob && yearOfDob(storedDob) !== year) columns.date_of_birth = null;
  return columns;
}

/** The YYYY of a YYYY-MM-DD date string, or null. */
export function yearOfDob(dob: string | null | undefined): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(dob ?? ''));
  return m ? Number(m[1]) : null;
}
