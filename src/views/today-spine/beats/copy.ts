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

/** Deterministic pick — same date in, same opener out. */
export function pickOpener(tier: EffortTier, dateKey: string): string {
  const pool = OPENERS[tier];
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
}

export function renderBeat1(s: Beat1Slots): string {
  // A ride with neither timing nor geometry gets no citation rather than an
  // invented one — the sentence simply drops its clause.
  const measured = [s.duration, s.stat].filter(Boolean).join(' with ');
  switch (s.state) {
    case 'ridden-today':
      return measured ? `${s.opener} today — ${measured}.` : `${s.opener} today.`;
    case 'recent':
      return measured
        ? `${s.opener} on your last ride — ${measured}.${gapClause(s.daysAgo)}`
        : `${s.opener} on your last ride.${gapClause(s.daysAgo)}`;
    case 'gap':
      return measured
        ? `Your last ride was ${measured}. Quiet stretch since — no catching up to do.`
        : "It's been a quiet stretch — no catching up to do.";
    case 'long-gap':
      return 'Welcome back. No catching up to do — we start from where you are.';
    case 'no-history':
    default:
      return "Once you've got a couple of rides in, this is where I'll tell you what I'm seeing.";
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
}

export function renderBeat3(s: Beat3Slots): string {
  const flat = s.feel === 'flat';
  const strong = s.feel === 'strong';

  switch (s.dayType) {
    case 'no-history':
      return "I don't have enough riding to read you well yet — keep it easy and fun, and I'll have more to say soon.";

    case 'ridden-today':
      if (flat) return "That's today's work done — and the legs know it. Eat, sleep, don't add to it.";
      if (strong) return "That's today's work done. Banked.";
      return `That's today's work done. ${s.restOfDay}`;

    case 'rest':
      return 'Nothing to do today but recover. That’s the workout.';

    case 'planned-easy':
      if (flat) return 'Perfect timing — today was already meant to be easy. Just spin.';
      if (strong) return 'Still an easy day. Save it.';
      return `An easy spin today — ${s.why}.`;

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
      if (flat) return "Legs are flat and nothing's scheduled. Easy spin or a day off, both fine.";
      if (strong) return `Nothing scheduled, and the legs are good — ${s.plainName} would land well.`;
      return `No session on the calendar. ${capitalize(s.why)}.`;
  }
}

/** Closing clause for an already-ridden day, by how deep the rider is. */
export function restOfDayClause(overreached: boolean): string {
  return overreached
    ? 'Let it settle — nothing else needed.'
    : 'Nothing else needed, but an easy spin later wouldn’t hurt.';
}

// ── Beat 4 ──────────────────────────────────────────────────────────────────

export function renderBeat4Prompt(state: Beat4State, hasSession: boolean): string {
  if (state === 'browse') return 'Thinking ahead? Browse routes for your next ride.';
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
