/**
 * Every user-facing string on the mobile beats page, in one file.
 *
 * The rules these templates encode (docs/today-mobile-beats-spec.md §5):
 *
 *  - Tier 1 temporal language only. "Your last ride", never "yesterday" and
 *    never a weekday name. copy.test.ts fails the build if one creeps in.
 *  - Numbers arrive pre-formatted as slots. Nothing here computes a duration,
 *    a distance, or a date.
 *  - One sentence per beat, two at most.
 *  - No guilt about days off, and no escalation on a good day.
 *
 * Every export is a pure function of its slots, so when a phrasing layer is
 * eventually added (spec D1) it replaces these bodies without touching the
 * callers.
 */

import type { Beat1State, Beat3DayType, Beat4State, EffortTier, Feel } from './types';

// ── Sport words (multisport phase 4) ────────────────────────────────────────

/** 'cycling' | 'running', or null when nothing says which — then the words are neutral. */
export type CopySport = 'cycling' | 'running' | null | undefined;

interface SportWords {
  /** "ride" / "run" / "session". */
  noun: string;
  /** Plural noun. */
  nouns: string;
  /** "riding" / "running" / "training". */
  gerund: string;
  /** An easy session: "spin" / "jog" / "easy session". */
  easy: string;
}

const WORDS: Record<'cycling' | 'running' | 'neutral', SportWords> = {
  cycling: { noun: 'ride', nouns: 'rides', gerund: 'riding', easy: 'spin' },
  running: { noun: 'run', nouns: 'runs', gerund: 'running', easy: 'jog' },
  neutral: { noun: 'session', nouns: 'sessions', gerund: 'training', easy: 'easy session' },
};

export function sportWords(sport: CopySport): SportWords {
  return sport === 'running' ? WORDS.running : sport === 'cycling' ? WORDS.cycling : WORDS.neutral;
}

/** "Easy spin" → "Easy jog" for a run; "Easy session" when the sport is unknown. */
function easyPhrase(sport: CopySport): string {
  const w = sportWords(sport);
  return w.easy === 'easy session' ? 'easy session' : `easy ${w.easy}`;
}

// ── Beat 1 ──────────────────────────────────────────────────────────────────

/**
 * Acknowledgement openers, by how hard the ride was. Picked by a stable hash
 * of the ride's date — a random pick re-rolls on every render, which reads as
 * the page glitching.
 */
export const OPENERS: Record<EffortTier, readonly string[]> = {
  easy: ['Nice spin', 'Easy does it', 'Good to keep it turning'],
  steady: ['Solid work', 'Nice one', 'Good ride'],
  brisk: ['Strong work', 'That was a good one', 'Nice bit of work'],
  hard: ['Big day', 'Proper effort', 'That was a hard one'],
};

/** Run openers: same pool size per tier, so a date picks the same slot either way. */
export const RUN_OPENERS: Record<EffortTier, readonly string[]> = {
  easy: ['Nice easy run', 'Easy does it', 'Good to keep the legs moving'],
  steady: ['Solid work', 'Nice one', 'Good run'],
  brisk: ['Strong work', 'That was a good one', 'Nice bit of work'],
  hard: ['Big day', 'Proper effort', 'That was a hard one'],
};

/** Deterministic pick — same date in, same opener out. */
export function pickOpener(tier: EffortTier, dateKey: string, sport: CopySport = 'cycling'): string {
  const pool = (sport === 'running' ? RUN_OPENERS : OPENERS)[tier];
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

/** Trailing clause for a recap that isn't today's. Empty at 0–1 days. */
export function gapClause(daysAgo: number): string {
  if (daysAgo <= 1) return '';
  if (daysAgo === 2) return ' A couple of quiet days since — legs should be coming back.';
  return ` ${daysAgo} quiet days since — legs should be coming back.`;
}

export interface Beat1Slots {
  state: Beat1State;
  /** From pickOpener. */
  opener: string;
  /** Pre-formatted, e.g. '1h 48m'. Null when the ride carried no timing. */
  duration: string | null;
  /** Pre-formatted single citation, or null when the ride carried no geometry. */
  stat: string | null;
  daysAgo: number;
  /** Sport of the recapped activity (or the athlete's primary sport). Default: ride. */
  sport?: CopySport;
}

export function renderBeat1(s: Beat1Slots): string {
  const w = sportWords(s.sport === undefined ? 'cycling' : s.sport);
  // A ride with neither timing nor geometry gets no citation rather than an
  // invented one — the sentence simply drops its clause.
  const measured = [s.duration, s.stat].filter(Boolean).join(' with ');
  switch (s.state) {
    case 'ridden-today':
      return measured ? `${s.opener} today — ${measured}.` : `${s.opener} today.`;
    case 'recent':
      return measured
        ? `${s.opener} on your last ${w.noun} — ${measured}.${gapClause(s.daysAgo)}`
        : `${s.opener} on your last ${w.noun}.${gapClause(s.daysAgo)}`;
    case 'gap':
      return measured
        ? `Your last ${w.noun} was ${measured}. Quiet stretch since — no catching up to do.`
        : "It's been a quiet stretch — no catching up to do.";
    case 'long-gap':
      return 'Welcome back. No catching up to do — we start from where you are.';
    case 'no-history':
    default:
      return `Once you've got a couple of ${w.nouns} in, this is where I'll tell you what I'm seeing.`;
  }
}

// ── Beat 3 ──────────────────────────────────────────────────────────────────

export interface Beat3Slots {
  dayType: Beat3DayType;
  feel: Feel | null;
  /** workoutTypeCopy().phrase for the session being endorsed. */
  plainName: string;
  /** The plan's own session, before any downgrade. */
  plannedPlain: string;
  /** What a flat day trades down to. */
  easierPlain: string;
  /** One clause: 'you're carrying productive load' | 'Gran Fondo is 9 days out'. */
  why: string;
  /** Closing clause for a day that's already been ridden. */
  restOfDay: string;
  /** Sport of the session being endorsed (or the athlete's primary). Default: ride. */
  sport?: CopySport;
}

export function renderBeat3(s: Beat3Slots): string {
  const flat = s.feel === 'flat';
  const strong = s.feel === 'strong';
  const sport = s.sport === undefined ? 'cycling' : s.sport;
  const w = sportWords(sport);
  const easy = easyPhrase(sport);

  switch (s.dayType) {
    case 'no-history':
      return `I don't have enough ${w.gerund} to read you well yet — keep it easy and fun, and I'll have more to say soon.`;

    case 'ridden-today':
      if (flat) return "That's today's work done — and the legs know it. Eat, sleep, don't add to it.";
      if (strong) return "That's today's work done. Banked.";
      return `That's today's work done. ${s.restOfDay}`;

    case 'rest':
      return 'Nothing to do today but recover. That’s the workout.';

    case 'planned-easy':
      if (flat) return `Perfect timing — today was already meant to be easy. Just ${w.easy === 'easy session' ? 'keep it easy' : w.easy}.`;
      if (strong) return 'Still an easy day. Save it.';
      return `An ${easy} today — ${s.why}.`;

    case 'planned-hard':
      if (flat)
        return `You said the legs are flat, so let's trade ${s.plannedPlain} for ${s.easierPlain}. It still counts.`;
      if (strong) return `Legs are good? Then ${s.plainName} as planned — green light.`;
      return `Today's a good day for ${s.plainName} — ${s.why}.`;

    case 'planned-moderate':
      if (flat) return `Legs are flat — make it ${s.easierPlain} instead. It still counts.`;
      if (strong) return `${capitalize(s.plainName)} as planned — green light.`;
      return `Today's a good day for ${s.plainName} — ${s.why}.`;

    case 'no-plan':
    default:
      if (flat) return `Legs are flat and nothing's scheduled. ${capitalize(easy)} or a day off, both fine.`;
      if (strong) return `Nothing scheduled, and the legs are good — ${s.plainName} would land well.`;
      return `No session on the calendar. ${capitalize(s.why)}.`;
  }
}

/** Closing clause for an already-ridden day, by how deep the rider is. */
export function restOfDayClause(overreached: boolean, sport: CopySport = 'cycling'): string {
  return overreached
    ? 'Let it settle — nothing else needed.'
    : `Nothing else needed, but an ${easyPhrase(sport)} later wouldn’t hurt.`;
}

/**
 * The second session of a two-a-day, as its own short line under Beat 3
 * (kept out of the Beat 3 sentence, which is capped at two).
 */
export function renderAlsoToday(other: { sport: CopySport; durationLabel: string | null; plain: string }): string {
  const w = sportWords(other.sport);
  const length = other.durationLabel ? `${other.durationLabel} ` : '';
  return `Also on the calendar: a ${length}${w.noun === 'session' ? other.plain : `${other.plain} ${w.noun}`}.`;
}

// ── Beat 4 ──────────────────────────────────────────────────────────────────

export function renderBeat4Prompt(state: Beat4State, hasSession: boolean, sport: CopySport = 'cycling'): string {
  if (state === 'browse') return `Thinking ahead? Browse routes for your next ${sportWords(sport).noun}.`;
  return hasSession ? 'Want a route for that?' : 'Want a route?';
}

export const BEAT4_CTA = {
  route: 'Build my route',
  browse: 'Browse routes',
} as const;

// ── shared ──────────────────────────────────────────────────────────────────

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
