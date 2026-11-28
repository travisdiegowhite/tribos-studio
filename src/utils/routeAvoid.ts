/**
 * The rider's "Avoid" toggles in Route Builder 2 (Phase 2,
 * docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md §3.2): unpaved surfaces and main
 * roads. Ferries are avoided on every route already (ferryGuard.js), and how
 * busy a road may be is the comfort level's job.
 *
 * Read from either preference shape the routers receive (flat, or nested
 * under routingPreferences).
 */
export interface AvoidOptions {
  unpaved: boolean;
  mainRoads: boolean;
}

export const NO_AVOID: AvoidOptions = { unpaved: false, mainRoads: false };

export function avoidOptionsOf(preferences: unknown): AvoidOptions {
  const p = preferences as { avoid?: Partial<AvoidOptions>; routingPreferences?: { avoid?: Partial<AvoidOptions> } } | null;
  const src = p?.routingPreferences?.avoid ?? p?.avoid ?? null;
  return { unpaved: !!src?.unpaved, mainRoads: !!src?.mainRoads };
}
