import { describe, it, expect } from 'vitest';
import {
  buildCoachingBibleBlock,
  buildFiredRulesBlock,
  buildRiderContext,
  efTrendFrom,
  pdTrendFrom,
  ageFromDob,
  ageFromBirthYear,
  ageFromProfile,
  weeksUntil,
  pickGoalRace,
} from './coachingBible.js';
import { PERSONA_FIXTURES } from './coachingBible.fixtures.js';

// ─── Phase 1 "done when": the five persona fixtures ──────────────────────────
//
// String-level checks against saved outputs, per the brief. Deliberately not
// an eval harness — four regexes and a persona loop.

/** (a) a because: a causal connective tying the prescription to a reason. */
const CAUSAL = /\b(because|since|so that|that (is|'s) why|which is why|that is the reason)\b/i;

/** (b) a concrete next step in the closing sentence. */
const ACTION_VERB =
  /\b(put|do|ride|book|keep|cut|add|move|swap|start|pick|take|send|tell|schedule|hold|drop|run|go|make|give|log|squat)\b/i;
const TIME_MARKER =
  /\b(today|tonight|tomorrow|this week|next week|this (mon|tues|wednes|thurs|fri|satur|sun)day|(mon|tues|wednes|thurs|fri|satur|sun)day|now)\b/i;

/** (c) praise aimed at the person, not the work. */
const SELF_PRAISE =
  /\b(great job|good job|nice job|well done|amazing|awesome|proud of you|crushed it|smashed it|you'?re a (star|beast|machine))\b/i;

/** (d) the banned-lingo list from the prompt's "what you never say". */
const BANNED_LINGO = [
  /\bvo2\s?max\b/i,
  /\bzone\s?2\b/i,
  /\bthreshold session\b/i,
  /\bTSS\b/,
  /\bCTL\b/,
  /\bATL\b/,
  /\bTSB\b/,
  /\breadiness score\b/i,
  /\bpolarized\b/i,
  /\b80\/20\b/,
  /\bblock periodization\b/i,
];

/** The final sentence, ignoring trailing whitespace. */
function lastSentence(text) {
  const parts = text.trim().split(/(?<=[.!?])\s+/);
  return parts[parts.length - 1] || '';
}

describe('Phase 1 behavior floor — persona fixtures', () => {
  it('covers all five personas exactly once', () => {
    const personas = PERSONA_FIXTURES.map((f) => f.persona).sort();
    expect(personas).toEqual(['competitor', 'encourager', 'hammer', 'pragmatist', 'scientist']);
  });

  for (const fixture of PERSONA_FIXTURES) {
    describe(fixture.persona, () => {
      it('(a) carries a because', () => {
        expect(fixture.text).toMatch(CAUSAL);
      });

      it('(b) ends with a concrete next step', () => {
        const closing = lastSentence(fixture.text);
        expect(closing).toMatch(ACTION_VERB);
        expect(closing).toMatch(TIME_MARKER);
      });

      it('(c) contains no praise aimed at the person', () => {
        expect(fixture.text).not.toMatch(SELF_PRAISE);
      });

      it('(d) contains no banned coach lingo', () => {
        for (const banned of BANNED_LINGO) {
          expect(fixture.text).not.toMatch(banned);
        }
      });
    });
  }
});

// ─── The prompt block itself ─────────────────────────────────────────────────

describe('buildCoachingBibleBlock', () => {
  const block = buildCoachingBibleBlock({ riderContext: 'You are coaching Sam.' });

  it('carries all nine floor rules', () => {
    for (let n = 1; n <= 9; n++) {
      expect(block).toContain(`\n${n}. `);
    }
  });

  it('states the empty-rules case in words rather than leaving a gap', () => {
    expect(block).toContain('No specific rule fires today');
    expect(block).toContain('If no rule fires, do not\ninvent one.');
  });

  it('injects the rider context', () => {
    expect(block).toContain('You are coaching Sam.');
  });

  it('bans the lingo it tells the coach to avoid saying', () => {
    expect(block).toContain('"readiness score,"');
    expect(block).toContain('Never say good job.');
  });

  it('defers to shipped length/format rules so the additive install cannot contradict them', () => {
    expect(block).toContain('FORMAT PRECEDENCE');
    expect(block).toContain('ANSWER-FIRST');
  });

  it('omits the fear-of-failure clause by default and includes it when flagged', () => {
    expect(block).not.toContain('anxious about falling short');
    const anxious = buildCoachingBibleBlock({ riderContext: 'x', fearOfFailure: true });
    expect(anxious).toContain('anxious about falling short');
  });
});

describe('buildFiredRulesBlock', () => {
  const rule = (id, priority) => ({
    id,
    priority,
    claim: `claim ${id}`,
    confidence: 'leaning',
    personaLine: `line ${id}`,
    neverSay: ['nope', 'never'],
  });

  it('renders the placeholder when nothing fires', () => {
    expect(buildFiredRulesBlock([])).toContain('No specific rule fires today');
  });

  it('renders a rule in the template shape', () => {
    const out = buildFiredRulesBlock([rule('TID-1-middle', 20)]);
    expect(out).toContain('RULE TID-1-middle — confidence: leaning');
    expect(out).toContain('Claim: claim TID-1-middle');
    expect(out).toContain('Say it like this: line TID-1-middle');
    expect(out).toContain('Never say: nope / never');
  });

  it('injects at most three rules', () => {
    const out = buildFiredRulesBlock([rule('A'), rule('B'), rule('C'), rule('D')]);
    expect(out).toContain('RULE C');
    expect(out).not.toContain('RULE D');
  });
});

// ─── Evidence-engine readers ─────────────────────────────────────────────────

describe('efTrendFrom', () => {
  it('is null when the engine has never run', () => {
    expect(efTrendFrom(null)).toBeNull();
    expect(efTrendFrom({})).toBeNull();
  });

  it('reports insufficient rather than guessing when unqualified', () => {
    expect(efTrendFrom({ efficiency_factor: { qualified: false, reason: 'steady rides: 1' } }))
      .toBe('insufficient');
  });

  it('maps the engine score to the trend vocabulary', () => {
    expect(efTrendFrom({ efficiency_factor: { qualified: true, score: 1 } })).toBe('ahead');
    expect(efTrendFrom({ efficiency_factor: { qualified: true, score: 0 } })).toBe('consistent');
    expect(efTrendFrom({ efficiency_factor: { qualified: true, score: -1 } })).toBe('behind');
  });
});

describe('pdTrendFrom', () => {
  const pd = (movements, qualified = true) => ({ power_duration: { qualified, movements } });

  it('is null when the engine has never run', () => {
    expect(pdTrendFrom(null, ['p60'])).toBeNull();
  });

  it('weights short durations 0.2/0.3 the way the engine does', () => {
    // (0.2 × −9.2% + 0.3 × −7.5%) / 0.5 = −8.2% → behind (≤ −6%)
    const s = pd({
      p60: { attempted: true, movementPct: -9.2 },
      p300: { attempted: true, movementPct: -7.5 },
    });
    expect(pdTrendFrom(s, ['p60', 'p300'])).toBe('behind');
  });

  it('reads the long trend off the 20-minute best alone', () => {
    const s = pd({ p1200: { attempted: true, movementPct: 3.4 } });
    expect(pdTrendFrom(s, ['p1200'])).toBe('ahead');
    expect(pdTrendFrom(s, ['p60', 'p300'])).toBe('insufficient');
  });

  it('does not manufacture "behind" out of "no recent hard effort"', () => {
    // The engine's attempt gating: a trailing best can trail simply because
    // nothing hard happened. Unattempted durations must not score.
    const s = pd({
      p60: { attempted: false, movementPct: -31.0 },
      p300: { attempted: false, movementPct: -28.0 },
    });
    expect(pdTrendFrom(s, ['p60', 'p300'])).toBe('insufficient');
  });

  it('lands on consistent inside the engine thresholds', () => {
    const s = pd({ p300: { attempted: true, movementPct: 0.5 } });
    expect(pdTrendFrom(s, ['p300'])).toBe('consistent');
  });
});

// ─── Small pure helpers ──────────────────────────────────────────────────────

describe('ageFromDob', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('returns null for missing or malformed dates', () => {
    expect(ageFromDob(null, now)).toBeNull();
    expect(ageFromDob('not-a-date', now)).toBeNull();
  });

  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageFromDob('1974-08-31', now)).toBe(52);
    expect(ageFromDob('1974-09-01', now)).toBe(52);
    expect(ageFromDob('1974-09-02', now)).toBe(51);
  });
});

describe('ageFromBirthYear', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('reports the age reached this year', () => {
    expect(ageFromBirthYear(1974, now)).toBe(52);
    expect(ageFromBirthYear('1974', now)).toBe(52);
  });

  it('rejects anything that is not a plausible year', () => {
    expect(ageFromBirthYear(null, now)).toBeNull();
    expect(ageFromBirthYear('', now)).toBeNull();
    expect(ageFromBirthYear(1899, now)).toBeNull();
    expect(ageFromBirthYear(2101, now)).toBeNull();
    expect(ageFromBirthYear(1974.5, now)).toBeNull();
    expect(ageFromBirthYear('nineteen seventy four', now)).toBeNull();
  });

  it('rejects a year in the future rather than reporting a negative age', () => {
    expect(ageFromBirthYear(2030, now)).toBeNull();
  });
});

describe('ageFromProfile', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('is null when the athlete answered none of the three', () => {
    expect(ageFromProfile(null, now)).toBeNull();
    expect(ageFromProfile({}, now)).toBeNull();
    expect(
      ageFromProfile({ date_of_birth: null, birth_year: null, metrics_age: null }, now)
    ).toBeNull();
  });

  it('prefers the exact date when it is set', () => {
    // The date says 51 (birthday not yet reached); the year alone would say 52.
    expect(
      ageFromProfile({ date_of_birth: '1974-09-02', birth_year: 1974, metrics_age: 30 }, now)
    ).toBe(51);
  });

  it('falls through to birth_year, then to metrics_age', () => {
    expect(ageFromProfile({ birth_year: 1974, metrics_age: 30 }, now)).toBe(52);
    expect(ageFromProfile({ metrics_age: 44 }, now)).toBe(44);
  });

  it('falls past a source that is present but unusable', () => {
    expect(ageFromProfile({ date_of_birth: 'not-a-date', birth_year: 1986 }, now)).toBe(40);
    expect(ageFromProfile({ birth_year: 0, metrics_age: 44 }, now)).toBe(44);
  });

  it('holds metrics_age to migration 066 bounds rather than passing junk through', () => {
    expect(ageFromProfile({ metrics_age: 12 }, now)).toBeNull();
    expect(ageFromProfile({ metrics_age: 101 }, now)).toBeNull();
    expect(ageFromProfile({ metrics_age: 44.5 }, now)).toBeNull();
  });

  it('answers the masters gate the rules actually ask', () => {
    // The whole reason three columns are read: MST-2/3/4 gate on age >= 40,
    // and before birth_year existed only 3 of 63 profiles could reach them.
    expect(ageFromProfile({ birth_year: 1986 }, now) >= 40).toBe(true);
    expect(ageFromProfile({ birth_year: 1987 }, now) >= 40).toBe(false);
  });
});

describe('weeksUntil', () => {
  it('measures whole-ish weeks to the event', () => {
    expect(weeksUntil('2026-09-15', '2026-09-01')).toBe(2);
    expect(weeksUntil('2026-09-01', '2026-09-01')).toBe(0);
  });

  it('is null when either date is missing', () => {
    expect(weeksUntil(null, '2026-09-01')).toBeNull();
    expect(weeksUntil('2026-09-15', null)).toBeNull();
  });
});

describe('pickGoalRace', () => {
  const b = { name: 'B race', race_date: '2026-09-20', priority: 'B' };
  const a = { name: 'A race', race_date: '2026-11-01', priority: 'A' };

  it('prefers the soonest A race over a sooner B race', () => {
    expect(pickGoalRace([b, a]).name).toBe('A race');
  });

  it('falls back to the soonest race when there is no A', () => {
    expect(pickGoalRace([{ name: 'C', race_date: '2026-10-01', priority: 'C' }, b]).name).toBe('B race');
  });

  it('is null with no races', () => {
    expect(pickGoalRace([])).toBeNull();
    expect(pickGoalRace(null)).toBeNull();
  });
});

// ─── Rider context ───────────────────────────────────────────────────────────

describe('buildRiderContext', () => {
  it('speaks in plain words with no metric abbreviations', () => {
    const ctx = buildRiderContext({
      riderName: 'Travis',
      age: 52,
      goalRace: { name: 'Old Man Winter', race_date: '2026-10-13', race_type: 'gravel', priority: 'A' },
      todayStr: '2026-09-01',
      weeklyHours4wkMean: 8.25,
      load: { tfi: 62, afi: 76, form_score: -14 },
      evidenceSignals: {
        efficiency_factor: { qualified: true, score: 0 },
        power_duration: { qualified: true, movements: { p60: { attempted: true, movementPct: -9.2 } } },
      },
      lastActivity: { name: 'Sunday Gravel', distance: 64200, moving_time: 9300, average_watts: 198 },
    });

    expect(ctx).toContain('Travis');
    expect(ctx).toContain('Old Man Winter');
    expect(ctx).toContain('6 weeks out');
    expect(ctx).toContain('They are 52.');
    expect(ctx).toContain('8.3 hours a week');
    expect(ctx).toContain('carrying real training fatigue');
    expect(ctx).toContain('efficiency is holding steady');
    expect(ctx).toContain('short, sharp efforts are behind');
    expect(ctx).toContain('Sunday Gravel');

    for (const abbrev of [/\bTFI\b/, /\bAFI\b/, /\bFS\b/, /\bRSS\b/, /\bTSS\b/, /\bCTL\b/, /\bEF\b/]) {
      expect(ctx).not.toMatch(abbrev);
    }
  });

  it('omits age below 40, per the template', () => {
    const ctx = buildRiderContext({ age: 34, todayStr: '2026-09-01' });
    expect(ctx).not.toContain('They are 34');
  });

  it('drops a sentence rather than approximating a missing input', () => {
    const ctx = buildRiderContext({ todayStr: '2026-09-01' });
    expect(ctx).toContain('no goal event on the calendar');
    expect(ctx).not.toContain('hours a week');
    expect(ctx).not.toContain('On the load model');
    expect(ctx).not.toContain('Measured against');
    expect(ctx).not.toContain('most recent ride');
  });

  it('says so when the athlete has been off the bike', () => {
    const ctx = buildRiderContext({ todayStr: '2026-09-01', daysSinceLastRide: 25 });
    expect(ctx).toContain('have not ridden in 25 days');
  });

  it('never throws on an empty state', () => {
    expect(() => buildRiderContext()).not.toThrow();
    expect(() => buildRiderContext({})).not.toThrow();
  });
});
