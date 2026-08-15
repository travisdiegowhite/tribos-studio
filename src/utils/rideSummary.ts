/**
 * rideSummary — the plain-language reading of a completed activity.
 *
 * Thesis P2 (docs/TRIBOS_THESIS_AUDIT_2026-08.md): the ride detail surface
 * leads with a sentence saying what the ride was; the number tiles beneath it
 * are the citations. Built from data the modal already has — duration, the
 * ride-intensity zone, and the stored pacing strategy.
 */

export interface RideSummaryInput {
  durationSec: number;
  /** Intensity zone name from getIFZone(), e.g. 'Endurance', 'Tempo'. */
  intensityZoneName?: string | null;
  /** ride_analytics.pacing.strategy, e.g. 'negative_split'. */
  pacingStrategy?: string | null;
  isRun?: boolean;
}

const PACING_CLAUSES: Record<string, string> = {
  negative_split: 'you got stronger as it went',
  even_split: 'held at a steady effort throughout',
  positive_split: 'with some fade in the back half',
  positive_split_heavy: 'with a heavy power fade late',
};

function durationPhrase(durationSec: number): string | null {
  if (!Number.isFinite(durationSec) || durationSec < 60) return null;
  const totalMin = Math.round(durationSec / 60);
  if (totalMin < 75) return `${totalMin}-minute`;
  const halfHours = Math.round(totalMin / 30);
  const h = Math.floor(halfHours / 2);
  return halfHours % 2 === 0 ? `${h}-hour` : `${h}½-hour`;
}

/**
 * One sentence describing the activity, or null when there isn't enough data
 * to say anything honest (the surface should render nothing rather than pad).
 */
export function buildRideSummary(input: RideSummaryInput): string | null {
  const dur = durationPhrase(input.durationSec);
  if (!dur) return null;

  const noun = input.isRun ? 'run' : 'ride';
  const zone = input.intensityZoneName?.toLowerCase() ?? null;
  const base = zone ? `A ${dur} ${zone} ${noun}` : `A ${dur} ${noun}`;
  const pacing = input.pacingStrategy ? PACING_CLAUSES[input.pacingStrategy] : undefined;
  return pacing ? `${base} — ${pacing}.` : `${base}.`;
}
