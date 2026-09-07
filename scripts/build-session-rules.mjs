#!/usr/bin/env node
/**
 * Generate api/utils/sessionRules.generated.js from the bible's session
 * construction rules.
 *
 *   npm run build:session-rules
 *
 * Generated for the same reason coachingRules is (see
 * scripts/build-coaching-rules.mjs): a YAML read is not an import, so the
 * file can be missing from the deployed lambda; an ESM import cannot be.
 * sessionRules.test.js fails if this file and the YAML disagree.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { validateSessionRuleSet } from '../api/utils/sessionRulesSchema.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const YAML_PATH = join(ROOT, 'docs', 'coaching-bible', 'session-rules.yaml');
export const OUT_PATH = join(ROOT, 'api', 'utils', 'sessionRules.generated.js');

export function loadSessionRulesFromYaml(path = YAML_PATH) {
  return validateSessionRuleSet(loadYaml(readFileSync(path, 'utf8')));
}

function render(ruleSet) {
  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: docs/coaching-bible/session-rules.yaml
 * Regenerate: npm run build:session-rules
 *
 * sessionRules.test.js fails if this file and the YAML disagree.
 */

export const SESSION_RULES = ${JSON.stringify(ruleSet, null, 2)};

export default SESSION_RULES;
`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const ruleSet = loadSessionRulesFromYaml();
  writeFileSync(OUT_PATH, render(ruleSet));
  console.log(`session-rules: wrote ${ruleSet.rules.length} rules to ${OUT_PATH}`);
}
