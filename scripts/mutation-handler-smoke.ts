/**
 * T2.3 dev smoke test — MutationHandlers.
 *
 * Temporary script (does not ship). Exercises `applyMutation` and
 * `applyMutations` end-to-end against the real RouterClient + routing
 * providers, so it needs network access and provider credentials in the
 * environment (Stadia / Mapbox keys via the usual VITE_* vars).
 *
 *   npx tsx scripts/mutation-handler-smoke.ts
 *
 * It is intentionally not wired into `npm run test` — it is a manual
 * sanity check for the composition seam, run once during T2.3 and then
 * left for reference until T2.5 supplies real callers.
 */

import {
  applyMutation,
  applyMutations,
} from '../src/routing/executor/MutationHandlers';
import type {
  Mutation,
  RouteContext,
  RouteSnapshot,
} from '../src/routing/executor/types';

// A synthetic loop around Erie, CO. Four waypoints, closes on itself.
const route: RouteSnapshot = {
  geometry: [
    [-105.0497, 40.0503],
    [-105.08, 40.07],
    [-105.045, 40.085],
    [-105.0497, 40.0503],
  ],
  waypoints: [
    { coordinate: [-105.0497, 40.0503] },
    { coordinate: [-105.08, 40.07] },
    { coordinate: [-105.045, 40.085] },
    { coordinate: [-105.0497, 40.0503] },
  ],
  stats: {
    distance_km: 12,
    elevation_gain_m: 180,
    elevation_loss_m: 180,
    duration_s: 2400,
  },
};

const context: RouteContext = {
  profile: 'road',
  shape: 'loop',
  training_goal: 'endurance',
  start_coord: [-105.0497, 40.0503],
  mapbox_token: process.env.VITE_MAPBOX_TOKEN ?? process.env.MAPBOX_TOKEN,
  speed_profile: { flat_kph: 25 },
};

interface SingleCase {
  name: string;
  mutation: Mutation;
}
interface CompositionalCase {
  name: string;
  mutations: Mutation[];
}
type SmokeCase = SingleCase | CompositionalCase;

const cases: SmokeCase[] = [
  {
    name: 'reduce_climbing moderate',
    mutation: { type: 'reduce_climbing', magnitude: 'moderate' },
  },
  {
    name: 'extend_distance 5km',
    mutation: { type: 'extend_distance', delta_km: 5 },
  },
  { name: 'reverse', mutation: { type: 'reverse_route' } },
  {
    name: 'change_climb_character (stub → mutation_not_supported)',
    mutation: { type: 'change_climb_character', target: 'punchy' },
  },
  {
    name: 'raw optimize_for (safety net → mutation_not_supported)',
    mutation: { type: 'optimize_for', criterion: 'scenery' },
  },
  {
    name: 'compositional reduce_climbing + extend_distance',
    mutations: [
      { type: 'reduce_climbing', magnitude: 'small' },
      { type: 'extend_distance', delta_km: 3 },
    ],
  },
];

async function main(): Promise<void> {
  for (const c of cases) {
    console.log(`\n=== ${c.name} ===`);
    const result =
      'mutations' in c
        ? await applyMutations(route, context, c.mutations)
        : await applyMutation(route, context, c.mutation);

    if (result.ok) {
      console.log(
        `  OK: ${result.route.stats.distance_km.toFixed(2)}km, ` +
          `${result.route.stats.elevation_gain_m}m gain`,
      );
      console.log(
        `  Provider: ${result.metadata.provider_used}, ` +
          `${result.metadata.duration_ms}ms, cache_hit=${result.metadata.cache_hit}`,
      );
    } else {
      console.log(`  FAIL: ${result.reason.kind}`);
      if (result.partial) {
        console.log(
          `  partial preserved: ${result.partial.stats.distance_km.toFixed(2)}km`,
        );
      }
    }
  }
}

main().catch((err) => {
  console.error('smoke test threw (this is a bug — handlers must never throw):', err);
  process.exitCode = 1;
});
