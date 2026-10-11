/**
 * Season coach prompt — validation and prompt text for api/season-coach.js.
 *
 * The browser builds the payload from the season engine (src/lib/season/
 * coachPayload.ts): every date is pre-formatted and every week count comes
 * from the engine. This module only cleans that payload and turns it into
 * prompt text. The coach narrates the engine's numbers; it never computes one.
 */

import { PERSONA_DATA } from './personaData.js';
import { buildCoachVoiceRules } from './coachVoiceRules.js';

/** Request body ceiling (bytes of JSON). */
export const MAX_PAYLOAD_BYTES = 30_000;
const MAX_RACES = 60;
const MAX_CHANGES = 40;
const MAX_TEXT = 400;
const MAX_QUESTION = 500;

export class PayloadError extends Error {}

const text = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A clean copy of the browser's payload, or a PayloadError. */
export function sanitizePayload(raw) {
  if (!raw || typeof raw !== 'object') throw new PayloadError('Missing season payload.');
  if (!Array.isArray(raw.races)) throw new PayloadError('The season payload has no races list.');
  if (raw.races.length > MAX_RACES) throw new PayloadError(`Too many races (${raw.races.length}).`);
  const changes = Array.isArray(raw.changes) ? raw.changes.slice(0, MAX_CHANGES) : [];
  return {
    today: text(raw.today, 40),
    season: {
      from: text(raw.season?.from, 40),
      to: text(raw.season?.to, 40),
      typicalHours: numOrNull(raw.season?.typicalHours),
    },
    races: raw.races.map((r) => ({
      name: text(r?.name, 120) || 'Race',
      role: text(r?.role, 20),
      date: text(r?.date, 40),
      sport: text(r?.sport, 20),
      effort: text(r?.effort, 20),
      verdict: text(r?.verdict, 20),
      reason: text(r?.reason),
      buildWeeks: numOrNull(r?.buildWeeks),
      blockNote: text(r?.blockNote) || null,
    })),
    firstLook: raw.firstLook === true,
    changes: changes.map((c) => text(c?.text)).filter(Boolean),
    question: text(raw.question, MAX_QUESTION) || null,
  };
}

/** The payload as the user message: plain lines, nothing to compute. */
export function renderPayload(p) {
  const lines = [`Today is ${p.today}.`];
  lines.push(
    `The season runs ${p.season.from} to ${p.season.to}` +
      (p.season.typicalHours !== null ? `, planned around ${p.season.typicalHours} hours a week.` : '.'),
  );
  lines.push('', 'Upcoming races, as the season planner sees them:');
  if (p.races.length === 0) lines.push('- (none)');
  for (const r of p.races) {
    const build = r.buildWeeks !== null ? `, build ${r.buildWeeks} weeks` : '';
    lines.push(`- ${r.name} — ${r.date} — ${r.role} race, ${r.sport}, ${r.effort} effort — ${r.verdict}${build}. ${r.reason}`);
    if (r.blockNote) lines.push(`  ${r.blockNote}`);
  }
  lines.push('');
  if (p.firstLook) {
    lines.push('This is the first time we are discussing this season.');
  } else if (p.changes.length === 0) {
    lines.push('Nothing has changed since we last discussed the season.');
  } else {
    lines.push('What changed since we last discussed the season:');
    for (const c of p.changes) lines.push(`- ${c}`);
  }
  lines.push('');
  lines.push(p.question ? `The athlete asks: ${p.question}` : 'The athlete wants your read on the season as it stands now.');
  return lines.join('\n');
}

const RULES = `=== SEASON PLANNER RULES (NON-NEGOTIABLE) ===
- You are commenting on the athlete's season plan: the races they have planned and what the season planner computed for each.
- Use ONLY the dates, weekdays and week counts written in the message. Never compute, infer or convert a date, a weekday or a number of weeks. If something isn't in the message, don't state it.
- Answer in 2 to 4 sentences. Say what the latest change costs or buys, then give one concrete tradeoff or fix (move a race, change its priority, pick which back-to-back race matters more).
- If there were no changes, give your read of the season as it stands: the one thing most worth attention.
- Never contradict a verdict (On track, Tight, Conflict). If you would plan it differently, say what you would change instead.
- Talk about races, weeks and how the athlete will feel. No training-load metrics, and none of the old TrainingPeaks abbreviations listed in the vocabulary rules below.
- You can't change the plan yourself; the athlete makes changes in the season planner.`;

/** The persona block, built the way api/coach.js builds it. */
export function personaBlock(personaId, riderName) {
  const persona = personaId ? PERSONA_DATA[personaId] : null;
  if (!persona) return { name: null, block: '' };
  const rules = (persona.styleRules ?? []).map((r) => `- ${r}`).join('\n');
  const block = `=== COACHING PERSONA: ${persona.name.toUpperCase()} ===
You are ${persona.name}. Adopt this voice in every response — it overrides any generic tone.
Philosophy: ${persona.philosophy}
Voice: ${persona.voice}
${riderName ? `The athlete's preferred name is: ${riderName}` : ''}

STYLE RULES (non-negotiable, but the 2–4 sentence limit above still applies):
${rules}`;
  return { name: persona.name, block };
}

export function buildSeasonCoachSystemPrompt({ personaId = null, riderName = null } = {}) {
  const { name, block } = personaBlock(personaId, riderName);
  const intro = 'You are the athlete\'s cycling and endurance coach inside Tribos, looking at their season plan with them.';
  return {
    personaName: name,
    system: [intro, RULES, block, buildCoachVoiceRules({ correctionNotice: false })].filter(Boolean).join('\n\n'),
  };
}
