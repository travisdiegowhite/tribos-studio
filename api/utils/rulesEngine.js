/**
 * The coaching rules engine — Phase 2.
 *
 *   evaluateRules(riderState) → { fired: FiredRule[], skipped: SkippedRule[] }
 *
 * Pure. No I/O, no LLM call, no database access. Given the same RiderState it
 * returns the same rules, which is the whole reason the decision lives here
 * and not in the prompt: the engine decides, the model voices.
 *
 * Rules come from docs/coaching-bible/coaching-rules.yaml via the generated
 * module (see scripts/build-coaching-rules.mjs for why it is generated).
 * Triggers are evaluated by the safe expression walker in ruleExpression.js —
 * never by eval().
 *
 * A rule that does not fire is reported, not dropped:
 *   reason 'missing_input'  — its trigger reads a field that is null. This is
 *                             the brief's rule: skip, never approximate.
 *   reason 'not_triggered'  — every input was present and the answer was no.
 *
 * The caller injects at most three fired rules (see MAX_INJECTED_RULES). They
 * come back sorted by priority, and because every readiness rule is priority
 * 1–5 while every prescription is 10+, a readiness call always outranks a
 * prescription without needing a special case.
 */

import { COACHING_RULES } from './coachingRules.generated.js';
import { compileTrigger } from './ruleExpression.js';
import { PERSONAS } from './coachingRulesSchema.js';

/** The prompt gets at most this many. Say one or two things well. */
export const MAX_INJECTED_RULES = 3;

/**
 * When the athlete has not chosen a persona yet, voice rules as the
 * Pragmatist — the same fallback every other coach surface uses
 * (PERSONA_DATA[personaId] || PERSONA_DATA.pragmatist).
 */
export const DEFAULT_PERSONA = 'pragmatist';

/**
 * Parameter variants.
 *
 * A rule's `params` may offer `<name>_default` plus one or more
 * `<name>_<variant>` alternatives; the variant wins when its condition holds.
 * TPR-1-taper uses this for the taper depth, and its YAML comment names the
 * condition ("when weeklyHours4wkMean < 6"). The condition lives here rather
 * than in the YAML so the rules file stays exactly as the founder authored it;
 * moving it into the YAML later is a small, mechanical change.
 *
 * Keys with no `_default` sibling — `keep_hard_sessions_per_week` — are passed
 * through untouched.
 */
export const PARAM_VARIANTS = {
  low_volume: 'weeklyHours4wkMean != null && weeklyHours4wkMean < 6',
};

/**
 * Values a persona line may interpolate with `{{name}}`. A line whose
 * placeholder cannot be resolved would reach the model with the braces still
 * in it, so the rule is skipped instead.
 */
const LINE_VARS = {
  drop_pct: (s) => (s.freshVsFatiguedDrop5min == null ? null : Math.round(s.freshVsFatiguedDrop5min * 100)),
  decouple_pct: (s) => (s.longRideDecoupling == null ? null : Math.round(s.longRideDecoupling * 100)),
};

const PLACEHOLDER = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

// ─── Compilation (once, at module load) ──────────────────────────────────────

function compileRuleSet(ruleSet) {
  const variants = Object.entries(PARAM_VARIANTS).map(([name, expr]) => ({
    name,
    trigger: compileTrigger(expr),
  }));

  const rules = ruleSet.rules.map((rule) => ({
    id: rule.id,
    priority: rule.priority,
    claim: rule.claim,
    confidence: rule.confidence,
    neverSay: rule.never_say || [],
    personaLines: rule.persona_lines,
    params: rule.params || null,
    trigger: compileTrigger(rule.trigger),
  }));

  return { rules, variants };
}

const COMPILED = compileRuleSet(COACHING_RULES);

// ─── Parameter resolution ────────────────────────────────────────────────────

export function resolveParams(params, riderState, variants = COMPILED.variants) {
  if (!params) return null;

  const bases = Object.keys(params)
    .filter((k) => k.endsWith('_default'))
    .map((k) => k.slice(0, -'_default'.length));

  const consumed = new Set();
  const out = {};

  for (const base of bases) {
    consumed.add(`${base}_default`);
    let value = params[`${base}_default`];
    for (const variant of variants) {
      const key = `${base}_${variant.name}`;
      if (!(key in params)) continue;
      consumed.add(key);
      if (variant.trigger.test(riderState)) value = params[key];
    }
    out[base] = value;
  }

  for (const [key, value] of Object.entries(params)) {
    if (!consumed.has(key)) out[key] = value;
  }

  return out;
}

// ─── Persona line ────────────────────────────────────────────────────────────

/**
 * Resolve the line for this athlete's persona and fill its placeholders.
 * Returns null when a placeholder has no value — the caller skips the rule.
 */
export function resolvePersonaLine(personaLines, riderState) {
  const persona = PERSONAS.includes(riderState?.persona) ? riderState.persona : DEFAULT_PERSONA;
  const line = personaLines?.[persona];
  if (!line) return null;

  let missing = false;
  const filled = line.replace(PLACEHOLDER, (match, name) => {
    const resolver = LINE_VARS[name];
    const value = resolver ? resolver(riderState) : null;
    if (value == null) {
      missing = true;
      return match;
    }
    return String(value);
  });

  return missing ? null : filled;
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

function nullFields(fields, riderState) {
  return fields.filter((f) => riderState?.[f] === null || riderState?.[f] === undefined);
}

/**
 * @param {object} riderState  a RiderState (see IMPLEMENTATION-BRIEF.md)
 * @param {object} [compiled]  override the compiled rule set (tests only)
 * @returns {{ fired: Array, skipped: Array }}
 */
export function evaluateRules(riderState, compiled = COMPILED) {
  const state = riderState || {};
  const fired = [];
  const skipped = [];

  for (const rule of compiled.rules) {
    let matched;
    try {
      matched = rule.trigger.test(state);
    } catch (err) {
      // A trigger that cannot be evaluated is a broken rule, not a fired one.
      skipped.push({ id: rule.id, reason: 'trigger_error', detail: err.message });
      continue;
    }

    if (!matched) {
      const missing = nullFields(rule.trigger.fields, state);
      skipped.push(
        missing.length > 0
          ? { id: rule.id, reason: 'missing_input', fields: missing }
          : { id: rule.id, reason: 'not_triggered' }
      );
      continue;
    }

    const personaLine = resolvePersonaLine(rule.personaLines, state);
    if (!personaLine) {
      // Fired on the data, but there is no sayable line — a placeholder had
      // no value. Voicing "{{drop_pct}}" at an athlete is worse than silence.
      skipped.push({ id: rule.id, reason: 'missing_input', fields: ['personaLine'] });
      continue;
    }

    fired.push({
      id: rule.id,
      claim: rule.claim,
      confidence: rule.confidence,
      personaLine,
      neverSay: rule.neverSay,
      priority: rule.priority,
      params: resolveParams(rule.params, state, compiled.variants),
    });
  }

  fired.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return { fired, skipped };
}

/** The at-most-three the prompt actually receives. */
export function selectInjectedRules(fired, max = MAX_INJECTED_RULES) {
  return (fired || []).slice(0, max);
}

/** Rule ids that fired but were dropped for budget — worth a server log. */
export function droppedRuleIds(fired, max = MAX_INJECTED_RULES) {
  return (fired || []).slice(max).map((r) => r.id);
}

export { COACHING_RULES };
