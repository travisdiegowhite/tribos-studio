/**
 * Schema validation for docs/coaching-bible/session-rules.yaml.
 *
 * Same house style as coachingRulesSchema.js: hand-written, runs at build
 * time and again in the drift test, collects every error before throwing.
 *
 * Session rules differ from coaching rules in two ways that the schema
 * reflects: they have no persona lines (the designer applies them, the model
 * never voices them directly), and they carry `params` — the numbers the
 * designer reads. A rule without params is documentation; a param the
 * designer reads that is not here is a bug.
 */

export const CONFIDENCE_LEVELS = ['settled', 'leaning', 'contested'];
export const FAMILIES = [
  'vo2max', 'threshold', 'sweet_spot', 'tempo', 'anaerobic', 'sprint',
  'racing', 'openers', 'endurance', 'all',
];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

function validateRule(rule, index, errors) {
  const where = `rules[${index}]${rule?.id ? ` (${rule.id})` : ''}`;
  if (!isObject(rule)) {
    errors.push(`${where}: not an object`);
    return;
  }
  if (typeof rule.id !== 'string' || !rule.id) errors.push(`${where}: id must be a non-empty string`);
  if (!FAMILIES.includes(rule.family)) errors.push(`${where}: family must be one of ${FAMILIES.join(' | ')}`);
  if (typeof rule.claim !== 'string' || !rule.claim) errors.push(`${where}: claim must be a non-empty string`);
  if (typeof rule.decides !== 'string' || !rule.decides) errors.push(`${where}: decides must say what the designer does with it`);
  if (!CONFIDENCE_LEVELS.includes(rule.confidence)) {
    errors.push(`${where}: confidence must be one of ${CONFIDENCE_LEVELS.join(' | ')}`);
  }
  if (!isStringArray(rule.citations) || rule.citations.length === 0) {
    errors.push(`${where}: citations must be a non-empty array of citation keys`);
  }
  if (rule.params !== undefined && !isObject(rule.params)) errors.push(`${where}: params must be an object`);
  if (rule.notes !== undefined && typeof rule.notes !== 'string') errors.push(`${where}: notes must be a string`);
}

/** Validate a parsed session-rules document and return it normalised. */
export function validateSessionRuleSet(doc) {
  const errors = [];
  if (!isObject(doc)) throw new Error('session-rules: document is not an object');
  if (doc.version !== 1) errors.push(`session-rules: unsupported version ${doc.version} (expected 1)`);
  if (!Array.isArray(doc.rules) || doc.rules.length === 0) {
    throw new Error('session-rules: rules must be a non-empty array');
  }
  doc.rules.forEach((rule, i) => validateRule(rule, i, errors));

  const ids = doc.rules.map((r) => r?.id).filter(Boolean);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) errors.push(`session-rules: duplicate rule ids: ${[...new Set(duplicates)].join(', ')}`);

  const citations = isObject(doc.citations) ? doc.citations : {};
  for (const rule of doc.rules) {
    for (const key of rule?.citations || []) {
      if (!(key in citations)) errors.push(`${rule.id}: citation "${key}" is not in the citations block`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`session-rules validation failed:\n  - ${errors.join('\n  - ')}`);
  }
  return {
    version: doc.version,
    rules: doc.rules.map((r) => ({ ...r, params: r.params || {} })),
    citations,
  };
}
