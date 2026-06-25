/**
 * glanceCoachContext — turns the one `Today` object into the two things the
 * inline coach panel needs to feel *smart* rather than generic:
 *
 *   1. buildCoachContextString() — a compact, canonical-metric snapshot of
 *      exactly what the athlete is looking at (FS / TFI / AFI, plan block,
 *      race outlook, today's prescription). Sent to /api/coach as
 *      `trainingContext` so the coach grounds its answers in the same numbers
 *      on screen instead of re-deriving them.
 *
 *   2. buildSmartPrompts() — context-aware opening questions that pull the
 *      athlete into a "what / why / how am I progressing" conversation. These
 *      are derived from the live state (a detraining trend asks "why am I
 *      sliding?", an upcoming race asks "am I on track?"), so the panel always
 *      invites a conversation about the data actually in front of the user.
 *
 * Terminology stays canonical Tribos (FS / TFI / AFI / RSS) per types.ts.
 */

import type { Today } from './types';

export interface SmartPrompt {
  /** Short text for the chip. */
  label: string;
  /** The fuller question actually sent to the coach. */
  query: string;
}

/** A canonical-metric snapshot of the glance, for the coach's context window. */
export function buildCoachContextString(today: Today): string {
  const a = today.athleteState;
  const lines: string[] = [];
  lines.push(
    "ATHLETE'S TODAY GLANCE — this is exactly what they are looking at on screen right now (canonical Tribos metrics):",
  );

  if (a.fs != null) {
    const verdict = a.formVerdict ? ` — ${a.formVerdict}` : '';
    lines.push(`- Form Score (FS): ${Math.round(a.fs)} (${a.formWord})${verdict}`);
  }
  if (a.tfi != null) {
    const delta = Math.round(a.fitnessDelta28d);
    const trend =
      a.fitnessEmpty
        ? 'not enough data yet'
        : delta === 0
          ? 'flat over 28 days'
          : `${delta > 0 ? '+' : ''}${delta} TFI over 28 days`;
    lines.push(`- Fitness (TFI): ${Math.round(a.tfi)} (${a.fitnessWord}, ${trend})`);
  }
  if (a.afi != null) {
    lines.push(`- Fatigue (AFI): ${Math.round(a.afi)} (${a.fatigueWord})`);
  }
  if (today.planContext.chipLabel) {
    lines.push(`- Plan block: ${today.planContext.chipLabel}`);
  }
  if (today.outlook.line) {
    lines.push(`- Outlook: ${today.outlook.line}`);
  }
  const presc = today.prescription;
  lines.push(
    `- Today's session: ${today.heroState === 'rest' ? 'Rest day' : presc ? presc.title : 'No workout prescribed'}`,
  );

  return lines.join('\n');
}

/**
 * Up to four opening questions, prioritised by what's most worth talking about
 * given today's state. Covers the what (today's session), the why (fitness/form
 * trend) and the how (progress toward the goal race).
 */
export function buildSmartPrompts(today: Today): SmartPrompt[] {
  const a = today.athleteState;
  const out: SmartPrompt[] = [];
  const race = today.outlook.raceName;
  const days = today.outlook.daysToRace;

  // WHY — the fitness trend is the most charged thing on the page.
  if (!a.fitnessEmpty && a.fitnessDelta28d <= -3) {
    out.push({
      label: `Why am I ${a.fitnessWord.toLowerCase()}?`,
      query: `My fitness (TFI) is down ${Math.abs(Math.round(a.fitnessDelta28d))} points over the last 28 days and you're calling it "${a.fitnessWord}". Why is that happening, and does it matter${race ? ` with ${race} coming up` : ''}?`,
    });
  } else if (!a.fitnessEmpty && a.fitnessDelta28d >= 3) {
    out.push({
      label: 'Why is my fitness climbing?',
      query: `My fitness (TFI) is up ${Math.round(a.fitnessDelta28d)} points over the last 28 days. What's driving that, and how do I keep it going without digging a hole?`,
    });
  }

  // HOW — progress toward the goal race.
  if (race) {
    out.push({
      label: days != null ? `On track for ${race}?` : `Ready for ${race}?`,
      query: `Am I on track for ${race}${days != null ? `, ${days} days out` : ''}? Walk me through where my fitness and form are versus where they need to be.`,
    });
  }

  // WHAT — the rationale for today's prescription.
  if (today.heroState === 'rest') {
    out.push({
      label: 'Why rest today?',
      query: 'Why is today a rest day, and what should it actually accomplish given where my fitness and fatigue are right now?',
    });
  } else if (today.prescription) {
    out.push({
      label: `Why ${today.prescription.title.toLowerCase()} today?`,
      query: `Why is today's session "${today.prescription.title}"? How does it fit what my body needs right now and where I'm trying to get to?`,
    });
  }

  // Fallbacks to reach a useful minimum of choices.
  if (out.length < 3 && today.planContext.blockName) {
    out.push({
      label: `What's this ${today.planContext.blockName.toLowerCase()} block doing?`,
      query: `What is this ${today.planContext.blockName} block actually doing for me, and how will I know it's working?`,
    });
  }
  if (out.length < 3 && a.fs != null) {
    out.push({
      label: `Form is ${a.formWord.toLowerCase()} — add load?`,
      query: `My Form Score is ${Math.round(a.fs)} (${a.formWord}). Should I be adding training load right now or holding back?`,
    });
  }

  if (out.length === 0) {
    out.push(
      {
        label: 'How am I progressing?',
        query: 'How am I progressing in my training right now? What stands out in my recent fitness and form?',
      },
      {
        label: 'What should I focus on?',
        query: 'What should I focus on in my training over the next couple of weeks?',
      },
    );
  }

  return out.slice(0, 4);
}
