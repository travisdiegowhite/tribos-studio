/**
 * Copy for the comfort strip (shared by the routing landing and Route
 * Builder 2). Rider-facing comfort copy carries no absolutes ("never",
 * "always", "guaranteed"); comfortStripCopy.test.ts enforces it.
 */
import { comfortChip } from '../../utils/comfortLevels';
import type { ComfortLevel } from '../../utils/comfortLevels';

export const COMFORT_STRIP_COPY = {
  title: 'Comfort check',
  noData: 'Not enough road data to check this route against your comfort yet.',
  checking: 'Checking the roads…',
  legend: {
    within: 'Within your comfort',
    at: 'At your comfort',
    flagged: 'Above your comfort',
    unknown: 'Not mapped well enough to say',
  },
  showOnMap: 'Show on map',
} as const;

/** "82% within Comfort 2 · Easy" */
export function withinLine(withinPct: number, level: ComfortLevel): string {
  return `${Math.round(withinPct)}% within ${comfortChip(level)}`;
}

/** "No stretches above your comfort." / "2 stretches above your comfort." */
export function flaggedSummary(count: number): string {
  if (count === 0) return 'No stretches above your comfort.';
  if (count === 1) return 'One stretch above your comfort.';
  return `${count} stretches above your comfort.`;
}

/** "12% of the route isn't mapped well enough to say." — empty below 1%. */
export function unknownSummary(unknownPct: number): string {
  const pct = Math.round(unknownPct);
  return pct >= 1 ? `${pct}% of the route isn’t mapped well enough to say.` : '';
}

/** Every static string and sample of each template, for the copy test. */
export function allComfortStripCopy(): string[] {
  const out: string[] = [
    COMFORT_STRIP_COPY.title,
    COMFORT_STRIP_COPY.noData,
    COMFORT_STRIP_COPY.checking,
    COMFORT_STRIP_COPY.showOnMap,
    ...Object.values(COMFORT_STRIP_COPY.legend),
  ];
  for (const n of [0, 1, 3]) out.push(flaggedSummary(n));
  out.push(unknownSummary(12));
  for (const l of [1, 2, 3, 4, 5] as ComfortLevel[]) out.push(withinLine(80, l));
  return out;
}
