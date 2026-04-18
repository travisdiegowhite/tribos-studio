/**
 * Today Hero — assembler.
 *
 * Pure function: takes a HeroContext + HeroVoiceResponse and produces the
 * HeroParagraph that the dashboard renders. Ordering follows the spec:
 *   opener → ride reference → block context → week forecast → next anchor.
 *
 * Each output segment carries a semantic source tag ('opener', 'ride', ...)
 * and a tone tag ('positive' | 'neutral' | 'caution' | 'warning') the UI
 * uses to colour the paragraph subtly without ever bolding metric values.
 */

import { getArchetypeOverrides } from './archetypeOverrides.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayNameFromIsoDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return DAY_NAMES[d.getUTCDay()];
}

function capitalizeFirst(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function endsWithPunctuation(value) {
  return /[.!?]$/.test((value || '').trim());
}

function ensureSentence(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return endsWithPunctuation(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Tone mapping for each source slot, driven by classification + voice flags.
 */
function toneForRide(intensityVsExpected) {
  switch (intensityVsExpected) {
    case 'above': return 'caution';
    case 'below': return 'caution';
    case 'near': return 'positive';
    case 'unplanned': return 'neutral';
    default: return 'neutral';
  }
}

function toneForWeek(weekPosture) {
  switch (weekPosture) {
    case 'ahead': return 'positive';
    case 'on_track': return 'positive';
    case 'behind': return 'warning';
    default: return 'neutral';
  }
}

function toneForForm(formState) {
  switch (formState) {
    case 'fresh': return 'positive';
    case 'fatigued': return 'caution';
    case 'deeply_fatigued': return 'warning';
    default: return 'neutral';
  }
}

/**
 * Build the ride-reference sentence.
 * Uses Haiku's rideDescriptor + intensityModifier slots where supplied.
 */
function buildRideSegment(context, voice, overrides) {
  if (!context.lastRide) return null;

  const daysSince = context.classification.daysSinceLastRide;
  const prefix = overrides.slotTemplates.ridePrefix || 'Yesterday';
  const dayLabel = daysSince === 0
    ? 'Today'
    : daysSince === 1
      ? prefix
      : `${daysSince} days back`;

  const descriptor = (voice.fields.rideDescriptor || '').trim();
  const intensityMod = (voice.fields.intensityModifier || '').trim();

  // Sentence shape: "<DayLabel> was a <descriptor> — <intensityNote>."
  // We avoid em-dashes (forbidden) and stick to commas / periods.
  let body = '';
  if (descriptor) {
    body = `${dayLabel.toLowerCase()} was a ${descriptor}`;
  } else {
    body = `${dayLabel.toLowerCase()} you rode`;
  }

  const intensity = context.classification.intensityVsExpected;
  if (intensity === 'above') body += ', a touch over the target';
  else if (intensity === 'below') body += ', a little under the target';
  else if (intensity === 'near' && context.lastRidePlannedMatch) body += ', right on plan';

  if (intensityMod) body += `, ${intensityMod}`;

  const sentence = `${capitalizeFirst(body)}.`;
  return {
    type: 'ride',
    text: sentence,
    tone: toneForRide(intensity),
  };
}

/**
 * Build the block/phase sentence from Haiku's blockInterpretation slot plus
 * the deterministic phase name from derivePhase().
 */
function buildBlockSegment(context, voice, overrides) {
  const phaseName = context.plan?.blockName;
  const interpretation = (voice.fields.blockInterpretation || '').trim();
  const prefix = overrides.slotTemplates.blockPrefix || 'Block';

  if (!phaseName && !interpretation) return null;

  let body = '';
  if (phaseName && interpretation) {
    body = `${prefix}: ${phaseName.toLowerCase()} — ${interpretation}`;
  } else if (phaseName) {
    body = `${prefix}: ${phaseName.toLowerCase()}`;
  } else {
    body = interpretation;
  }

  // Replace any accidental em-dash (shouldn't happen after validation).
  body = body.replace(/—/g, ',');
  return {
    type: 'block',
    text: ensureSentence(capitalizeFirst(body)),
    tone: toneForForm(context.classification.formState),
  };
}

/**
 * Build the week-forecast sentence.
 */
function buildWeekSegment(context, overrides) {
  const { plannedCount, completedCount, posture } = context.week;
  const prefix = overrides.slotTemplates.weekPrefix || 'This week';

  if (plannedCount === 0) {
    return {
      type: 'week',
      text: `${prefix}: no planned workouts on the calendar yet.`,
      tone: 'neutral',
    };
  }

  const remaining = Math.max(0, plannedCount - completedCount);

  let body;
  if (posture === 'ahead') {
    body = `${prefix}, you are ahead of schedule with ${remaining === 0 ? 'everything' : `${remaining} left`}`;
  } else if (posture === 'behind') {
    body = `${prefix}, you are behind plan with ${remaining} left`;
  } else {
    body = `${prefix}, ${remaining === 0 ? 'everything is done' : `${remaining} left on the calendar`}`;
  }

  // Strip digits per hero rules (numbers belong on the metric strip, not in prose).
  body = body.replace(/\d+/g, (match) => {
    const n = Number(match);
    return wordForCount(n);
  });

  return {
    type: 'week',
    text: ensureSentence(capitalizeFirst(body)),
    tone: toneForWeek(posture),
  };
}

function wordForCount(n) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  if (n >= 0 && n <= 10) return words[n];
  return 'several';
}

/**
 * Build the "next anchor" sentence: race if within cutoff, else next workout,
 * else a soft CTA.
 */
function buildAnchorSegment(context, overrides) {
  const prefix = overrides.slotTemplates.anchorPrefix || 'Next';

  if (context.raceAnchor) {
    const days = context.raceAnchor.days_until;
    const dayWord = wordForCount(days);
    if (days === 0) {
      return {
        type: 'anchor',
        text: `${prefix}: race day is today — trust the prep.`.replace(/—/g, ','),
        tone: 'positive',
      };
    }
    const raceTypeLabel = (context.raceAnchor.race_type || 'race').toLowerCase();
    return {
      type: 'anchor',
      text: ensureSentence(`${prefix}: your ${raceTypeLabel} sits ${dayWord} days out`),
      tone: 'positive',
    };
  }

  if (context.nextWorkout) {
    const day = dayNameFromIsoDate(context.nextWorkout.scheduledDate);
    const name = (context.nextWorkout.name || 'the next planned ride').toLowerCase();
    const when = day ? `on ${day.toLowerCase()}` : 'next';
    return {
      type: 'anchor',
      text: ensureSentence(`${prefix}: ${name} ${when}`),
      tone: 'neutral',
    };
  }

  return {
    type: 'anchor',
    text: `${prefix}: pick a ride that fits and get it on the calendar.`,
    tone: 'neutral',
  };
}

/**
 * Build the opener segment. Cold-start messages come from archetype overrides.
 */
function buildOpenerSegment(context, voice) {
  const openerText = (voice.fields.opener || '').trim();
  if (!openerText) return null;
  return {
    type: 'opener',
    text: ensureSentence(openerText),
    tone: toneForForm(context.classification.formState),
  };
}

/**
 * Cold-start paragraph — skips Haiku and returns a deterministic,
 * CTA-forward paragraph made of three segments.
 */
function assembleColdStart(context, voice, overrides) {
  const segments = [];

  segments.push({
    type: 'opener',
    text: ensureSentence(voice.fields.opener || overrides.fallbacks.coldStart),
    tone: 'neutral',
  });

  if (!context.coldStart.hasActivePlan) {
    segments.push({
      type: 'cta',
      text: 'Pick a training plan to give the week a shape.',
      tone: 'neutral',
    });
  }

  if (!context.coldStart.hasRecentActivity) {
    segments.push({
      type: 'cta',
      text: 'Connect Strava or Garmin so fresh rides land here automatically.',
      tone: 'neutral',
    });
  }

  return segments;
}

/**
 * Assemble the HeroParagraph.
 *
 * @param {object} context - HeroContext
 * @param {object} voice - HeroVoiceResponse
 * @returns {{ segments: HeroSegment[], archetype: string, coldStart: boolean }}
 */
export function assembleHeroParagraph(context, voice) {
  const overrides = getArchetypeOverrides(context.archetype);

  if (context.coldStart?.active) {
    return {
      segments: assembleColdStart(context, voice, overrides),
      archetype: context.archetype,
      coldStart: true,
    };
  }

  const segments = [];

  const opener = buildOpenerSegment(context, voice);
  if (opener) segments.push(opener);

  const ride = buildRideSegment(context, voice, overrides);
  if (ride) segments.push(ride);

  const block = buildBlockSegment(context, voice, overrides);
  if (block) segments.push(block);

  const week = buildWeekSegment(context, overrides);
  if (week) segments.push(week);

  const anchor = buildAnchorSegment(context, overrides);
  if (anchor) segments.push(anchor);

  return {
    segments,
    archetype: context.archetype,
    coldStart: false,
  };
}

export {
  buildOpenerSegment,
  buildRideSegment,
  buildBlockSegment,
  buildWeekSegment,
  buildAnchorSegment,
  wordForCount,
};
