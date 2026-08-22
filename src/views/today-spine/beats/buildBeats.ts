/**
 * buildBeats — the whole mobile beats state matrix, as one pure function.
 *
 * Components render the returned view-model and derive nothing, so every rule
 * in docs/today-mobile-beats-spec.md §5 is exercised by buildBeats.test.ts
 * without mounting React or touching Supabase.
 *
 * Everything comes from the page's single SpineData. Copy comes from copy.ts;
 * effort words and workout phrasings come from the shared vocabulary
 * (src/utils/todayVocabulary.ts) so the beats can't drift from the rest of
 * Today.
 */

import { formPhrase, workoutTypeCopy } from '../../../utils/todayVocabulary';
import { buildWorkoutRouteHref } from '../../../utils/workoutRouteHref';
import { formBandForScore } from '../../../utils/formBands';
import { formatDistanceKm, formatDurationMin, formatElevationM, type UnitsPreference } from '../units';
import { pickOpener, renderBeat1, renderBeat3, renderBeat4Prompt, restOfDayClause, BEAT4_CTA } from './copy';
import type { LastRide, SpineData } from '../types';
import type {
  Beat1State,
  Beat1VM,
  Beat3DayType,
  Beat3VM,
  Beat4VM,
  BeatsVM,
  EffortTier,
  Feel,
  RhythmDay,
  SessionShape,
} from './types';

// ── classification ──────────────────────────────────────────────────────────

/**
 * The same RSS cuts labelActivity uses (getTodaySpine.ts) — the tier a ride
 * gets here and the tag it gets on the spine can never disagree.
 */
export function effortTier(rss: number): EffortTier | null {
  if (!Number.isFinite(rss) || rss <= 0) return null;
  if (rss < 45) return 'easy';
  if (rss < 70) return 'steady';
  if (rss < 88) return 'brisk';
  return 'hard';
}

/**
 * A day genuinely off the bike. Deliberately NOT getTodaySpine's REST_TYPES,
 * which also matches 'recovery' — for load purposes a recovery ride scores
 * zero, but for the rider it is still a ride, and Beat 3 must not tell someone
 * with a recovery spin on the calendar that there's nothing to do today.
 */
const PURE_REST = /rest|off/i;

const HARD_TYPES = new Set(['threshold', 'sweet_spot', 'vo2max', 'anaerobic', 'race']);
const EASY_TYPES = new Set(['recovery']);

/** Silhouette bar height by workout type, 0..1. */
const TYPE_INTENSITY: Record<string, number> = {
  rest: 0,
  recovery: 0.25,
  endurance: 0.42,
  tempo: 0.6,
  sweet_spot: 0.72,
  threshold: 0.82,
  race: 0.9,
  vo2max: 0.92,
  anaerobic: 1,
};

/**
 * One rung down, and one only (spec §5.3). Types absent from the map are
 * already at the bottom and stay put.
 */
const DOWNGRADE: Record<string, string> = {
  race: 'endurance',
  anaerobic: 'endurance',
  vo2max: 'endurance',
  threshold: 'endurance',
  sweet_spot: 'endurance',
  tempo: 'endurance',
  endurance: 'recovery',
};

function normalizeType(type: string | null | undefined): string {
  return (type ?? '').toLowerCase().trim();
}

// ── Beat 1 ──────────────────────────────────────────────────────────────────

function beat1State(last: LastRide | null): Beat1State {
  // hasHistory deliberately does not gate this beat. It gates claims about
  // form; recapping a ride that happened makes no such claim, so a rider with
  // one ride to their name still gets it acknowledged.
  if (!last) return 'no-history';
  if (last.daysAgo === 0) return 'ridden-today';
  if (last.daysAgo <= 6) return 'recent';
  if (last.daysAgo <= 20) return 'gap';
  return 'long-gap';
}

/** One citation, never two: climbing when the ride was climby, else distance. */
function statPhrase(last: LastRide, units: UnitsPreference): string | null {
  if (last.distanceKm == null || last.distanceKm <= 0) return null;
  const elevation = last.elevationM ?? 0;
  if (elevation > 0 && elevation / last.distanceKm >= 12) {
    return `${formatElevationM(elevation, units)} of climbing`;
  }
  return formatDistanceKm(last.distanceKm, units);
}

function buildRhythm(data: SpineData): RhythmDay[] {
  const start = Math.max(0, data.todayIndex - 6);
  return data.days.slice(start, data.todayIndex + 1).map((d) => ({
    date: d.date,
    tier: effortTier(d.rss),
    isToday: d.index === data.todayIndex,
  }));
}

function buildBeat1(data: SpineData, units: UnitsPreference): Beat1VM {
  const last = data.lastRide;
  const state = beat1State(last);
  const tier = last ? effortTier(last.rss) : null;
  const duration = last && last.durationMin > 0 ? formatDurationMin(last.durationMin) : null;

  return {
    state,
    line: renderBeat1({
      state,
      opener: last && tier ? pickOpener(tier, last.date) : '',
      duration,
      stat: last ? statPhrase(last, units) : null,
      daysAgo: last?.daysAgo ?? 0,
    }),
    polyline: last?.polyline ?? null,
    tier,
    rhythm: buildRhythm(data),
  };
}

// ── Beat 3 ──────────────────────────────────────────────────────────────────

function beat3DayType(data: SpineData): Beat3DayType {
  const todayNode = data.days[data.todayIndex];
  // Order matters. A ride already recorded today outranks whatever the plan
  // said, so the page can never prescribe a session the rider just finished.
  if (!data.hasHistory) return 'no-history';
  if (todayNode.rss > 0) return 'ridden-today';

  const tw = data.todaysWorkout;
  if (!tw) return 'no-plan';
  const type = normalizeType(tw.type);
  if (PURE_REST.test(type)) return 'rest';
  if (HARD_TYPES.has(type)) return 'planned-hard';
  if (EASY_TYPES.has(type)) return 'planned-easy';
  // Unknown types read as moderate: a wrong guess that says "steady riding"
  // is recoverable, one that says "very hard, punchy efforts" is not.
  return 'planned-moderate';
}

/** One clause of justification — event proximity outranks the load model. */
function whyClause(data: SpineData): string {
  const event = data.event;
  if (event && event.daysToRace > 0 && event.daysToRace <= 14) {
    return `${event.name} is ${event.daysToRace} ${event.daysToRace === 1 ? 'day' : 'days'} out`;
  }
  const fs = data.days[data.todayIndex].fs;
  return `you're ${formPhrase(fs, { recoveryWeek: data.recoveryWeek })}`;
}

function buildBeat3(data: SpineData, feel: Feel | null): Beat3VM {
  const dayType = beat3DayType(data);
  const tw = data.todaysWorkout;
  const plannedType = normalizeType(tw?.type);

  const prescribable =
    dayType === 'planned-easy' || dayType === 'planned-moderate' || dayType === 'planned-hard';

  let session: SessionShape | null = null;
  let downgraded = false;
  if (prescribable && tw) {
    const targetType = feel === 'flat' ? (DOWNGRADE[plannedType] ?? plannedType) : plannedType;
    downgraded = targetType !== plannedType;
    session = {
      type: targetType,
      // Duration is unchanged by a downgrade: the trade is intensity for
      // intensity, and shortening the day as well would be a second decision
      // the rider never asked for.
      durationMin: tw.durationMin,
      intensity: TYPE_INTENSITY[targetType] ?? 0.5,
    };
  }

  const band = formBandForScore(data.days[data.todayIndex].fs) as { key?: string } | null;

  return {
    dayType,
    line: renderBeat3({
      dayType,
      feel,
      plainName: workoutTypeCopy(session ? session.type : 'endurance').phrase,
      plannedPlain: workoutTypeCopy(plannedType).phrase,
      easierPlain: workoutTypeCopy(DOWNGRADE[plannedType] ?? plannedType).phrase,
      why: whyClause(data),
      restOfDay: restOfDayClause(band?.key === 'overreached'),
    }),
    session,
    downgraded,
  };
}

// ── Beat 4 ──────────────────────────────────────────────────────────────────

const DEFAULT_RIDE_MIN = 60;

function buildBeat4(data: SpineData, beat3: Beat3VM): Beat4VM {
  const today = data.days[data.todayIndex];
  const riddenToday = today.rss > 0;
  const state = riddenToday || beat3.dayType === 'rest' ? 'browse' : 'route';

  if (state === 'browse') {
    return {
      state,
      prompt: renderBeat4Prompt('browse', false),
      ctaLabel: BEAT4_CTA.browse,
      href: '/ride/library',
    };
  }

  if (beat3.session) {
    // The shared contract (src/utils/workoutRouteHref.ts), so the builder opens
    // its arrival form pre-filled exactly as it does from the calendar rather
    // than treating the duration as a bare seed.
    //
    // A downgraded day deliberately drops the workout id and name: deep-linking
    // the planner row would pre-fill the very session Beat 3 just talked the
    // rider out of. The goal still travels, so the builder targets what the
    // page actually endorsed.
    return {
      state,
      prompt: renderBeat4Prompt('route', true),
      ctaLabel: BEAT4_CTA.route,
      href: buildWorkoutRouteHref(
        {
          workout_type: beat3.session.type,
          // `TodaysWorkout.workoutId` is the planned_workouts *row* id (see
          // getTodaySpine.ts:780), so it belongs in `id`. It used to be passed
          // as `workout_id` — the library key — which meant the builder looked
          // a row UUID up in the workout library, always missed, and attached
          // nothing.
          id: beat3.downgraded ? null : data.todaysWorkout?.workoutId ?? null,
          name: beat3.downgraded ? null : data.todaysWorkout?.name ?? null,
          target_duration: Math.round(beat3.session.durationMin),
        },
        today.date,
      ),
    };
  }

  // Nothing scheduled: offer the builder at the rider's usual length, but do
  // not manufacture a workout for it to target.
  const minutes = Math.round(data.typicalRideMin || DEFAULT_RIDE_MIN);
  return {
    state,
    prompt: renderBeat4Prompt('route', false),
    ctaLabel: BEAT4_CTA.route,
    href: `/ride/new?duration=${minutes}`,
  };
}

// ── the object ──────────────────────────────────────────────────────────────

export function buildBeats(
  data: SpineData,
  feel: Feel | null,
  units: UnitsPreference,
): BeatsVM {
  const beat3 = buildBeat3(data, feel);
  return {
    beat1: buildBeat1(data, units),
    beat3,
    beat4: buildBeat4(data, beat3),
  };
}
