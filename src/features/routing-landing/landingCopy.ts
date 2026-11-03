/**
 * Every fixed string the routing landing shows, in one place so the copy
 * test can check them (no "never", "always" or "guaranteed"; no LTS or
 * metric vocabulary). Comfort-level text is NOT here: it comes from
 * src/utils/comfortLevels.ts.
 */

import { PRODUCT_NAME } from '../../utils/product';
import { formatMiles } from '../../utils/comfortLadder';
import type { ComfortLevel } from '../../utils/comfortLevels';

const MI_M = 1609.344;

export const LANDING_COPY = {
  headline: 'Bike routes on roads you’ll actually want to ride.',
  subline: 'Pick a start and a distance. Every road on your route is checked for traffic first.',
  startLabel: 'Start from',
  startPlaceholder: 'An address, a park, a town',
  useLocation: 'Use my location',
  locating: 'Finding you…',
  distanceLegend: 'How far',
  surfaceLegend: 'Riding on',
  comfortLegend: 'Traffic comfort',
  submit: 'Make my route',
  submitting: 'Checking roads…',
  free: 'Free. No account needed to make a route.',
  needStart: 'Pick a start point first.',
  proofs: [
    { title: 'Every road scored', body: 'Speed, lanes, bike lanes and shoulders, checked on every stretch.' },
    { title: 'No surprise highways', body: 'Roads above your comfort are kept off or flagged with a heads-up.' },
    { title: 'Straight to your bike computer', body: 'Send it to Garmin or Wahoo, or download the GPX.' },
  ],
  firstVisit: {
    stamp: 'New here',
    title: `What ${PRODUCT_NAME} does`,
    body: `${PRODUCT_NAME} builds bike loops from where you are, on roads that match how much traffic you’re happy riding with. Tell it a start and a distance, and it does the rest.`,
    points: [
      'Pick how calm you want the roads, from paths and quiet streets to the direct way.',
      'Every route shows how much of it sits within your comfort, and flags the rest.',
      'Ride it from your bike computer. An account is optional.',
    ],
    dismiss: 'Got it',
  },
  result: {
    withinSuffix: 'of this ride within your comfort',
    noFlagged: 'No flagged stretches.',
    downloadGpx: 'Download GPX',
    tryAnother: 'Try a different loop',
    headsUp: 'Heads up',
    alternativesTitle: 'No loop at your comfort at this distance and shape. These ones are:',
    useThis: 'Ride this one',
    refusedTryLevel: (level: ComfortLevel) => `Try Comfort ${level}`,
    shorterLoop: 'Ride the shorter loop',
    nearbyStart: 'Start from the nearby spot',
    engineError: 'We couldn’t reach the routing service. Try again in a moment.',
  },
  legend: {
    within: 'Within your comfort',
    at: 'At your comfort',
    flagged: 'Flagged stretch',
    unknown: 'Speed limit not mapped',
  },
} as const;

/** "One short flagged stretch, shown below." */
export function flaggedLine(count: number): string {
  if (count === 0) return LANDING_COPY.result.noFlagged;
  if (count === 1) return 'One short flagged stretch, shown below.';
  return `${count} short flagged stretches, shown below.`;
}

/** "Heads up · mile 11" */
export function headsUpTitle(start_m: number): string {
  return `${LANDING_COPY.result.headsUp} · mile ${Math.max(1, Math.round(start_m / MI_M))}`;
}

export function stretchLength(length_m: number): string {
  return formatMiles(length_m);
}

/** Every static string, for the copy test. */
export function allLandingCopy(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') {
      for (const l of [1, 2, 3, 4, 5]) out.push(String((v as (n: number) => string)(l)));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(LANDING_COPY);
  for (const n of [0, 1, 3]) out.push(flaggedLine(n));
  out.push(headsUpTitle(17_000));
  return out;
}
