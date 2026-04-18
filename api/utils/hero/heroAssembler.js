/**
 * Today Hero — assembler.
 *
 * Pure function: takes a HeroContext + HeroVoiceResponse and produces a
 * HeroParagraph — a flat `HeroSegment[]` per spec §4.3.
 *
 * Ordering follows spec §4.9:
 *   opener → fitnessTrend → recentRide → blockInterpretation → forwardAction
 *
 * Segments are either plain text or highlighted values (numbers, race name).
 * The deterministic layer owns every digit; the AI voice layer never emits
 * numbers. Tone is applied by the renderer via a tone token.
 */

import { getArchetypeOverrides } from './archetypeOverrides.js';

// --- Segment helpers ----------------------------------------------------

const text = (value) => ({ kind: 'text', value });
const highlight = (value, tone) => ({ kind: 'highlight', value, tone: tone || 'neutral' });

// --- Tone mapping (spec §4.10) -----------------------------------------

function resolveTone(candidate, archetype) {
  const palette = getArchetypeOverrides(archetype).tonePalette;
  return palette.includes(candidate) ? candidate : 'neutral';
}

export function toneForFS(fs, archetype) {
  const t = getArchetypeOverrides(archetype).fsThresholds;
  let candidate;
  if (fs >= t.fresh) candidate = 'positive';
  else if (fs > t.fatigued) candidate = 'effort';
  else candidate = 'fatigue';
  return resolveTone(candidate, archetype);
}

export function toneForTrend(deltaPct, archetype) {
  if (deltaPct == null) return resolveTone('neutral', archetype);
  if (deltaPct > 0) return resolveTone('positive', archetype);
  if (deltaPct < 0) return resolveTone('fatigue', archetype);
  return resolveTone('neutral', archetype);
}

function trendWord(trend) {
  switch (trend) {
    case 'building': return 'building';
    case 'maintaining': return 'holding';
    case 'recovering': return 'recovering';
    case 'detraining': return 'drifting';
    default: return 'holding';
  }
}

// --- Slots --------------------------------------------------------------

function slotOpener(voice) {
  const opener = (voice.fields.opener || '').trim();
  if (!opener) return [];
  const withPeriod = /[.!?]$/.test(opener) ? opener : `${opener}.`;
  return [text(`${withPeriod} `)];
}

function slotFitnessTrend(ctx) {
  const delta = ctx.fitness?.tfiDelta28d;
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return [];

  const rounded = Math.round(delta);
  if (rounded === 0) {
    return [
      text('Fitness has held steady '),
      highlight('±0 points', resolveTone('neutral', ctx.archetype)),
      text(' over 28 days. '),
    ];
  }

  const sign = rounded > 0 ? '+' : '';
  const pointsLabel = `${sign}${rounded} ${Math.abs(rounded) === 1 ? 'point' : 'points'}`;
  const lead = rounded > 0 ? "You've added " : "You've shed ";
  return [
    text(lead),
    highlight(pointsLabel, toneForTrend(delta, ctx.archetype)),
    text(' over 28 days. '),
  ];
}

function slotRecentRide(ctx, voice) {
  const ride = ctx.lastRide;
  if (!ride) return [];

  const daysAgo = ctx.classification?.daysSinceLastRide ?? 0;
  const descriptor = (voice.fields.rideDescriptor || '').trim() || 'last session';
  const modifier = (voice.fields.intensityModifier || '').trim();
  const fsValue = Math.round(ctx.fitness?.fs ?? 0);
  const fsLabel = fsValue > 0 ? `+${fsValue}` : String(fsValue);
  const fsTone = toneForFS(fsValue, ctx.archetype);

  if (daysAgo <= 1) {
    const midClause = modifier
      ? `a ${descriptor} ${modifier}`
      : `a ${descriptor}`;
    return [
      text(`Last ride — ${midClause} — pushed form to `),
      highlight(fsLabel, fsTone),
      text('. '),
    ];
  }

  return [
    text(`Your last ride ${daysAgo} days back — a ${descriptor} — has you at `),
    highlight(fsLabel, fsTone),
    text('. '),
  ];
}

function slotBlockInterpretation(voice) {
  const body = (voice.fields.blockInterpretation || '').trim();
  if (!body) return [];
  return [text(`${body}. `)];
}

function slotForwardAction(ctx) {
  const overrides = getArchetypeOverrides(ctx.archetype);
  const race = ctx.nextAnchor?.type === 'race' ? ctx.nextAnchor : null;
  const remaining = Math.max(0, ctx.week.plannedCount - ctx.week.completedCount);
  const workoutWord = remaining === 1 ? 'workout' : 'workouts';

  if (race && typeof race.daysOut === 'number' && race.daysOut <= overrides.raceAnchorCutoff) {
    // Race-anchored template. Race name highlighted in neutral tone
    // (information, not judgement).
    return [
      text(`${remaining} ${workoutWord} left this week into `),
      highlight(race.label, resolveTone('neutral', ctx.archetype)),
      text('.'),
    ];
  }

  const word = trendWord(ctx.fitness?.trend);
  const sessionWord = remaining === 1 ? 'session' : 'sessions';
  return [text(`Fitness is ${word} — ${remaining} ${sessionWord} left this week to keep it moving.`)];
}

// --- Cold-start (spec §4.11) -------------------------------------------

function buildColdStartParagraph(ctx) {
  const name = ctx.rider?.firstName || 'rider';
  return [
    text(`Welcome, ${name}. `),
    text("There's no training plan yet — let's build one."),
  ];
}

// --- Public API ---------------------------------------------------------

/**
 * Assemble the HeroParagraph.
 *
 * @param {object} context - HeroContext
 * @param {object} voice - HeroVoiceResponse wrapper from heroVoice
 * @returns {{ paragraph: HeroSegment[], archetype: string, coldStart: boolean }}
 */
export function assembleHeroParagraph(context, voice) {
  if (context.coldStart?.active) {
    return {
      paragraph: buildColdStartParagraph(context),
      archetype: context.archetype,
      coldStart: true,
    };
  }

  const segments = [
    ...slotOpener(voice),
    ...slotFitnessTrend(context),
    ...slotRecentRide(context, voice),
    ...slotBlockInterpretation(voice),
    ...slotForwardAction(context),
  ];

  return {
    paragraph: segments,
    archetype: context.archetype,
    coldStart: false,
  };
}

/**
 * Collapse a HeroParagraph into a plain text string — for push notifications,
 * email digests, log lines, and accessibility fallbacks.
 */
export function toPlainText(paragraph) {
  if (!paragraph) return '';
  const segments = Array.isArray(paragraph) ? paragraph : paragraph.segments || [];
  return segments.map((s) => s?.value || '').join('').replace(/\s+/g, ' ').trim();
}

// --- Named exports kept for tests ---------------------------------------

export {
  slotOpener,
  slotFitnessTrend,
  slotRecentRide,
  slotBlockInterpretation,
  slotForwardAction,
  trendWord,
};
