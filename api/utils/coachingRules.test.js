import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { COACHING_RULES } from './coachingRules.generated.js';
import { validateRuleSet, PERSONAS } from './coachingRulesSchema.js';
import {
  evaluateRules,
  selectInjectedRules,
  resolveParams,
  MAX_INJECTED_RULES,
} from './rulesEngine.js';
import { buildFiredRulesBlock } from './coachingBible.js';

// vitest runs from the repo root; import.meta.url is an http URL under jsdom.
const YAML_PATH = join(process.cwd(), 'docs', 'coaching-bible', 'coaching-rules.yaml');

// ─── The generated file must match the YAML ──────────────────────────────────

describe('coachingRules.generated.js', () => {
  it('is in sync with docs/coaching-bible/coaching-rules.yaml', () => {
    const fromYaml = validateRuleSet(loadYaml(readFileSync(YAML_PATH, 'utf8')));
    expect(COACHING_RULES).toEqual(fromYaml);
  });

  it('carries every rule and eval fixture', () => {
    expect(COACHING_RULES.rules.length).toBeGreaterThan(0);
    expect(COACHING_RULES.evals.length).toBeGreaterThan(0);
  });
});

// ─── Phase 2 "done when": every eval fixture in the YAML passes ──────────────
//
// Each fixture is a partial RiderState; unspecified fields are null. That
// default matters — the engine must treat "not measured" as "do not fire",
// and a fixture that quietly inherited a value from a previous case would
// hide exactly that bug.

const RIDER_STATE_FIELDS = [
  'age', 'persona', 'goalType', 'weeksToEvent', 'weeklyHours4wkMean', 'fearOfFailureFlag',
  'tfi', 'afi', 'fs', 'rss7d', 'rss3wkMean',
  'midZoneShare4wk', 'hardSessions4wk', 'easySessions4wk', 'strengthSessions8wk', 'daysSinceLastRide',
  'efTrend', 'pdShortTrend', 'pdLongTrend',
  'freshVsFatiguedDrop5min', 'longRideDecoupling',
  'wellness', 'wellnessLowStreak', 'hrvBelowBandDays', 'hrvReadings7d', 'illnessFlag',
  'eventTempDeltaC',
];

function fixtureState(partial) {
  const state = {};
  for (const field of RIDER_STATE_FIELDS) state[field] = null;
  return { ...state, ...partial };
}

describe('eval fixtures from coaching-rules.yaml', () => {
  for (const fixture of COACHING_RULES.evals) {
    it(fixture.name, () => {
      const state = fixtureState(fixture.state);
      const { fired } = evaluateRules(state);
      const firedIds = fired.map((r) => r.id);
      const injected = selectInjectedRules(fired);
      const injectedIds = injected.map((r) => r.id);

      for (const id of fixture.mustFire || []) {
        expect(firedIds, `${fixture.name}: ${id} must fire`).toContain(id);
      }
      for (const id of fixture.mustNotFire || []) {
        expect(firedIds, `${fixture.name}: ${id} must not fire`).not.toContain(id);
      }

      if (fixture.expectOrder) {
        const positions = fixture.expectOrder.map((id) => firedIds.indexOf(id));
        expect(positions.every((p) => p >= 0), `${fixture.name}: expectOrder ids all fired`).toBe(true);
        expect(positions, `${fixture.name}: expectOrder`).toEqual([...positions].sort((a, b) => a - b));
      }

      if (fixture.expectInjectedCount !== undefined) {
        expect(injectedIds).toHaveLength(fixture.expectInjectedCount);
        // A mustFire rule that fires but gets dropped for budget never
        // reaches the coach, so it has to survive the cut too.
        for (const id of fixture.mustFire || []) {
          expect(injectedIds, `${fixture.name}: ${id} survives the top-${MAX_INJECTED_RULES} cut`).toContain(id);
        }
      }

      if (fixture.expectParam) {
        const { rule: ruleId, ...expected } = fixture.expectParam;
        const hit = fired.find((r) => r.id === ruleId);
        expect(hit, `${fixture.name}: ${ruleId} fired`).toBeTruthy();
        for (const [key, value] of Object.entries(expected)) {
          expect(hit.params?.[key], `${fixture.name}: ${ruleId}.${key}`).toBe(value);
        }
      }

      // Whatever fires must be sayable in this athlete's voice.
      for (const rule of fired) {
        expect(rule.personaLine).toBeTruthy();
        expect(rule.personaLine).not.toMatch(/\{\{/);
      }
    });
  }
});

// ─── Engine behaviour the fixtures do not pin down ───────────────────────────

describe('evaluateRules', () => {
  const empty = fixtureState({ persona: 'hammer' });

  it('fires nothing for an athlete with no data', () => {
    const { fired } = evaluateRules(empty);
    expect(fired).toEqual([]);
  });

  it('explains a rule it could not evaluate as missing_input, not not_triggered', () => {
    const { skipped } = evaluateRules(empty);
    const strength = skipped.find((s) => s.id === 'MST-3-strength');
    expect(strength.reason).toBe('missing_input');
    expect(strength.fields).toContain('age');
    expect(strength.fields).toContain('strengthSessions8wk');
  });

  it('says not_triggered when every input was present and the answer was no', () => {
    const state = fixtureState({ persona: 'hammer', age: 30, strengthSessions8wk: 0 });
    const { skipped } = evaluateRules(state);
    expect(skipped.find((s) => s.id === 'MST-3-strength').reason).toBe('not_triggered');
  });

  it('never approximates a missing strength count as zero', () => {
    // The live cross_training_activities table is empty, so a mapped-to-zero
    // strengthSessions8wk would fire MST-3 at every masters athlete forever.
    const state = fixtureState({ persona: 'hammer', age: 55, strengthSessions8wk: null });
    const { fired } = evaluateRules(state);
    expect(fired.map((r) => r.id)).not.toContain('MST-3-strength');
  });

  it('sorts readiness above prescription and is stable on ties', () => {
    const state = fixtureState({
      persona: 'hammer',
      illnessFlag: true,
      midZoneShare4wk: 0.5,
      hardSessions4wk: 0,
      age: 50,
      strengthSessions8wk: 0,
    });
    const ids = evaluateRules(state).fired.map((r) => r.id);
    expect(ids[0]).toBe('RDY-3-skip');
    expect(ids.indexOf('TID-1-middle')).toBeLessThan(ids.indexOf('MST-3-strength'));
  });

  it('voices a rule in the athlete persona', () => {
    const state = fixtureState({ persona: 'encourager', age: 47, daysSinceLastRide: 25 });
    const rule = evaluateRules(state).fired.find((r) => r.id === 'MST-4-return');
    expect(rule.personaLine).toBe(
      "The break's over and the good news is fitness returns quickly. Nothing fancy — just ride this week."
    );
  });

  it('falls back to the pragmatist voice when no persona is set', () => {
    const state = fixtureState({ persona: null, age: 47, daysSinceLastRide: 25 });
    const rule = evaluateRules(state).fired.find((r) => r.id === 'MST-4-return');
    expect(rule.personaLine).toContain("You lost some, you'll get it back");
  });

  it('skips a rule whose persona line has an unresolvable placeholder', () => {
    // DUR-2's scientist line interpolates {{decouple_pct}}. Contrived: fire
    // the rule with the value the line needs absent.
    const compiled = {
      variants: [],
      rules: [
        {
          id: 'FAKE-1',
          priority: 1,
          claim: 'c',
          confidence: 'leaning',
          neverSay: [],
          personaLines: Object.fromEntries(PERSONAS.map((p) => [p, 'drifted {{decouple_pct}}%'])),
          params: null,
          trigger: { fields: [], test: () => true },
        },
      ],
    };
    const { fired, skipped } = evaluateRules(fixtureState({ persona: 'scientist' }), compiled);
    expect(fired).toEqual([]);
    expect(skipped[0]).toEqual({ id: 'FAKE-1', reason: 'missing_input', fields: ['personaLine'] });
  });

  it('fills a placeholder when the value is there', () => {
    const state = fixtureState({ persona: 'scientist', longRideDecoupling: 0.084 });
    const rule = evaluateRules(state).fired.find((r) => r.id === 'DUR-2-decoupling');
    expect(rule.personaLine).toContain('about 8%');
  });

  it('never throws on a null or malformed state', () => {
    expect(() => evaluateRules(null)).not.toThrow();
    expect(() => evaluateRules({})).not.toThrow();
    expect(() => evaluateRules({ wellness: 'not an object' })).not.toThrow();
  });
});

describe('resolveParams', () => {
  const params = { volume_cut_default: 0.5, volume_cut_low_volume: 0.3, keep_hard_sessions_per_week: 1 };

  it('takes the default when no variant applies', () => {
    expect(resolveParams(params, { weeklyHours4wkMean: 9 })).toEqual({
      volume_cut: 0.5,
      keep_hard_sessions_per_week: 1,
    });
  });

  it('takes the low-volume variant under six hours a week', () => {
    expect(resolveParams(params, { weeklyHours4wkMean: 5 }).volume_cut).toBe(0.3);
  });

  it('keeps the default when weekly hours are unknown', () => {
    expect(resolveParams(params, { weeklyHours4wkMean: null }).volume_cut).toBe(0.5);
  });

  it('does not mistake a plain key ending in a word for a variant', () => {
    expect(resolveParams(params, {}).keep_hard_sessions_per_week).toBe(1);
  });

  it('is null for a rule with no params', () => {
    expect(resolveParams(null, {})).toBeNull();
  });
});

// ─── The rules reach the prompt in the template's shape ──────────────────────

describe('fired rules reach the prompt block', () => {
  it('renders a real fired rule the way the template specifies', () => {
    const state = fixtureState({ persona: 'competitor', weeksToEvent: 2, rss3wkMean: 420, weeklyHours4wkMean: 9 });
    const injected = selectInjectedRules(evaluateRules(state).fired);
    const block = buildFiredRulesBlock(injected);

    expect(block).toContain('RULE TPR-1-taper — confidence: settled');
    expect(block).toContain('Claim: Cut the hours, keep the sharp stuff');
    expect(block).toContain('Say it like this: Taper starts now.');
    expect(block).toContain('Never say: rest completely / take the week off / no intensity');
    expect(block).not.toContain('No specific rule fires today');
  });

  it('never leaks a citation key into the prompt', () => {
    const state = fixtureState({ persona: 'hammer', age: 52, pdShortTrend: 'behind', efTrend: 'consistent' });
    const block = buildFiredRulesBlock(selectInjectedRules(evaluateRules(state).fired));
    for (const key of Object.keys(COACHING_RULES.citations)) {
      expect(block).not.toContain(key);
    }
    expect(block).not.toMatch(/\b(19|20)\d{2};\d/); // journal volume:page form
  });
});
