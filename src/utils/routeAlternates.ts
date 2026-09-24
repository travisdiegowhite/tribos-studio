/**
 * routeAlternates — more than one line through the same waypoints, and the
 * calmest one the rider's Road comfort setting allows.
 *
 * Traffic stress (trafficStress.ts) used to be measured and reported only;
 * the router still returned whatever Valhalla liked first. Here a primary
 * route is joined by candidates for the same waypoints — Valhalla's own
 * alternates when the request had two locations (the only case Stadia
 * returns them), and BRouter whole-route lines (`trekking`, plus `safety`
 * for a "Quiet" rider) which work for any number of waypoints and carry
 * their tag rows, so their stress costs no extra network — and each is
 * measured. `pickCalmest` then switches away from the primary only for a
 * clear win inside a detour allowance.
 */

import { getBRouterDirections as getBRouterDirectionsJs, BROUTER_PROFILES } from './brouter';
import { measureRouteStress } from './roadAttributes';
import { maxLtsForTolerance, type StressSummary, type FacilitySummary, type TrafficTolerance } from './trafficStress';
import type { TaggedWay } from './wayTags';

export interface RouteCandidateLike {
  coordinates: ReadonlyArray<ReadonlyArray<number>>;
  distance_m?: number;
  distance?: number;
  source?: string;
  profile?: string;
  taggedWays?: TaggedWay[] | null;
  stressSummary?: StressSummary | null;
  facilitySummary?: FacilitySummary | null;
  alternates?: RouteCandidateLike[];
  [key: string]: unknown;
}

const getBRouterDirections = getBRouterDirectionsJs as unknown as (
  waypoints: Array<[number, number]>,
  options: { profile: string; tolerance?: TrafficTolerance | null },
) => Promise<Record<string, unknown> | null>;

/** Per-candidate cap on the stress measurement so a slow re-ride can't stall a snap. */
export const STRESS_MEASURE_TIMEOUT_MS = 4000;
/** Switch only when the calm metric drops by at least this many km … */
const MIN_GAIN_KM = 0.3;
/** … or by this share of the primary's metric. */
const MIN_GAIN_SHARE = 0.2;
/** Weight of the average stress term next to the km-over-tolerance term. */
const STRESS_TERM_WEIGHT = 0.25;
/** Lines whose calm metric is within this of the best are tied; bike-lane share decides. */
const TIE_KM = 0.1;

/** How much longer than the primary a calmer line may be. */
export function detourAllowance(tolerance: TrafficTolerance | null | undefined): number {
  switch (tolerance) {
    case 'low':
      return 0.25;
    case 'high':
      return 0.05;
    default:
      return 0.15;
  }
}

/** Km ridden above the highest LTS the rider is happy with. */
export function kmOverTolerance(
  summary: StressSummary,
  tolerance: TrafficTolerance | null | undefined,
): number {
  const max = maxLtsForTolerance(tolerance);
  let km = 0;
  for (const lts of [1, 2, 3, 4] as const) {
    if (lts > max) km += summary.kmByLts[lts] ?? 0;
  }
  return km;
}

/**
 * Lower is calmer: km over tolerance, plus a share of the average stress
 * over the known distance so two lines with nothing over tolerance still
 * prefer the quieter one.
 */
export function calmMetric(
  summary: StressSummary,
  tolerance: TrafficTolerance | null | undefined,
): number {
  return kmOverTolerance(summary, tolerance) + STRESS_TERM_WEIGHT * summary.stressScore * summary.knownKm;
}

export interface CalmPick {
  index: number;
  considered: number;
  km_over_before: number;
  km_over_after: number;
  extra_km: number;
}

function distanceMOf(c: RouteCandidateLike): number {
  const d = c.distance_m ?? c.distance;
  return typeof d === 'number' && Number.isFinite(d) ? d : 0;
}

/**
 * Pick the calmest eligible candidate. Eligible: measured, and no longer
 * than the primary plus the detour allowance. The primary keeps its place
 * on ties, on marginal gains, and whenever it was not measured itself.
 */
export function pickCalmest(
  candidates: ReadonlyArray<RouteCandidateLike>,
  tolerance: TrafficTolerance | null | undefined,
  primaryIndex = 0,
): CalmPick {
  const primary = candidates[primaryIndex];
  const round = (n: number) => Math.round(n * 100) / 100;
  const keep = (before: number): CalmPick => ({
    index: primaryIndex,
    considered: candidates.length,
    km_over_before: round(before),
    km_over_after: round(before),
    extra_km: 0,
  });
  if (!primary?.stressSummary) return keep(0);
  const before = calmMetric(primary.stressSummary, tolerance);
  const beforeOver = kmOverTolerance(primary.stressSummary, tolerance);
  const primaryM = distanceMOf(primary);
  const maxM = primaryM > 0 ? primaryM * (1 + detourAllowance(tolerance)) : Infinity;

  const facilityPct = (c: RouteCandidateLike) => c.facilitySummary?.facilityPct ?? 0;
  let bestIndex = primaryIndex;
  let best = before;
  candidates.forEach((c, i) => {
    if (i === primaryIndex || !c.stressSummary) return;
    if (distanceMOf(c) > maxM) return;
    const m = calmMetric(c.stressSummary, tolerance);
    // Clearly calmer wins; within TIE_KM the line with more bike lane /
    // shoulder wins; an exact tie keeps the incumbent.
    if (m < best - TIE_KM || (Math.abs(m - best) <= TIE_KM && facilityPct(c) > facilityPct(candidates[bestIndex]))) {
      best = Math.min(m, best);
      bestIndex = i;
    }
  });

  const gain = before - best;
  if (bestIndex === primaryIndex || gain < Math.max(MIN_GAIN_KM, MIN_GAIN_SHARE * before)) {
    return keep(beforeOver);
  }
  const chosen = candidates[bestIndex];
  return {
    index: bestIndex,
    considered: candidates.length,
    km_over_before: round(beforeOver),
    km_over_after: round(kmOverTolerance(chosen.stressSummary!, tolerance)),
    extra_km: round((distanceMOf(chosen) - primaryM) / 1000),
  };
}

/** Attach `stressSummary` to every candidate, in parallel, each capped. */
export async function measureCandidates<T extends RouteCandidateLike>(
  candidates: ReadonlyArray<T>,
): Promise<T[]> {
  return Promise.all(
    candidates.map(async (c) => {
      if (c.stressSummary) return c;
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeout = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), STRESS_MEASURE_TIMEOUT_MS);
        });
        const result = await Promise.race([
          measureRouteStress(c.coordinates as Array<[number, number]>, { taggedWays: c.taggedWays ?? null }),
          timeout,
        ]);
        return { ...c, stressSummary: result?.summary ?? null, facilitySummary: result?.facility ?? null };
      } catch {
        return { ...c, stressSummary: null };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }),
  );
}

/** BRouter profiles worth trying next to a primary for this tolerance. */
export function brouterCandidateProfiles(tolerance: TrafficTolerance | null | undefined): string[] {
  if (tolerance === 'high') return [];
  return tolerance === 'low'
    ? [BROUTER_PROFILES.TREKKING, BROUTER_PROFILES.SAFETY]
    : [BROUTER_PROFILES.TREKKING];
}

export interface GatherOptions {
  tolerance: TrafficTolerance | null | undefined;
  /** Test seam. */
  fetchBRouter?: typeof getBRouterDirections;
}

/**
 * `[primary, ...primary.alternates, ...BRouter lines]`, every one measured.
 * A BRouter profile the primary already is (BRouter fallback case) is not
 * requested twice. Fail-soft: a failed candidate is simply absent.
 */
export async function gatherCandidates(
  waypoints: ReadonlyArray<ReadonlyArray<number>>,
  primary: RouteCandidateLike,
  options: GatherOptions,
): Promise<RouteCandidateLike[]> {
  const fetchBRouter = options.fetchBRouter ?? getBRouterDirections;
  const pts = waypoints.map(([lng, lat]) => [lng, lat] as [number, number]);
  const { alternates: primaryAlternates, ...primaryOnly } = primary;
  const candidates: RouteCandidateLike[] = [primaryOnly, ...(primaryAlternates ?? [])];

  const primaryIsBRouter = typeof primary.source === 'string' && primary.source.startsWith('brouter');
  const profiles = brouterCandidateProfiles(options.tolerance).filter(
    (p) => !(primaryIsBRouter && primary.profile === p),
  );
  const brouterResults = await Promise.all(
    profiles.map(async (profile) => {
      try {
        // The tolerance lets a Tribos-enabled client render trekking at the
        // rider's comfort (safety stays the quiet variant).
        const r = await fetchBRouter(pts, { profile, tolerance: options.tolerance ?? null });
        if (!r || !Array.isArray(r.coordinates) || (r.coordinates as unknown[]).length < 2) return null;
        const distance_m = (r.distance_m ?? r.distance) as number | undefined;
        const duration_s = (r.duration_s ?? r.duration) as number | undefined;
        const elevation = r.elevation as { ascent?: number; descent?: number } | undefined;
        return {
          coordinates: r.coordinates as Array<[number, number]>,
          distance_m,
          duration_s,
          distance: distance_m,
          duration: duration_s,
          elevationGain: (r.elevationGain as number | undefined) ?? elevation?.ascent ?? 0,
          elevationLoss: (r.elevationLoss as number | undefined) ?? elevation?.descent ?? 0,
          confidence: 0.9,
          profile,
          source: 'brouter',
          taggedWays: (r.taggedWays as TaggedWay[] | undefined) ?? [],
        } satisfies RouteCandidateLike;
      } catch {
        return null;
      }
    }),
  );
  for (const r of brouterResults) if (r) candidates.push(r);

  return measureCandidates(candidates);
}
