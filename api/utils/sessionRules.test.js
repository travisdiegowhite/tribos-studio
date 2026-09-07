import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { SESSION_RULES } from './sessionRules.generated.js';
import { validateSessionRuleSet } from './sessionRulesSchema.js';
import { FORMATS, ruleFor, ruleParam } from './sessionDesigner.js';

const YAML_PATH = join(process.cwd(), 'docs', 'coaching-bible', 'session-rules.yaml');

describe('sessionRules.generated.js', () => {
  it('is in sync with docs/coaching-bible/session-rules.yaml', () => {
    const fromYaml = validateSessionRuleSet(loadYaml(readFileSync(YAML_PATH, 'utf8')));
    expect(SESSION_RULES).toEqual(fromYaml);
  });

  it('cites every rule and resolves every citation', () => {
    for (const rule of SESSION_RULES.rules) {
      expect(rule.citations.length).toBeGreaterThan(0);
      for (const key of rule.citations) expect(SESSION_RULES.citations[key]).toBeTruthy();
    }
  });
});

describe('every designer format traces to a bible rule', () => {
  it('names a rule that exists, with a confidence grade', () => {
    for (const format of Object.values(FORMATS)) {
      const rule = ruleFor(format.rule);
      expect(rule, format.id).toBeTruthy();
      expect(['settled', 'leaning', 'contested']).toContain(rule.confidence);
    }
  });

  it('refuses an unknown rule or param loudly', () => {
    expect(() => ruleParam('SES-NOPE-1', 'x')).toThrow(/no rule/);
    expect(() => ruleParam('SES-CAL-1', 'nope')).toThrow(/no param/);
  });
});

describe('schema', () => {
  it('rejects a rule with no citations or an unknown family', () => {
    const doc = { version: 1, rules: [{ id: 'X-1', family: 'yoga', claim: 'c', decides: 'd', confidence: 'leaning', citations: [] }], citations: {} };
    expect(() => validateSessionRuleSet(doc)).toThrow(/family|citations/);
  });
});
