/**
 * How a session card on the training calendar is coloured.
 *
 * Colour shows INTENSITY, in four groups on the zone ramp; the card's shape
 * shows the SPORT (runs get a double rule). Strength, core, mobility and yoga
 * are "support": a dashed grey rule and no wash, so the day's key ride or run
 * leads. See the 2026-11 "Calendar card options" mock, option B.
 *
 * A session the athlete chose to skip is 'skipped' whatever its type: a
 * dashed muted rule and no wash, so it reads as set aside rather than missed.
 */

export type SessionTone = 'recovery' | 'endurance' | 'tempo' | 'hard' | 'support' | 'neutral' | 'skipped';

const TONE_BY_TYPE: Record<string, SessionTone> = {
  recovery: 'recovery',
  endurance: 'endurance',
  long_ride: 'endurance',
  tempo: 'tempo',
  sweet_spot: 'tempo',
  threshold: 'hard',
  vo2max: 'hard',
  anaerobic: 'hard',
  climbing: 'hard',
  racing: 'hard',
  hill_repeats: 'hard',
  intervals: 'hard',
  strength: 'support',
  core: 'support',
  flexibility: 'support',
  mobility: 'support',
  yoga: 'support',
};

export function sessionTone(
  workoutType: string | null | undefined,
  sport?: string | null,
  skipped = false,
): SessionTone {
  if (skipped) return 'skipped';
  if (sport === 'other') return 'support';
  return (workoutType && TONE_BY_TYPE[workoutType]) || 'neutral';
}

export interface SessionToneStyle {
  /** Colour of the left rule. */
  rule: string;
  /** Background wash, or undefined for plain paper. */
  wash?: string;
  /** Colour for the RSS figure. Magenta only from threshold up. */
  rssColor: string;
}

const RULE: Record<SessionTone, string> = {
  recovery: 'var(--chart-bar)',
  endurance: 'var(--color-accent)',
  tempo: 'var(--color-highlight)',
  hard: 'var(--color-signal)',
  support: 'var(--color-border)',
  neutral: 'var(--color-ink-border)',
  skipped: 'var(--color-text-muted)',
};

// Lime is pale, so it needs more pigment than the others to read as a wash.
const WASH_PCT: Partial<Record<SessionTone, number>> = {
  recovery: 10,
  endurance: 7,
  tempo: 20,
  hard: 9,
};

export function sessionToneStyle(tone: SessionTone): SessionToneStyle {
  const pct = WASH_PCT[tone];
  return {
    rule: RULE[tone],
    wash: pct ? `color-mix(in srgb, ${RULE[tone]} ${pct}%, transparent)` : undefined,
    rssColor: tone === 'hard'
      ? 'var(--color-signal-text)'
      : tone === 'skipped' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
  };
}

/** Left-edge style for a session: double for runs, dashed for support work. */
export function sessionRuleBorder(tone: SessionTone, sport?: string | null): string {
  const { rule } = sessionToneStyle(tone);
  if (tone === 'support' || tone === 'skipped') return `2px dashed ${rule}`;
  if (sport === 'running') return `5px double ${rule}`;
  return `3px solid ${rule}`;
}
