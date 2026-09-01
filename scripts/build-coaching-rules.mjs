#!/usr/bin/env node
/**
 * Generate api/utils/coachingRules.generated.js from the coaching bible YAML.
 *
 *   npm run build:rules
 *
 * WHY GENERATE instead of reading the YAML at runtime:
 *
 * 1. Vercel bundles a serverless function from its import graph. A
 *    `readFileSync('docs/coaching-bible/coaching-rules.yaml')` is not an
 *    import, so the file can be absent from the deployed lambda — the coach
 *    would lose every rule in production while passing every test locally.
 *    A plain ESM import cannot be left behind.
 * 2. It keeps js-yaml a devDependency instead of shipping a parser into the
 *    function.
 * 3. Validation runs here, at author time, where a broken rule is a failed
 *    build rather than a broken coach.
 *
 * docs/coaching-bible/coaching-rules.yaml stays the human source of truth.
 * coachingRules.test.js re-parses it and fails if the generated file has
 * drifted, so forgetting to run this is a red test, not a silent stale rule.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { validateRuleSet } from '../api/utils/coachingRulesSchema.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const YAML_PATH = join(ROOT, 'docs', 'coaching-bible', 'coaching-rules.yaml');
export const OUT_PATH = join(ROOT, 'api', 'utils', 'coachingRules.generated.js');

/** Parse + validate the YAML. Exported so the drift test uses the same path. */
export function loadRuleSetFromYaml(path = YAML_PATH) {
  const parsed = loadYaml(readFileSync(path, 'utf8'));
  return validateRuleSet(parsed);
}

function render(ruleSet) {
  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: docs/coaching-bible/coaching-rules.yaml
 * Regenerate: npm run build:rules
 *
 * coachingRules.test.js fails if this file and the YAML disagree.
 */

export const COACHING_RULES = ${JSON.stringify(ruleSet, null, 2)};

export default COACHING_RULES;
`;
}

function main() {
  const ruleSet = loadRuleSetFromYaml();
  writeFileSync(OUT_PATH, render(ruleSet), 'utf8');
  console.log(
    `Wrote ${OUT_PATH} — ${ruleSet.rules.length} rules, ${ruleSet.evals.length} eval fixtures.`
  );
}

if (process.argv[1] && process.argv[1].endsWith('build-coaching-rules.mjs')) {
  main();
}
