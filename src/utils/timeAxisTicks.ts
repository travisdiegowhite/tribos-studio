/**
 * Category-axis tick selection for long-range time charts.
 *
 * Recharts category axes need ticks that are actual data values, so this
 * picks a readable subset of the series' own YYYY-MM-DD keys: yearly ticks
 * for multi-year spans, quarterly for 1–3 years, monthly within a year.
 *
 * All grouping and labeling is done by string slicing — never `new Date(key)`,
 * which parses as UTC midnight and can shift the label a day/month in
 * negative-offset timezones (see src/utils/dateUtils.js).
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface TimeTicks {
  /** Subset of the input keys to render as ticks (pass to XAxis `ticks`). */
  ticks: string[];
  /** Label for a tick key (pass to XAxis `tickFormatter`). */
  format: (key: string) => string;
}

function monthLabel(key: string, withYear: boolean): string {
  const month = MONTHS[Number(key.slice(5, 7)) - 1] ?? '';
  return withYear ? `${month} '${key.slice(2, 4)}` : month;
}

/** First key of each group, in input order. `groupOf` maps key → group id. */
function firstOfEachGroup(keys: string[], groupOf: (key: string) => string): string[] {
  const ticks: string[] = [];
  let prevGroup: string | null = null;
  for (const key of keys) {
    const group = groupOf(key);
    if (group !== prevGroup) {
      ticks.push(key);
      prevGroup = group;
    }
  }
  return ticks;
}

/**
 * Pick ticks + labels for ascending YYYY-MM-DD category keys.
 * Span > 3 years → yearly ("2014"); 1–3 years → quarterly ("Jan '25");
 * ≤ 1 year → monthly ("Feb", with "Jan '26" at year starts).
 */
export function selectTimeTicks(dateKeys: string[]): TimeTicks {
  if (!dateKeys || dateKeys.length === 0) {
    return { ticks: [], format: () => '' };
  }

  const first = dateKeys[0];
  const last = dateKeys[dateKeys.length - 1];
  const spanMonths =
    (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 +
    (Number(last.slice(5, 7)) - Number(first.slice(5, 7)));

  let ticks: string[];
  let label: (key: string) => string;

  if (spanMonths > 36) {
    ticks = firstOfEachGroup(dateKeys, (key) => key.slice(0, 4));
    label = (key) => key.slice(0, 4);
  } else if (spanMonths > 12) {
    ticks = firstOfEachGroup(
      dateKeys,
      (key) => `${key.slice(0, 4)}-q${Math.floor((Number(key.slice(5, 7)) - 1) / 3)}`,
    );
    label = (key) => monthLabel(key, true);
  } else {
    ticks = firstOfEachGroup(dateKeys, (key) => key.slice(0, 7));
    label = (key) => monthLabel(key, key.slice(5, 7) === '01');
  }

  const labels = new Map(ticks.map((key) => [key, label(key)]));
  return { ticks, format: (key) => labels.get(key) ?? '' };
}
