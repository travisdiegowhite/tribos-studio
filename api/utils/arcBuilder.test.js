import { describe, it, expect } from 'vitest';
import {
  buildArc,
  generateArcWorkouts,
  applyAvailabilityToArcWorkouts,
  buildArcExplanation,
  buildArcFactSpine,
  isCleanPersonaVoice,
  assembleHybridArcMessage,
  SESSION_TYPE_TO_WORKOUT_TYPE,
} from './arcBuilder.js';

// Fixed dates keep these pure: buildArc/generateArcWorkouts derive everything from
// the date strings, with no wall-clock dependency.
const TODAY = '2026-06-28';
const RACE = '2026-09-26'; // 90 days out — a full A chain fits.

describe('buildArc', () => {
  it('builds an A-tier block chain spanning today → the day before the race', () => {
    const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
    expect(arc.blocks.length).toBeGreaterThan(0);
    expect(arc.blocks[0].start_date).toBe(TODAY);
    const last = arc.blocks[arc.blocks.length - 1];
    // The plan stops the day before the race (the athlete races on race day).
    expect(last.end_date < RACE).toBe(true);
    // A-tier chains peak into a taper.
    expect(last.block_type).toBe('taper');
  });

  it('uses a shorter chain for a lower-priority tier', () => {
    const a = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
    const c = buildArc({ today: TODAY, raceDate: RACE, tier: 'C' });
    expect(c.chain_used.length).toBeLessThan(a.chain_used.length);
  });

  it('flags a conflict when the race is in the past', () => {
    const arc = buildArc({ today: TODAY, raceDate: '2026-06-01', tier: 'A' });
    expect(arc.validation_status).toBe('conflict');
    expect(arc.blocks).toHaveLength(0);
  });

  it('respects the recovery mode (conservative adds recovery padding)', () => {
    // Conservative mode only changes coefficients; the call must still succeed and
    // produce a valid chain ending in taper.
    const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A', recoveryMode: 'conservative' });
    expect(arc.blocks.length).toBeGreaterThan(0);
    expect(arc.blocks[arc.blocks.length - 1].block_type).toBe('taper');
  });
});

describe('generateArcWorkouts', () => {
  const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
  const rows = generateArcWorkouts(arc.blocks, {
    ctx: { upcoming_events: [{ tier: 'A', date: RACE }] },
    arcStart: TODAY,
  });

  it('emits one planned-workout row per day across the whole arc', () => {
    // ~90 days of sessions.
    expect(rows.length).toBeGreaterThan(60);
    for (const r of rows) {
      expect(r.scheduled_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.source).toBe('arc');
      expect(r.phase).toBeTruthy();
      expect(r.completed).toBe(false);
      expect(r.workout_id).toBeNull();
      // Dual-write canonical + legacy load (CLAUDE.md metrics freeze).
      expect(r.target_rss).toBe(r.target_tss);
      // workout_type is one of the mapped values.
      expect(Object.values(SESSION_TYPE_TO_WORKOUT_TYPE)).toContain(r.workout_type);
    }
  });

  it('numbers weeks from the arc start', () => {
    expect(rows[0].week_number).toBe(1);
    // Week numbers increase monotonically with date.
    const last = rows[rows.length - 1];
    expect(last.week_number).toBeGreaterThanOrEqual(rows[0].week_number);
  });

  it('lands the taper in the final block of the arc', () => {
    const taperRows = rows.filter((r) => r.phase === 'taper');
    expect(taperRows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].phase).toBe('taper');
  });

  it('maps session types to valid workout types (e.g. vo2 → vo2max)', () => {
    const vo2Rows = rows.filter((r) => r.phase === 'vo2' && r.workout_type === 'vo2max');
    // The vo2 block should contribute at least one vo2max session.
    expect(vo2Rows.length).toBeGreaterThan(0);
  });

  it('returns [] for an empty block list', () => {
    expect(generateArcWorkouts([])).toEqual([]);
    expect(generateArcWorkouts(null)).toEqual([]);
  });
});

describe('applyAvailabilityToArcWorkouts', () => {
  const makeRow = (overrides) => ({
    week_number: 1,
    day_of_week: 0,
    scheduled_date: '2026-06-28',
    workout_type: 'rest',
    workout_id: null,
    name: 'Rest Day',
    target_rss: 0,
    target_tss: 0,
    target_duration: 0,
    duration_minutes: 0,
    long_ride_flag: false,
    notes: '',
    phase: 'threshold',
    source: 'arc',
    completed: false,
    ...overrides,
  });

  it('swaps a quality session off a blocked day into a rest slot', () => {
    const week = [
      makeRow({ day_of_week: 1, scheduled_date: '2026-06-29', workout_type: 'threshold', name: 'Threshold Intervals', target_rss: 75, target_tss: 75, target_duration: 65, duration_minutes: 65 }),
      makeRow({ day_of_week: 2, scheduled_date: '2026-06-30' }), // rest
    ];
    const availability = { weeklyAvailability: [{ dayOfWeek: 1, status: 'blocked' }], preferences: {} };
    const { redistributedCount } = applyAvailabilityToArcWorkouts(week, availability);

    expect(redistributedCount).toBe(1);
    // Blocked Monday now holds the rest; the threshold moved to the open Tuesday.
    expect(week[0].workout_type).toBe('rest');
    expect(week[1].workout_type).toBe('threshold');
    expect(week[1].target_rss).toBe(75);
    // Dates / day_of_week / phase stay put — only the prescription moved.
    expect(week[0].day_of_week).toBe(1);
    expect(week[1].day_of_week).toBe(2);
    expect(week[0].phase).toBe('threshold');
  });

  it('is a no-op when there are no blocked days', () => {
    const week = [makeRow({ day_of_week: 1, workout_type: 'vo2max', target_rss: 80 })];
    const before = JSON.parse(JSON.stringify(week));
    const { redistributedCount } = applyAvailabilityToArcWorkouts(week, {
      weeklyAvailability: [{ dayOfWeek: 1, status: 'available' }],
      preferences: {},
    });
    expect(redistributedCount).toBe(0);
    expect(week).toEqual(before);
  });

  it('is a no-op when no availability is provided', () => {
    const week = [makeRow({ day_of_week: 1, workout_type: 'vo2max', target_rss: 80 })];
    expect(applyAvailabilityToArcWorkouts(week, null).redistributedCount).toBe(0);
    expect(applyAvailabilityToArcWorkouts(week, undefined).redistributedCount).toBe(0);
  });

  it('clears real sessions off blocked days across a realistic arc when rest slots exist', () => {
    const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
    const rows = generateArcWorkouts(arc.blocks, { arcStart: TODAY });
    const blocked = new Set([2, 4]); // Tue/Thu
    const availability = {
      weeklyAvailability: [
        { dayOfWeek: 2, status: 'blocked' },
        { dayOfWeek: 4, status: 'blocked' },
      ],
      preferences: { preferWeekendLongRides: true },
    };
    const realOnBlocked = (rs) =>
      rs.filter((r) => blocked.has(r.day_of_week) && r.workout_type !== 'rest' && (r.target_rss > 0 || r.duration_minutes > 0)).length;
    const beforeReal = realOnBlocked(rows);
    const totalRealBefore = rows.filter((r) => r.workout_type !== 'rest').length;

    const { redistributedCount } = applyAvailabilityToArcWorkouts(rows, availability);

    expect(beforeReal).toBeGreaterThan(0);
    expect(redistributedCount).toBeGreaterThan(0);
    // Sessions were moved, not created/destroyed.
    expect(rows.filter((r) => r.workout_type !== 'rest').length).toBe(totalRealBefore);
    // Fewer quality sessions remain on blocked days than before.
    expect(realOnBlocked(rows)).toBeLessThan(beforeReal);
  });
});

describe('buildArcExplanation', () => {
  const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });

  it('explains the race, tier rationale, every block, and the taper', () => {
    const text = buildArcExplanation(arc, {
      raceName: 'The Rad',
      raceDate: RACE,
      tier: 'A',
      today: TODAY,
      workoutCount: 102,
    });
    expect(text).toContain('The Rad');
    expect(text).toContain('A-priority');
    // Mentions every block label present in the arc.
    for (const b of arc.blocks) {
      const label = {
        reactivation: 'Reactivation', maintenance: 'Maintenance', recovery: 'Recovery',
        aerobic_build: 'Aerobic Base', threshold: 'Threshold', vo2: 'VO2 Max',
        race_specific: 'Race-Specific', taper: 'Taper',
      }[b.block_type];
      expect(text).toContain(label);
    }
    expect(text.toLowerCase()).toContain('taper');
    expect(text).toContain('102 sessions');
  });

  it('mentions blocked-day accommodation only when sessions were moved', () => {
    const withMove = buildArcExplanation(arc, {
      raceName: 'The Rad', raceDate: RACE, tier: 'A', today: TODAY,
      redistributedCount: 3, blockedDayNames: ['Wednesday'],
    });
    expect(withMove).toContain('Wednesday');

    const noMove = buildArcExplanation(arc, {
      raceName: 'The Rad', raceDate: RACE, tier: 'A', today: TODAY,
      redistributedCount: 0, blockedDayNames: ['Wednesday'],
    });
    expect(noMove).not.toContain('Wednesday');
  });

  it('returns empty string for an arc with no blocks', () => {
    expect(buildArcExplanation({ blocks: [] }, { raceName: 'X' })).toBe('');
  });
});

describe('isCleanPersonaVoice', () => {
  it('accepts short voice-only lines', () => {
    expect(isCleanPersonaVoice('Time to point everything at The Rad.')).toBe(true);
    expect(isCleanPersonaVoice('Now go put in the work — no excuses.')).toBe(true);
  });

  it('rejects anything with a digit (no fabricated counts/dates)', () => {
    expect(isCleanPersonaVoice('You have 13 weeks to get ready.')).toBe(false);
    expect(isCleanPersonaVoice('3 phases of pain await.')).toBe(false);
  });

  it('rejects month names (no fabricated dates)', () => {
    expect(isCleanPersonaVoice('Your taper is in September, stay patient.')).toBe(false);
    expect(isCleanPersonaVoice('See you on the start line in Sep.')).toBe(false);
  });

  it('rejects empty, overly long, and non-string input', () => {
    expect(isCleanPersonaVoice('')).toBe(false);
    expect(isCleanPersonaVoice('   ')).toBe(false);
    expect(isCleanPersonaVoice('word '.repeat(60))).toBe(false);
    expect(isCleanPersonaVoice(null)).toBe(false);
    expect(isCleanPersonaVoice(undefined)).toBe(false);
    expect(isCleanPersonaVoice(42)).toBe(false);
  });
});

describe('assembleHybridArcMessage', () => {
  const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
  const opts = { tier: 'A', workoutCount: 102 };

  it('wraps the verbatim fact spine with valid persona lines', () => {
    const spine = buildArcFactSpine(arc, opts);
    const msg = assembleHybridArcMessage(arc, opts, {
      leadIn: 'Alright — we point everything at The Rad now.',
      signOff: 'Show up and do the work. I will hold you to it.',
    });
    expect(msg).not.toBeNull();
    // The factual spine appears verbatim, untouched by the persona layer.
    expect(msg).toContain(spine);
    expect(msg.startsWith('Alright')).toBe(true);
    expect(msg.trimEnd().endsWith('I will hold you to it.')).toBe(true);
    expect(msg).toContain('102 sessions');
  });

  it('returns null when either wrapper line fails validation (→ caller falls back)', () => {
    expect(assembleHybridArcMessage(arc, opts, { leadIn: 'You have 13 weeks.', signOff: 'Go.' })).toBeNull();
    expect(assembleHybridArcMessage(arc, opts, { leadIn: 'Good luck.', signOff: '' })).toBeNull();
    expect(assembleHybridArcMessage(arc, opts, {})).toBeNull();
  });

  it('returns null for an empty arc', () => {
    expect(assembleHybridArcMessage({ blocks: [] }, opts, { leadIn: 'Hi.', signOff: 'Bye.' })).toBeNull();
  });
});
