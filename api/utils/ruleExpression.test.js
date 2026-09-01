import { describe, it, expect } from 'vitest';
import { compileTrigger, parse, evaluate, mean, stddev, tokenize } from './ruleExpression.js';
import { COACHING_RULES } from './coachingRules.generated.js';

const run = (src, scope = {}) => compileTrigger(src).test(scope);

describe('tokenize', () => {
  it('refuses an unterminated string rather than guessing', () => {
    expect(() => tokenize("a == 'behind")).toThrow(/Unterminated/);
  });

  it('refuses a character the language does not have', () => {
    expect(() => tokenize('a % b')).toThrow(/Unexpected character/);
  });
});

describe('parse', () => {
  it('refuses trailing input', () => {
    expect(() => parse('a > 1 b')).toThrow(/Trailing input/);
  });

  it('gives && higher precedence than ||', () => {
    // false && false || true  →  (false && false) || true  →  true
    expect(run('a && b || c', { a: false, b: false, c: true })).toBe(true);
  });

  it('gives comparison higher precedence than &&', () => {
    expect(run('a > 1 && b < 2', { a: 5, b: 1 })).toBe(true);
  });

  it('respects parentheses around division', () => {
    expect(run('(x / y) > 2', { x: 10, y: 4 })).toBe(true);
    expect(run('(x / y) > 2', { x: 10, y: 6 })).toBe(false);
  });
});

// ─── The null rules. This is the section that keeps rules off athletes ───────

describe('null semantics', () => {
  it('never satisfies an ordering comparison against null', () => {
    // Plain JS would say null >= -1 is true and null <= 0 is true.
    expect(run('x >= 0', { x: null })).toBe(false);
    expect(run('x <= 0', { x: null })).toBe(false);
    expect(run('x > -1', { x: null })).toBe(false);
    expect(run('x < 100', { x: null })).toBe(false);
  });

  it('treats a missing field exactly like an explicit null', () => {
    expect(run('x >= 0', {})).toBe(false);
    expect(run('x == null', {})).toBe(true);
  });

  it('answers explicit null checks normally', () => {
    expect(run('x != null', { x: 0 })).toBe(true);
    expect(run('x != null', { x: null })).toBe(false);
    expect(run('x == null', { x: null })).toBe(true);
  });

  it('reads "not known to be true" as true — the illnessFlag case', () => {
    expect(run('illnessFlag != true', { illnessFlag: null })).toBe(true);
    expect(run('illnessFlag != true', { illnessFlag: false })).toBe(true);
    expect(run('illnessFlag != true', { illnessFlag: true })).toBe(false);
  });

  it('does not equate null with zero or with an empty string', () => {
    expect(run('x == 0', { x: null })).toBe(false);
    expect(run('x == 0', { x: 0 })).toBe(true);
  });

  it('compares strings exactly', () => {
    expect(run("t == 'behind'", { t: 'behind' })).toBe(true);
    expect(run("t == 'behind'", { t: 'consistent' })).toBe(false);
    expect(run("t == 'behind'", { t: null })).toBe(false);
  });

  it('short-circuits && so a guarded member access is safe', () => {
    expect(run('wellness != null && wellness.sleep <= 2', { wellness: null })).toBe(false);
    expect(run('wellness != null && wellness.sleep <= 2', { wellness: { sleep: 2 } })).toBe(true);
  });

  it('yields null from member access on null rather than throwing', () => {
    expect(evaluate(parse('a.b'), { a: null })).toBeNull();
    expect(evaluate(parse('a.b'), {})).toBeNull();
  });

  it('propagates null through arithmetic instead of coercing to zero', () => {
    expect(evaluate(parse('a / b'), { a: null, b: 2 })).toBeNull();
    expect(evaluate(parse('a / b'), { a: 4, b: null })).toBeNull();
  });

  it('does not divide by zero', () => {
    expect(evaluate(parse('a / b'), { a: 4, b: 0 })).toBeNull();
    expect(run('(a / b) > 2', { a: 4, b: 0 })).toBe(false);
  });

  it('reads array length', () => {
    expect(run('xs.length == 7', { xs: [1, 2, 3, 4, 5, 6, 7] })).toBe(true);
    expect(run('xs.length == 7', { xs: null })).toBe(false);
  });
});

describe('mean and stddev', () => {
  it('are population statistics', () => {
    expect(mean([60, 62, 58, 61, 60, 59, 63])).toBeCloseTo(60.4286, 3);
    expect(stddev([60, 62, 58, 61, 60, 59, 63])).toBeCloseTo(1.5907, 3);
  });

  it('are null for a non-list, an empty list, or a list with a hole', () => {
    expect(mean(null)).toBeNull();
    expect(stddev([])).toBeNull();
    expect(mean([1, null, 3])).toBeNull();
  });

  it('give zero deviation for a flat series, which the monotony rule guards on', () => {
    expect(stddev([50, 50, 50])).toBe(0);
    expect(run('stddev(xs) > 0', { xs: [50, 50, 50] })).toBe(false);
  });

  it('separates a flat week from a varied one', () => {
    const monotony = 'rss7d != null && rss7d.length == 7 && stddev(rss7d) > 0 && (mean(rss7d) / stddev(rss7d)) > 2.0';
    expect(run(monotony, { rss7d: [60, 62, 58, 61, 60, 59, 63] })).toBe(true);
    expect(run(monotony, { rss7d: [0, 110, 30, 0, 140, 45, 0] })).toBe(false);
  });

  it('refuses an unknown function rather than treating it as null', () => {
    expect(() => run('median(xs) > 1', { xs: [1, 2, 3] })).toThrow(/Unknown function/);
  });
});

describe('referencedFields', () => {
  it('lists every top-level field a trigger reads', () => {
    const t = compileTrigger('wellness != null && wellness.sleep <= 2 && hrvBelowBandDays == 0');
    expect(t.fields.sort()).toEqual(['hrvBelowBandDays', 'wellness']);
  });

  it('reaches inside function arguments', () => {
    expect(compileTrigger('mean(rss7d) > 1').fields).toEqual(['rss7d']);
  });
});

// ─── Every shipped trigger must actually parse ───────────────────────────────

describe('the shipped rules', () => {
  it('all compile', () => {
    for (const rule of COACHING_RULES.rules) {
      expect(() => compileTrigger(rule.trigger), `${rule.id}: ${rule.trigger}`).not.toThrow();
    }
  });

  it('all evaluate to false against an athlete with no data at all', () => {
    for (const rule of COACHING_RULES.rules) {
      expect(compileTrigger(rule.trigger).test({}), `${rule.id} fired on an empty state`).toBe(false);
    }
  });

  it('only read fields that exist on the RiderState contract', () => {
    const contract = new Set([
      'age', 'persona', 'goalType', 'weeksToEvent', 'weeklyHours4wkMean', 'fearOfFailureFlag',
      'tfi', 'afi', 'fs', 'rss7d', 'rss3wkMean',
      'midZoneShare4wk', 'hardSessions4wk', 'easySessions4wk', 'strengthSessions8wk', 'daysSinceLastRide',
      'efTrend', 'pdShortTrend', 'pdLongTrend',
      'freshVsFatiguedDrop5min', 'longRideDecoupling',
      'wellness', 'wellnessLowStreak', 'hrvBelowBandDays', 'hrvReadings7d', 'illnessFlag',
      'eventTempDeltaC',
    ]);
    for (const rule of COACHING_RULES.rules) {
      for (const field of compileTrigger(rule.trigger).fields) {
        expect(contract.has(field), `${rule.id} reads unknown field "${field}"`).toBe(true);
      }
    }
  });
});
