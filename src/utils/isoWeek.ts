/**
 * ISO-8601 week helpers for YYYY-MM-DD date keys.
 *
 * Built for weekly snapshot keys (Mondays), but correct for any date. All
 * math is in UTC — parsing the key with a 'T00:00:00Z' suffix and using UTC
 * accessors — so a browser in a negative-UTC-offset timezone can't shift a
 * Monday key back to Sunday (the bug the naive `new Date(str).getFullYear()`
 * + day-of-year/7 approach had).
 *
 * ISO rules: weeks start Monday; week 1 is the week containing the year's
 * first Thursday. A late-December Monday can belong to week 1 of the NEXT
 * ISO week-year, and an early-January date to week 52/53 of the previous
 * one — always pair getISOWeek with getISOWeekYear, never the calendar year.
 */

const DAY_MS = 86400000;

function parseUTC(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

/** Thursday of the ISO week containing the given date (UTC). */
function isoWeekThursday(date: Date): Date {
  const d = new Date(date.getTime());
  // getUTCDay(): Sun=0..Sat=6 → ISO Mon=1..Sun=7.
  const isoDay = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);
  return d;
}

/** ISO week number (1–53) for a YYYY-MM-DD date key. */
export function getISOWeek(dateKey: string): number {
  const thursday = isoWeekThursday(parseUTC(dateKey));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - jan1.getTime()) / DAY_MS + 1) / 7);
}

/** ISO week-year for a YYYY-MM-DD date key (may differ from calendar year). */
export function getISOWeekYear(dateKey: string): number {
  return isoWeekThursday(parseUTC(dateKey)).getUTCFullYear();
}
