/**
 * sportCopy — the words and units a training surface uses for a session or
 * activity, by sport.
 *
 * The training screens were written for rides and then asked to show runs:
 * the review found 60+ places that said "ride", "Ridden", "ride stress",
 * "%FTP" or drew a bike for a run. Every surface now gets its nouns here so a
 * run reads as a run, gym work as a session, and an activity of unknown sport
 * as an activity.
 */

export type Sport = 'cycling' | 'running' | 'multi' | 'other';

/** Coerce the many spellings (entry sport, activity sport, 'Run', 'ride') to one of four. */
export function normalizeSport(value: string | null | undefined): Sport | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === 'cycling' || v === 'ride' || v === 'bike' || v.includes('cycl') || v.includes('ride') || v.includes('biking')) {
    return 'cycling';
  }
  if (v === 'running' || v === 'run' || v.includes('run')) return 'running';
  if (v === 'multi' || v === 'triathlon' || v === 'duathlon') return 'multi';
  return 'other';
}

/** "ride" / "run" / "session" — what one of these is called. */
export function sportNoun(sport: string | null | undefined, opts: { plural?: boolean; capital?: boolean } = {}): string {
  const s = normalizeSport(sport);
  const base = s === 'cycling' ? 'ride' : s === 'running' ? 'run' : 'session';
  const word = opts.plural ? `${base}s` : base;
  return opts.capital ? word[0].toUpperCase() + word.slice(1) : word;
}

/** The noun for a list that mixes sports: "rides", "runs", or "activities". */
export function activityNoun(sports: Iterable<string | null | undefined>, opts: { capital?: boolean } = {}): string {
  const set = new Set<Sport | null>();
  for (const s of sports) set.add(normalizeSport(s));
  set.delete(null);
  const only = set.size === 1 ? [...set][0] : null;
  const word = only === 'cycling' ? 'rides' : only === 'running' ? 'runs' : 'activities';
  return opts.capital ? word[0].toUpperCase() + word.slice(1) : word;
}

/** The completion word on a done session: "Ridden", "Run", "Done". */
export function doneLabel(sport: string | null | undefined): string {
  const s = normalizeSport(sport);
  return s === 'cycling' ? 'Ridden' : s === 'running' ? 'Run' : 'Done';
}

/** Whether watts, %FTP and power zones mean anything for this sport. */
export function usesPower(sport: string | null | undefined): boolean {
  return normalizeSport(sport) === 'cycling';
}

/** The threshold an intensity is measured against: "FTP" or "threshold pace". */
export function thresholdName(sport: string | null | undefined): string {
  return normalizeSport(sport) === 'running' ? 'threshold pace' : 'FTP';
}

/**
 * The load metric's name on a session. RSS is sport-neutral (rides score
 * from power, runs from pace or heart rate), so the label is too.
 */
export const LOAD_LABEL = 'Stress';
export const LOAD_UNIT = 'RSS';

/** Tabler icon name for a sport, for surfaces that pick an icon by name. */
export function sportIconName(sport: string | null | undefined): 'bike' | 'run' | 'barbell' | 'activity' {
  const s = normalizeSport(sport);
  if (s === 'cycling') return 'bike';
  if (s === 'running') return 'run';
  if (s === 'other') return 'barbell';
  return 'activity';
}
