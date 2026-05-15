/**
 * T2.5 dev smoke test — Executor facade.
 *
 * Temporary script (does not ship). Exercises all four facade methods
 * end-to-end against the real RouterClient + routing providers, so it
 * needs network access and provider credentials in the environment
 * (Stadia / Mapbox keys via the usual VITE_* vars).
 *
 *   npx tsx scripts/executor-smoke.ts
 *
 * Confirms the facade actually works as a single import point, that
 * cold-start `generate()` produces a route, that the 3-alternative
 * path produces three distinct routes, and that the passthrough
 * methods still work end-to-end via the facade.
 */

import { getExecutor } from '../src/routing/executor';
import type {
  ExecutorResult,
  Mutation,
  RouteContext,
} from '../src/routing/executor';

const context: RouteContext = {
  profile: 'road',
  shape: 'loop',
  training_goal: 'endurance',
  start_coord: [-105.0497, 40.0503],
  mapbox_token: process.env.VITE_MAPBOX_TOKEN ?? process.env.MAPBOX_TOKEN,
  speed_profile: { flat_kph: 25 },
};

function describe(label: string, result: ExecutorResult): void {
  if (result.ok) {
    console.log(
      `  ${label}: OK — ${result.route.stats.distance_km.toFixed(2)}km, ` +
        `${result.route.stats.elevation_gain_m}m gain ` +
        `(provider=${result.metadata.provider_used}, ${result.metadata.duration_ms}ms)`,
    );
  } else {
    console.log(`  ${label}: FAIL — ${result.reason.kind}`);
  }
}

async function main(): Promise<void> {
  const executor = getExecutor();

  console.log('\n=== generate(count: 1) — cold start ===');
  const single = await executor.generate(context, {
    goal: 'endurance',
    duration_minutes: 90,
  });
  describe('single', single);

  console.log('\n=== generate(count: 3) — alternatives ===');
  const alts = await executor.generate(
    context,
    { goal: 'endurance', duration_minutes: 90 },
    3,
  );
  alts.forEach((alt, i) => describe(`alt[${i}]`, alt));

  if (!single.ok) {
    console.log('\nSingle generate failed; skipping mutation / manual smoke tests.');
    return;
  }

  console.log('\n=== applyMutation via facade ===');
  const mutation: Mutation = { type: 'reduce_climbing', magnitude: 'moderate' };
  const modified = await executor.applyMutation(single.route, context, mutation);
  describe('reduce_climbing moderate', modified);

  console.log('\n=== applyManualAction(reverse_route) via facade ===');
  const reversed = await executor.applyManualAction(
    single.route,
    context,
    'reverse_route',
    { action: 'reverse_route' },
  );
  describe('reverse_route', reversed);

  console.log('\n=== applyMutations compositional via facade ===');
  const composed = await executor.applyMutations(single.route, context, [
    { type: 'reduce_climbing', magnitude: 'small' },
    { type: 'extend_distance', delta_km: 3 },
  ]);
  describe('reduce_climbing + extend_distance', composed);
}

main().catch((err) => {
  console.error('smoke test threw (this is a bug — facade methods must never throw):', err);
  process.exitCode = 1;
});
