/**
 * Schema validation for the coaching-rules file.
 *
 * The brief asks for "zod or equivalent, whatever the project already uses".
 * The project uses neither zod nor a schema library — every validator in
 * `api/` is hand-written (see api/fatigue-checkin.js), so this matches the
 * house style and adds no runtime dependency to the serverless bundle.
 *
 * It runs at BUILD time (scripts/build-coaching-rules.mjs) and again in the
 * drift test, so a malformed rule fails the build, never a rider's request.
 * Errors are collected and thrown together — fixing one typo at a time
 * through six build runs is its own kind of broken.
 */

export const CONFIDENCE_LEVELS = ['settled', 'leaning', 'contested'];
export const PERSONAS = ['hammer', 'scientist', 'encourager', 'pragmatist', 'competitor'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

function validateRule(rule, index, errors) {
  const where = `rules[${index}]${rule?.id ? ` (${rule.id})` : ''}`;

  if (!isObject(rule)) {
    errors.push(`${where}: not an object`);
    return;
  }
  if (typeof rule.id !== 'string' || !rule.id) errors.push(`${where}: id must be a non-empty string`);
  if (typeof rule.priority !== 'number' || !Number.isFinite(rule.priority)) {
    errors.push(`${where}: priority must be a number`);
  }
  if (typeof rule.trigger !== 'string' || !rule.trigger.trim()) {
    errors.push(`${where}: trigger must be a non-empty expression string`);
  }
  if (typeof rule.claim !== 'string' || !rule.claim) errors.push(`${where}: claim must be a non-empty string`);
  if (!CONFIDENCE_LEVELS.includes(rule.confidence)) {
    errors.push(`${where}: confidence must be one of ${CONFIDENCE_LEVELS.join(' | ')}`);
  }
  if (rule.citations !== undefined && !isStringArray(rule.citations)) {
    errors.push(`${where}: citations must be an array of strings`);
  }
  if (rule.never_say !== undefined && !isStringArray(rule.never_say)) {
    errors.push(`${where}: never_say must be an array of strings`);
  }
  if (rule.params !== undefined && !isObject(rule.params)) {
    errors.push(`${where}: params must be an object`);
  }

  // A rule the coach cannot voice in the athlete's chosen persona is a rule
  // that would silently fall back to someone else's voice.
  if (!isObject(rule.persona_lines)) {
    errors.push(`${where}: persona_lines must be an object`);
  } else {
    for (const persona of PERSONAS) {
      if (typeof rule.persona_lines[persona] !== 'string' || !rule.persona_lines[persona]) {
        errors.push(`${where}: persona_lines.${persona} is missing`);
      }
    }
    for (const key of Object.keys(rule.persona_lines)) {
      if (!PERSONAS.includes(key)) errors.push(`${where}: persona_lines.${key} is not a known persona`);
    }
  }
}

function validateEval(fixture, index, errors) {
  const where = `evals[${index}]${fixture?.name ? ` (${fixture.name})` : ''}`;

  if (!isObject(fixture)) {
    errors.push(`${where}: not an object`);
    return;
  }
  if (typeof fixture.name !== 'string' || !fixture.name) errors.push(`${where}: name must be a non-empty string`);
  if (!isObject(fixture.state)) errors.push(`${where}: state must be an object`);
  if (fixture.mustFire !== undefined && !isStringArray(fixture.mustFire)) {
    errors.push(`${where}: mustFire must be an array of rule ids`);
  }
  if (fixture.mustNotFire !== undefined && !isStringArray(fixture.mustNotFire)) {
    errors.push(`${where}: mustNotFire must be an array of rule ids`);
  }
  if (fixture.expectOrder !== undefined && !isStringArray(fixture.expectOrder)) {
    errors.push(`${where}: expectOrder must be an array of rule ids`);
  }
  if (fixture.expectInjectedCount !== undefined && typeof fixture.expectInjectedCount !== 'number') {
    errors.push(`${where}: expectInjectedCount must be a number`);
  }
  if (fixture.expectParam !== undefined) {
    if (!isObject(fixture.expectParam) || typeof fixture.expectParam.rule !== 'string') {
      errors.push(`${where}: expectParam must be an object with a "rule" key`);
    }
  }
}

/**
 * Validate a parsed rules document and return it normalised.
 * Throws with every problem listed, rather than the first.
 */
export function validateRuleSet(doc) {
  const errors = [];

  if (!isObject(doc)) throw new Error('coaching-rules: document is not an object');
  if (doc.version !== 1) errors.push(`coaching-rules: unsupported version ${doc.version} (expected 1)`);
  if (!Array.isArray(doc.rules) || doc.rules.length === 0) {
    throw new Error('coaching-rules: rules must be a non-empty array');
  }

  doc.rules.forEach((rule, i) => validateRule(rule, i, errors));

  const ids = doc.rules.map((r) => r?.id).filter(Boolean);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    errors.push(`coaching-rules: duplicate rule ids: ${[...new Set(duplicates)].join(', ')}`);
  }

  const evals = Array.isArray(doc.evals) ? doc.evals : [];
  evals.forEach((fixture, i) => validateEval(fixture, i, errors));

  // A fixture naming a rule that no longer exists silently stops testing
  // anything — that is how a rename quietly drops coverage.
  const known = new Set(ids);
  for (const fixture of evals) {
    for (const key of ['mustFire', 'mustNotFire', 'expectOrder']) {
      for (const id of fixture?.[key] || []) {
        if (!known.has(id)) errors.push(`evals (${fixture.name}): ${key} names unknown rule "${id}"`);
      }
    }
    if (fixture?.expectParam?.rule && !known.has(fixture.expectParam.rule)) {
      errors.push(`evals (${fixture.name}): expectParam names unknown rule "${fixture.expectParam.rule}"`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`coaching-rules validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    version: doc.version,
    rules: doc.rules,
    evals,
    citations: isObject(doc.citations) ? doc.citations : {},
  };
}
