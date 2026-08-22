/**
 * The mobile beats state matrix (docs/today-mobile-beats-spec.md §5).
 *
 * Fixtures go through assembleSpine rather than hand-building a SpineData, so
 * these also cover the assembler's lastRide / typicalRideMin derivation and
 * can't drift from the shape the page actually receives.
 */

import { describe, it, expect } from 'vitest';
import { assembleSpine, type AssembleInput, type RideStat } from '../getTodaySpine';
import type { ServerLoadRow } from '../../today/athleteMetrics';
import { buildBeats, effortTier } from './buildBeats';
import type { Feel } from './types';

const NOW = new Date(2026, 5, 30, 9, 0, 0); // Tue 30 Jun 2026, local

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(base: Date, n: number): Date {
  const c = new Date(base);
  c.setDate(c.getDate() + n);
  return c;
}
/** 09:00 local, `daysAgo` before NOW. */
function at(daysAgo: number): Date {
  const d = addDays(NOW, -daysAgo);
  d.setHours(9, 0, 0, 0);
  return d;
}

function serverLoad(): ServerLoadRow[] {
  const rows: ServerLoadRow[] = [];
  for (let i = 0; i <= 42; i++) {
    const tfi = 44 + (i / 42) * 18;
    rows.push({ date: fmt(addDays(NOW, i - 42)), tfi, afi: tfi - 4, form_score: 4 });
  }
  return rows;
}

/** An activity with an exact stored RSS (tier 1 of estimateActivityTSS). */
function ride(daysAgo: number, rss: number, minutes = 90, name = 'Morning ride') {
  return {
    start_date: at(daysAgo).toISOString(),
    name,
    rss,
    moving_time: minutes * 60,
  } as unknown as AssembleInput['activities'][number];
}

function rideStat(daysAgo: number, over: Partial<RideStat> = {}): RideStat {
  return {
    date: fmt(at(daysAgo)),
    durationSec: 90 * 60,
    distanceKm: 40,
    elevationM: 200,
    polyline: 'ab_cd',
    ...over,
  };
}

function input(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    now: NOW,
    serverLoad: serverLoad(),
    activities: [],
    ftp: 250,
    planned: [],
    todaysWorkout: null,
    event: null,
    persona: { id: 'pragmatist', name: 'The Pragmatist' },
    recentRides: [],
    weekRollup: { distanceKm: 0, distanceMi: 0, elevationM: 0, elevationFt: 0, rideCount: 0 },
    ...overrides,
  };
}

function beats(overrides: Partial<AssembleInput> = {}, feel: Feel | null = null) {
  return buildBeats(assembleSpine(input(overrides)), feel, 'metric');
}

/** A workout row for today, plus the matching todaysWorkout. */
function planToday(type: string, durationMin = 75, workoutId: string | null = 'two_by_twenty_ftp') {
  return {
    planned: [
      {
        scheduled_date: fmt(NOW),
        name: 'Session',
        workout_type: type,
        duration_minutes: durationMin,
        target_rss: 70,
      },
    ],
    todaysWorkout: { name: 'Session', type, durationMin, targetRss: 70, workoutId },
  };
}

// ── effort tiers ────────────────────────────────────────────────────────────

describe('effortTier', () => {
  it('uses the same RSS cuts as the spine day labels', () => {
    expect(effortTier(0)).toBeNull();
    expect(effortTier(44)).toBe('easy');
    expect(effortTier(45)).toBe('steady');
    expect(effortTier(69)).toBe('steady');
    expect(effortTier(70)).toBe('brisk');
    expect(effortTier(87)).toBe('brisk');
    expect(effortTier(88)).toBe('hard');
  });
});

// ── Beat 1 ──────────────────────────────────────────────────────────────────

describe('Beat 1 — what you did', () => {
  it('recaps a ride recorded today', () => {
    const { beat1 } = beats({ activities: [ride(0, 80)], rideStats: [rideStat(0)] });
    expect(beat1.state).toBe('ridden-today');
    expect(beat1.line).toMatch(/ today — /);
    expect(beat1.line).toContain('1h 30m');
    expect(beat1.line).toContain('40.0 km');
    expect(beat1.tier).toBe('brisk');
    expect(beat1.polyline).toBe('ab_cd');
  });

  it.each([
    [1, 'recent', null],
    [2, 'recent', 'A couple of quiet days since'],
    [3, 'recent', '3 quiet days since'],
    [6, 'recent', '6 quiet days since'],
    [7, 'gap', null],
    [20, 'gap', null],
    [21, 'long-gap', null],
    [40, 'long-gap', null],
  ])('at %i days ago reads as %s', (daysAgo, state, clause) => {
    const { beat1 } = beats({
      activities: [ride(daysAgo as number, 60)],
      rideStats: [rideStat(daysAgo as number)],
    });
    expect(beat1.state).toBe(state);
    if (clause) expect(beat1.line).toContain(clause as string);
  });

  it('adds no gap clause the day after a ride', () => {
    const { beat1 } = beats({ activities: [ride(1, 60)], rideStats: [rideStat(1)] });
    expect(beat1.line).not.toMatch(/quiet day/);
  });

  it('never blames the rider for time off', () => {
    for (const daysAgo of [2, 5, 9, 30]) {
      const { beat1 } = beats({ activities: [ride(daysAgo, 60)], rideStats: [rideStat(daysAgo)] });
      expect(beat1.line).not.toMatch(/should have|missed|behind|slack|catch up on/i);
    }
  });

  it('falls back to the honest empty line with nothing to recap', () => {
    const { beat1 } = beats();
    expect(beat1.state).toBe('no-history');
    expect(beat1.line).toMatch(/couple of rides/);
    expect(beat1.polyline).toBeNull();
  });

  it('still recaps a first ride, because a recap makes no claim about form', () => {
    // serverLoad empty → hasHistory false, but the ride happened and is named.
    const { beat1, beat3 } = beats({
      serverLoad: [],
      activities: [ride(0, 70)],
      rideStats: [rideStat(0)],
    });
    expect(beat1.state).toBe('ridden-today');
    expect(beat3.dayType).toBe('no-history');
  });

  it('cites climbing when the ride was climby, distance otherwise', () => {
    const climby = beats({
      activities: [ride(0, 80)],
      rideStats: [rideStat(0, { distanceKm: 30, elevationM: 900 })], // 30 m/km
    });
    expect(climby.beat1.line).toContain('900 m of climbing');
    expect(climby.beat1.line).not.toContain('30.0 km');

    const flat = beats({
      activities: [ride(0, 80)],
      rideStats: [rideStat(0, { distanceKm: 60, elevationM: 300 })], // 5 m/km
    });
    expect(flat.beat1.line).toContain('60.0 km');
    expect(flat.beat1.line).not.toContain('of climbing');
  });

  it('cites duration alone when the ride carried no geometry', () => {
    const { beat1 } = beats({ activities: [ride(0, 80, 45)] });
    expect(beat1.line).toContain('45 min');
    expect(beat1.line).not.toContain('km');
    expect(beat1.polyline).toBeNull();
  });

  it('picks a stable opener — the same ride never re-rolls its wording', () => {
    const args = { activities: [ride(0, 80)], rideStats: [rideStat(0)] };
    expect(beats(args).beat1.line).toBe(beats(args).beat1.line);
  });

  it('reports the largest ride of a multi-ride day, not the commute', () => {
    const { beat1 } = beats({
      activities: [ride(0, 80, 150, 'Long one'), ride(0, 20, 25, 'Commute')],
      rideStats: [
        rideStat(0, { durationSec: 150 * 60, distanceKm: 62, polyline: 'long' }),
        rideStat(0, { durationSec: 25 * 60, distanceKm: 8, polyline: 'short' }),
      ],
    });
    expect(beat1.polyline).toBe('long');
    expect(beat1.line).toContain('62.0 km');
  });

  it('builds a seven-cell rhythm strip ending today', () => {
    const { beat1 } = beats({ activities: [ride(0, 80), ride(3, 30)] });
    expect(beat1.rhythm).toHaveLength(7);
    expect(beat1.rhythm[6].isToday).toBe(true);
    expect(beat1.rhythm[6].tier).toBe('brisk');
    expect(beat1.rhythm[3].tier).toBe('easy');
    expect(beat1.rhythm[5].tier).toBeNull();
  });
});

// ── Beat 3 ──────────────────────────────────────────────────────────────────

describe('Beat 3 — what to do', () => {
  it('endorses the planned session on a normal day', () => {
    const { beat3 } = beats(planToday('threshold'));
    expect(beat3.dayType).toBe('planned-hard');
    expect(beat3.line).toMatch(/Today's a good day for hard, steady effort/);
    expect(beat3.downgraded).toBe(false);
    expect(beat3.session).toEqual({ type: 'threshold', durationMin: 75, intensity: 0.82 });
  });

  it('trades a hard day down when the legs are flat, and says so', () => {
    const { beat3 } = beats(planToday('threshold'), 'flat');
    expect(beat3.downgraded).toBe(true);
    expect(beat3.session?.type).toBe('endurance');
    expect(beat3.line).toContain("let's trade");
    expect(beat3.line).toContain('It still counts');
  });

  it('confirms but never escalates when the legs are strong', () => {
    const { beat3 } = beats(planToday('tempo'), 'strong');
    expect(beat3.downgraded).toBe(false);
    expect(beat3.session?.type).toBe('tempo');
    expect(beat3.line).toMatch(/green light/);
  });

  it('keeps the session length when it trades intensity down', () => {
    const { beat3 } = beats(planToday('vo2max', 95), 'flat');
    expect(beat3.session).toEqual({ type: 'endurance', durationMin: 95, intensity: 0.42 });
  });

  it.each([
    ['race', 'endurance'],
    ['anaerobic', 'endurance'],
    ['vo2max', 'endurance'],
    ['threshold', 'endurance'],
    ['sweet_spot', 'endurance'],
    ['tempo', 'endurance'],
    ['endurance', 'recovery'],
    ['recovery', 'recovery'],
  ])('steps %s down to %s, one rung and no further', (from, to) => {
    const { beat3 } = beats(planToday(from as string), 'flat');
    expect(beat3.session?.type).toBe(to);
  });

  it('greets a flat day that was already easy without trading anything', () => {
    const { beat3 } = beats(planToday('recovery'), 'flat');
    expect(beat3.dayType).toBe('planned-easy');
    expect(beat3.downgraded).toBe(false);
    expect(beat3.line).toMatch(/Perfect timing/);
  });

  it('treats a planned rest day as the workout', () => {
    const { beat3 } = beats(planToday('rest'));
    expect(beat3.dayType).toBe('rest');
    expect(beat3.session).toBeNull();
    expect(beat3.line).toMatch(/Nothing to do today but recover/);
  });

  it('does not confuse a recovery ride with a rest day', () => {
    const { beat3 } = beats(planToday('recovery'));
    expect(beat3.dayType).toBe('planned-easy');
    expect(beat3.line).toMatch(/easy spin/i);
  });

  it('never prescribes a session the rider already did today', () => {
    const { beat3 } = beats({ ...planToday('threshold'), activities: [ride(0, 95)] });
    expect(beat3.dayType).toBe('ridden-today');
    expect(beat3.line).toMatch(/today's work done/i);
    expect(beat3.line).not.toMatch(/hard, steady effort/);
    expect(beat3.session).toBeNull();
  });

  it('reads an unknown workout type as moderate rather than hard', () => {
    const { beat3 } = beats(planToday('mystery_intervals'));
    expect(beat3.dayType).toBe('planned-moderate');
  });

  it('speaks to form when nothing is scheduled', () => {
    const { beat3 } = beats();
    expect(beat3.dayType).toBe('no-plan');
    expect(beat3.line).toMatch(/No session on the calendar/);
    expect(beat3.session).toBeNull();
  });

  it('leads with the race when one is close', () => {
    const { beat3 } = beats({
      ...planToday('sweet_spot'),
      event: { name: 'Gran Fondo', date: fmt(addDays(NOW, 9)), daysToRace: 9, priority: 'A' },
    });
    expect(beat3.line).toContain('Gran Fondo is 9 days out');
  });

  it('claims no readiness at all without enough history', () => {
    const { beat3 } = beats({ serverLoad: [], ...planToday('threshold') });
    expect(beat3.dayType).toBe('no-history');
    expect(beat3.line).toMatch(/don't have enough riding/);
    expect(beat3.line).not.toMatch(/productive load|fresh|coasting/);
    expect(beat3.session).toBeNull();
  });

  it.each(['flat', 'normal', 'strong'] as Feel[])(
    'says the same honest thing on a thin-history day whatever the feel (%s)',
    (feel) => {
      const { beat3 } = beats({ serverLoad: [] }, feel);
      expect(beat3.line).toMatch(/don't have enough riding/);
    },
  );
});

// ── Beat 4 ──────────────────────────────────────────────────────────────────

describe('Beat 4 — need a route for that?', () => {
  it('deep-links the planned workout through the shared arrival contract', () => {
    const { beat4 } = beats(planToday('threshold', 75, 'over_under_intervals'));
    expect(beat4.state).toBe('route');
    // The library key the builder resolves — never the plan row's own uuid.
    expect(beat4.href).toContain('workoutId=over_under_intervals');
    expect(beat4.href).toContain('duration=75');
    expect(beat4.href).toContain('goal=threshold');
    // from=calendar is what opens the builder's pre-filled arrival form.
    expect(beat4.href).toContain('from=calendar');
  });

  it('drops the workout id and name once the session has been traded down', () => {
    const { beat4 } = beats(planToday('threshold', 75, 'over_under_intervals'), 'flat');
    expect(beat4.href).not.toContain('workoutId');
    expect(beat4.href).not.toContain('workoutName');
    expect(beat4.href).toContain('duration=75');
    // ...but the builder still aims at what the page actually endorsed.
    expect(beat4.href).toContain('goal=endurance');
  });

  it('offers browsing instead of a build on a rest day', () => {
    const { beat4 } = beats(planToday('rest'));
    expect(beat4.state).toBe('browse');
    expect(beat4.href).toBe('/ride/library');
    expect(beat4.prompt).toMatch(/Thinking ahead/);
  });

  it('offers browsing once today has been ridden', () => {
    const { beat4 } = beats({ activities: [ride(0, 80)] });
    expect(beat4.state).toBe('browse');
  });

  it('does not manufacture a workout when nothing is scheduled', () => {
    const { beat4 } = beats();
    expect(beat4.href).not.toContain('goal=');
    expect(beat4.href).not.toContain('from=calendar');
    expect(beat4.prompt).toBe('Want a route?');
  });

  it('falls back to the rider\'s typical ride length with no plan', () => {
    const { beat4 } = beats({
      rideStats: [
        rideStat(2, { durationSec: 60 * 60 }),
        rideStat(5, { durationSec: 120 * 60 }),
        rideStat(9, { durationSec: 100 * 60 }),
      ],
    });
    expect(beat4.href).toContain('duration=100');
  });

  it('ignores rides outside the 28-day window when picking a typical length', () => {
    const { beat4 } = beats({
      rideStats: [rideStat(40, { durationSec: 240 * 60 }), rideStat(3, { durationSec: 50 * 60 })],
    });
    expect(beat4.href).toContain('duration=50');
  });

  it('uses a plain hour for a rider with no rides at all', () => {
    const { beat4 } = beats();
    expect(beat4.href).toContain('duration=60');
  });
});
