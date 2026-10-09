/**
 * Season planning engine — pure, deterministic, no AI.
 *
 * Input: a plan start date, a week count, the athlete's races and a typical
 * weekly-hours number. Output: a phase per week, target hours per week, and a
 * verdict (On track / Tight / Conflict) with a one-sentence reason per race.
 *
 * Rules of the module (see docs/season-planner-build-plan.md):
 *   - No Supabase, React or network imports. The browser runs it on every
 *     move; the server imports the same file for saves and coach payloads.
 *   - The engine owns all dates and week math. Dates are plain calendar
 *     dates ('YYYY-MM-DD'); week math is done on integer day numbers, so no
 *     timezone can shift a race by a day. The caller passes "today" as a
 *     local date string when it needs the today line.
 *   - Every tunable rule is a named constant directly below.
 *   - Sport-agnostic: a run, a ride and a multisport race of the same
 *     priority are judged by the same rules. `sport` is carried through for
 *     display and for the coach.
 *
 * How A races are grouped:
 *   - A races at most A_BLOCK_MAX_GAP_WEEKS apart form one BLOCK that shares a
 *     single build. One race in the block is its FOCUS (the most important);
 *     the build, peak and taper aim at it. By default the focus is the last
 *     race (the earlier ones are springboards) and `focusConfirmed` is false
 *     so the UI can ask the athlete which one matters more.
 *   - A block that follows another block is a FOLLOW-ON. Its verdict comes from
 *     the gap since the previous block, not from a full build: A races 4+
 *     weeks apart are normal in a real season.
 *   - Races on the same date form one event day (e.g. a run/bike combo
 *     entered as two races); the lower-priority one rides along.
 *
 * Phase vocabulary here (Recover/Base/Build/Peak/Taper) is display-only. The
 * day-level phase on Today still comes from the arc's blocks
 * (api/utils/sequencerPlanner.js); this module does not feed them yet.
 */

// ─── Tunable rules ──────────────────────────────────────────────────────────

/** Default season length in weeks. */
export const SEASON_WEEKS = 52;
/** The first weeks of every season are Recover. They also clip the first block's build. */
export const SEASON_START_RECOVER_WEEKS = 4;
/** Taper covers the focus race's week and the week before it (w-1, w). */
export const TAPER_WEEKS = 2;
/** Peak sits directly before the taper (w-3, w-2). */
export const PEAK_WEEKS = 2;
/** A full build sits directly before the peak (w-9 … w-4). */
export const FULL_BUILD_WEEKS = 6;
/** Recover after the last race of a block (w+1, w+2). */
export const RECOVER_WEEKS_AFTER_A = 2;
/** First block of the season: at least this many build weeks (but less than full) is Tight; fewer is a Conflict. */
export const MIN_TIGHT_BUILD_WEEKS = 3;
/** A races this many weeks apart (or fewer) share one block and one build. */
export const A_BLOCK_MAX_GAP_WEEKS = 2;
/** A follow-on block this many weeks (or more) after the previous one is On track; closer is Tight. */
export const FOLLOW_ON_ON_TRACK_GAP_WEEKS = 4;
/** A B/C race this many weeks (or fewer) before or after an A race interacts with it. */
export const NEAR_A_RACE_WEEKS = 2;

/**
 * When phases overlap, the higher rank wins. Recover outranks Peak so that,
 * between closely spaced A races, the weeks after a race go to recovery
 * before any sharpening.
 */
export const PHASE_PRECEDENCE: Record<Phase, number> = {
  taper: 5,
  recover: 4,
  peak: 3,
  build: 2,
  base: 1,
};

/** Weekly hours = typical weekly hours × this multiplier. */
export const PHASE_HOURS_MULTIPLIER: Record<Phase, number> = {
  recover: 0.55,
  base: 1.0,
  build: 1.35,
  peak: 1.25,
  taper: 0.75,
};

/** How many recent weeks of history feed the typical-hours median. */
export const TYPICAL_HOURS_LOOKBACK_WEEKS = 8;

// ─── Types ──────────────────────────────────────────────────────────────────

export type Priority = 'A' | 'B' | 'C';
export type Phase = 'recover' | 'base' | 'build' | 'peak' | 'taper';
export type Verdict = 'on_track' | 'tight' | 'conflict';
export type Sport = 'bike' | 'run' | 'multi';

export interface SeasonRaceInput {
  id: string;
  name: string;
  /** Plain calendar date, 'YYYY-MM-DD'. */
  date: string;
  /** Anything not A/B/C is treated as B (the race_goals default). */
  priority: string | null | undefined;
  /** Defaults to 'bike'. Does not change any rule. */
  sport?: Sport | null;
  /** The athlete marked this A race as the most important one in its block. */
  focus?: boolean | null;
}

export interface SeasonInput {
  /** Plain calendar date; snapped back to its Monday if it is not one. */
  startDate: string;
  weeks?: number;
  races: SeasonRaceInput[];
  /** The athlete's typical weekly hours (see typicalWeeklyHours). */
  typicalWeeklyHours: number;
}

export interface SeasonWeek {
  /** 0-based week index. */
  index: number;
  /** Monday of the week, 'YYYY-MM-DD'. */
  startDate: string;
  phase: Phase;
  targetHours: number;
}

export interface SeasonRaceResult {
  id: string;
  name: string;
  date: string;
  priority: Priority;
  sport: Sport;
  /** Week index, or null when the race is outside the season. */
  week: number | null;
  verdict: Verdict;
  reason: string;
  /** A races only: build weeks available before the block's peak. */
  buildWeeks: number | null;
  /** Weeks between this race and the related race (positive = related race is later). */
  gapWeeks: number | null;
  relatedRaceId: string | null;
  /** A races only: the id of the block's focus race (its own id if it is the focus). */
  blockFocusId: string | null;
  /** A races only: whether the block's focus was chosen by the athlete (false = defaulted, ask them). */
  focusConfirmed: boolean | null;
}

export interface SeasonPlan {
  startDate: string;
  weeks: number;
  typicalWeeklyHours: number;
  schedule: SeasonWeek[];
  /** Sorted by date, then name. */
  races: SeasonRaceResult[];
}

export interface PlanDiff {
  changed: { raceId: string; name: string; fromDate: string; toDate: string; weeks: number }[];
  added: { raceId: string; name: string; date: string; priority: Priority }[];
  removed: { raceId: string; name: string; date: string; priority: Priority }[];
  priorityChanges: { raceId: string; name: string; from: Priority; to: Priority }[];
  buildChanges: { raceId: string; name: string; fromWeeks: number; toWeeks: number }[];
  verdictChanges: { raceId: string; name: string; from: Verdict; to: Verdict; reason: string }[];
}

// ─── Plain-date arithmetic ──────────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 for a plain date. Throws on a malformed date. */
export function dayNumber(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`season engine: expected YYYY-MM-DD, got "${date}"`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new Error(`season engine: invalid date "${date}"`);
  }
  return Math.round(ms / MS_PER_DAY);
}

/** Plain date for a day number. */
export function dateFromDayNumber(n: number): string {
  const dt = new Date(n * MS_PER_DAY);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** Shift a plain date by whole days. */
export function addDaysToDate(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + days);
}

/** Monday on or before the given plain date. 1970-01-05 (day 4) was a Monday. */
export function mondayOf(date: string): string {
  const n = dayNumber(date);
  const offset = (((n - 4) % 7) + 7) % 7;
  return dateFromDayNumber(n - offset);
}

/** 0-based week index of `date` in a season starting on the Monday `seasonStart`. May be negative or ≥ weeks. */
export function weekIndexOf(seasonStart: string, date: string): number {
  return Math.floor((dayNumber(date) - dayNumber(seasonStart)) / 7);
}

/**
 * Format a plain date for display (and for the coach payload), e.g.
 * "Sat, Jun 19, 2027". Formats in UTC because the input is a plain date, so
 * the weekday never depends on where the code runs.
 */
export function formatSeasonDate(date: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dayNumber(date) * MS_PER_DAY));
}

// ─── Typical weekly hours ───────────────────────────────────────────────────

/**
 * Median of the most recent weeks of history (newest last), ignoring missing
 * and zero weeks. Falls back to the athlete-entered number when there is no
 * history.
 */
export function typicalWeeklyHours(history: (number | null | undefined)[], fallback: number): number {
  const recent = history
    .slice(-TYPICAL_HOURS_LOOKBACK_WEEKS)
    .filter((h): h is number => typeof h === 'number' && Number.isFinite(h) && h > 0)
    .sort((a, b) => a - b);
  if (recent.length === 0) return fallback;
  const mid = Math.floor(recent.length / 2);
  const median = recent.length % 2 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
  return round1(median);
}

// ─── Engine ─────────────────────────────────────────────────────────────────

const VERDICT_RANK: Record<Verdict, number> = { on_track: 0, tight: 1, conflict: 2 };

interface PlacedRace {
  id: string;
  name: string;
  date: string;
  priority: Priority;
  sport: Sport;
  focus: boolean;
  week: number;
  inWindow: boolean;
}

interface Block {
  races: PlacedRace[];
  focus: PlacedRace;
  focusConfirmed: boolean;
  firstWeek: number;
  lastWeek: number;
  buildWeeks: number;
  previous: Block | null;
}

interface Candidate {
  verdict: Verdict;
  reason: string;
  gapWeeks: number | null;
  relatedRaceId: string | null;
}

export function computeSeason(input: SeasonInput): SeasonPlan {
  const weeks = input.weeks ?? SEASON_WEEKS;
  const startDate = mondayOf(input.startDate);

  const placed: PlacedRace[] = input.races
    .map((r) => {
      const week = weekIndexOf(startDate, r.date);
      return {
        id: r.id,
        name: r.name,
        date: r.date,
        priority: normalizePriority(r.priority),
        sport: r.sport ?? 'bike',
        focus: r.focus === true,
        week,
        inWindow: week >= 0 && week < weeks,
      };
    })
    .sort((a, b) => dayNumber(a.date) - dayNumber(b.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const aRaces = placed.filter((r) => r.priority === 'A' && r.inWindow);
  const blocks = groupBlocks(aRaces);

  // Phases: every week starts as Base; higher-precedence assignments win.
  const phases: Phase[] = Array.from({ length: weeks }, () => 'base');
  const assign = (from: number, to: number, phase: Phase) => {
    for (let w = Math.max(0, from); w <= Math.min(weeks - 1, to); w++) {
      if (PHASE_PRECEDENCE[phase] > PHASE_PRECEDENCE[phases[w]]) phases[w] = phase;
    }
  };

  assign(0, SEASON_START_RECOVER_WEEKS - 1, 'recover');

  for (const block of blocks) {
    const wf = block.focus.week;
    const taperStart = wf - TAPER_WEEKS + 1;
    const peakStart = taperStart - PEAK_WEEKS;
    const buildEnd = peakStart - 1;
    const fullBuildStart = buildEnd - FULL_BUILD_WEEKS + 1;
    const previousFloor = block.previous ? block.previous.lastWeek + RECOVER_WEEKS_AFTER_A + 1 : -Infinity;
    const buildStart = Math.max(fullBuildStart, SEASON_START_RECOVER_WEEKS, previousFloor);
    block.buildWeeks = Math.max(0, buildEnd - buildStart + 1);

    assign(buildStart, buildEnd, 'build');
    assign(peakStart, taperStart - 1, 'peak');
    assign(taperStart, wf, 'taper');
    // Every week from the block's first race to its last is a race week.
    assign(block.firstWeek, block.lastWeek, 'taper');
    assign(block.lastWeek + 1, block.lastWeek + RECOVER_WEEKS_AFTER_A, 'recover');
  }

  const blockOf = new Map<string, Block>();
  for (const block of blocks) for (const r of block.races) blockOf.set(r.id, block);

  const races: SeasonRaceResult[] = placed.map((r) => {
    const block = blockOf.get(r.id) ?? null;
    const c = !r.inWindow
      ? outOfWindow(r)
      : block
        ? judgeBlockRace(r, block)
        : judgeSupportRace(r, placed, aRaces, phases);
    return {
      id: r.id,
      name: r.name,
      date: r.date,
      priority: r.priority,
      sport: r.sport,
      week: r.inWindow ? r.week : null,
      verdict: c.verdict,
      reason: c.reason,
      buildWeeks: block ? block.buildWeeks : null,
      gapWeeks: c.gapWeeks,
      relatedRaceId: c.relatedRaceId,
      blockFocusId: block ? block.focus.id : null,
      focusConfirmed: block ? block.focusConfirmed : null,
    };
  });

  const schedule: SeasonWeek[] = phases.map((phase, index) => ({
    index,
    startDate: addDaysToDate(startDate, index * 7),
    phase,
    targetHours: round1(input.typicalWeeklyHours * PHASE_HOURS_MULTIPLIER[phase]),
  }));

  return { startDate, weeks, typicalWeeklyHours: input.typicalWeeklyHours, schedule, races };
}

/** Group date-sorted, in-window A races into blocks and pick each block's focus. */
function groupBlocks(aRaces: PlacedRace[]): Block[] {
  const groups: PlacedRace[][] = [];
  for (const a of aRaces) {
    const current = groups[groups.length - 1];
    if (current && a.week - current[current.length - 1].week <= A_BLOCK_MAX_GAP_WEEKS) current.push(a);
    else groups.push([a]);
  }
  let previous: Block | null = null;
  return groups.map((races) => {
    const chosen = races.find((r) => r.focus);
    const block: Block = {
      races,
      // Default focus: the last race; the earlier ones are springboards into it.
      focus: chosen ?? races[races.length - 1],
      focusConfirmed: races.length === 1 || Boolean(chosen),
      firstWeek: races[0].week,
      lastWeek: races[races.length - 1].week,
      buildWeeks: 0,
      previous,
    };
    previous = block;
    return block;
  });
}

function outOfWindow(r: PlacedRace): Candidate {
  return {
    verdict: 'conflict',
    reason: `${r.name} falls outside this season, so it can't be planned for.`,
    gapWeeks: null,
    relatedRaceId: null,
  };
}

/** Readiness of a block, judged on its focus race. */
function judgeFocus(block: Block): Candidate {
  const f = block.focus;
  const prev = block.previous;
  if (prev) {
    const gap = block.firstWeek - prev.lastWeek;
    const prevName = prev.focus.name;
    const base = { gapWeeks: -gap, relatedRaceId: prev.focus.id };
    if (gap < FOLLOW_ON_ON_TRACK_GAP_WEEKS) {
      return {
        ...base,
        verdict: 'tight',
        reason: `${f.name} is only ${gap} weeks after ${prevName}: time to recover and sharpen, not to rebuild.`,
      };
    }
    if (block.buildWeeks >= FULL_BUILD_WEEKS) {
      return { ...base, verdict: 'on_track', reason: `A full ${FULL_BUILD_WEEKS}-week build leads into ${f.name}.` };
    }
    const rebuild = block.buildWeeks > 0 ? `, with a ${block.buildWeeks}-week rebuild` : '';
    return {
      ...base,
      verdict: 'on_track',
      reason: `${f.name} is ${gap} weeks after ${prevName}: recover, then carry that form into it${rebuild}.`,
    };
  }

  if (block.buildWeeks >= FULL_BUILD_WEEKS) {
    return {
      verdict: 'on_track',
      reason: `A full ${FULL_BUILD_WEEKS}-week build leads into ${f.name}.`,
      gapWeeks: null,
      relatedRaceId: null,
    };
  }
  const weeksText = block.buildWeeks === 1 ? '1 build week' : `${block.buildWeeks} build weeks`;
  if (block.buildWeeks >= MIN_TIGHT_BUILD_WEEKS) {
    return {
      verdict: 'tight',
      reason: `Only ${weeksText} before ${f.name} because the season starts too close to it.`,
      gapWeeks: null,
      relatedRaceId: null,
    };
  }
  return {
    verdict: 'conflict',
    reason:
      block.buildWeeks === 0
        ? `No room to build for ${f.name} because the season starts too close to it.`
        : `Only ${weeksText} before ${f.name} because the season starts too close to it; that's not enough to arrive ready.`,
    gapWeeks: null,
    relatedRaceId: null,
  };
}

function judgeBlockRace(r: PlacedRace, block: Block): Candidate {
  const focusVerdict = judgeFocus(block);
  if (r.id === block.focus.id) return focusVerdict;

  // A second A race in the block: it shares the focus race's readiness.
  const gap = block.focus.week - r.week;
  const when = Math.abs(gap) === 1 ? '1 week' : `${Math.abs(gap)} weeks`;
  const role =
    gap > 0
      ? `A springboard into ${block.focus.name}, ${when} later`
      : gap < 0
        ? `Rides the form from ${block.focus.name}, ${when} earlier`
        : `Shares race week with ${block.focus.name}`;
  const ask = block.focusConfirmed ? '' : ` Confirm which race matters more.`;
  return {
    verdict: focusVerdict.verdict,
    reason:
      focusVerdict.verdict === 'on_track'
        ? `${role}; one build covers both.${ask}`
        : `${role}. ${focusVerdict.reason}${ask}`,
    gapWeeks: gap,
    relatedRaceId: block.focus.id,
  };
}

function judgeSupportRace(r: PlacedRace, placed: PlacedRace[], aRaces: PlacedRace[], phases: Phase[]): Candidate {
  // Same date as a higher-priority race: one event day (e.g. a run/bike combo).
  const host = placed.find((o) => o.id !== r.id && o.inWindow && o.date === r.date && rankOf(o) > rankOf(r));
  if (host) {
    return {
      verdict: 'on_track',
      reason: `Part of the same event day as ${host.name}.`,
      gapWeeks: 0,
      relatedRaceId: host.id,
    };
  }

  let worst: Candidate | null = null;
  const consider = (c: Candidate) => {
    if (!worst || VERDICT_RANK[c.verdict] > VERDICT_RANK[worst.verdict]) worst = c;
  };

  for (const a of aRaces) {
    const gap = a.week - r.week; // positive: the A race comes later
    if (gap === 0) {
      consider({
        verdict: 'conflict',
        reason: `${r.name} is in the same week as ${a.name}, your A race.`,
        gapWeeks: 0,
        relatedRaceId: a.id,
      });
    } else if (gap > 0 && gap <= NEAR_A_RACE_WEEKS) {
      const when = gap === 1 ? '1 week' : `${gap} weeks`;
      consider(
        r.priority === 'B'
          ? {
              verdict: 'conflict',
              reason: `${r.name} lands in the taper for ${a.name}, ${when} later.`,
              gapWeeks: gap,
              relatedRaceId: a.id,
            }
          : {
              verdict: 'tight',
              reason: `${r.name} lands in the taper for ${a.name}, ${when} later; ride it easy.`,
              gapWeeks: gap,
              relatedRaceId: a.id,
            },
      );
    } else if (gap < 0 && -gap <= NEAR_A_RACE_WEEKS) {
      const when = gap === -1 ? '1 week' : `${-gap} weeks`;
      consider({
        verdict: 'tight',
        reason: `${r.name} comes ${when} after ${a.name}, while you're still recovering.`,
        gapWeeks: gap,
        relatedRaceId: a.id,
      });
    }
  }
  if (worst) return worst;

  const next = aRaces.find((a) => a.week > r.week) ?? null;
  const phase = phases[r.week];
  const reason =
    phase === 'build' && next
      ? `A mid-build tune-up for ${next.name}.`
      : phase === 'peak' && next
        ? `A sharpener during the peak for ${next.name}.`
        : phase === 'recover'
          ? `Falls in an easy recovery stretch; race it for fun.`
          : `Falls in base training; a good fitness check.`;
  return { verdict: 'on_track', reason, gapWeeks: next ? next.week - r.week : null, relatedRaceId: next?.id ?? null };
}

// ─── Diff ───────────────────────────────────────────────────────────────────

/**
 * What changed between two computed plans, for the coach payload. Dates are
 * pre-formatted with `formatDate` so the coach never computes one.
 */
export function diffPlans(
  before: SeasonPlan,
  after: SeasonPlan,
  formatDate: (date: string) => string = (d) => formatSeasonDate(d),
): PlanDiff {
  const beforeById = new Map(before.races.map((r) => [r.id, r]));
  const afterById = new Map(after.races.map((r) => [r.id, r]));
  const diff: PlanDiff = {
    changed: [],
    added: [],
    removed: [],
    priorityChanges: [],
    buildChanges: [],
    verdictChanges: [],
  };

  for (const a of after.races) {
    const b = beforeById.get(a.id);
    if (!b) {
      diff.added.push({ raceId: a.id, name: a.name, date: formatDate(a.date), priority: a.priority });
      continue;
    }
    if (b.date !== a.date) {
      diff.changed.push({
        raceId: a.id,
        name: a.name,
        fromDate: formatDate(b.date),
        toDate: formatDate(a.date),
        weeks: Math.round((dayNumber(a.date) - dayNumber(b.date)) / 7),
      });
    }
    if (b.priority !== a.priority) {
      diff.priorityChanges.push({ raceId: a.id, name: a.name, from: b.priority, to: a.priority });
    }
    if (b.buildWeeks !== null && a.buildWeeks !== null && b.buildWeeks !== a.buildWeeks) {
      diff.buildChanges.push({ raceId: a.id, name: a.name, fromWeeks: b.buildWeeks, toWeeks: a.buildWeeks });
    }
    if (b.verdict !== a.verdict) {
      diff.verdictChanges.push({ raceId: a.id, name: a.name, from: b.verdict, to: a.verdict, reason: a.reason });
    }
  }
  for (const b of before.races) {
    if (!afterById.has(b.id)) {
      diff.removed.push({ raceId: b.id, name: b.name, date: formatDate(b.date), priority: b.priority });
    }
  }
  return diff;
}

export function isEmptyDiff(diff: PlanDiff): boolean {
  return Object.values(diff).every((list) => list.length === 0);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizePriority(p: string | null | undefined): Priority {
  const up = (p ?? '').trim().toUpperCase();
  return up === 'A' || up === 'B' || up === 'C' ? up : 'B';
}

const PRIORITY_RANK: Record<Priority, number> = { A: 3, B: 2, C: 1 };

function rankOf(r: PlacedRace): number {
  return PRIORITY_RANK[r.priority];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
