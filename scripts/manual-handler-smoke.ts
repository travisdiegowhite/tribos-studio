/**
 * T2.4 dev smoke test — ManualHandlers.
 *
 * Temporary script (does not ship). Exercises `applyManualAction`
 * end-to-end against the real RouterClient + routing providers, so it
 * needs network access and provider credentials in the environment
 * (Stadia / Mapbox keys via the usual VITE_* vars).
 *
 *   npx tsx scripts/manual-handler-smoke.ts
 *
 * Intentionally not wired into `npm run test`. Manual sanity check for
 * the UI-driven path; left for reference until T2.5 supplies real
 * callers.
 */

import { applyManualAction } from '../src/routing/executor/ManualHandlers';
import type {
  ManualAction,
  ManualActionPayload,
  RouteContext,
  RouteSnapshot,
} from '../src/routing/executor/types';

const route: RouteSnapshot = {
  geometry: [
    [-105.0497, 40.0503],
    [-105.08, 40.07],
    [-105.045, 40.085],
  ],
  waypoints: [
    { coordinate: [-105.0497, 40.0503] },
    { coordinate: [-105.08, 40.07] },
    { coordinate: [-105.045, 40.085] },
  ],
  stats: {
    distance_km: 8,
    elevation_gain_m: 120,
    elevation_loss_m: 120,
    duration_s: 1600,
  },
};

const context: RouteContext = {
  profile: 'road',
  shape: 'point_to_point',
  training_goal: 'endurance',
  start_coord: [-105.0497, 40.0503],
  mapbox_token: process.env.VITE_MAPBOX_TOKEN ?? process.env.MAPBOX_TOKEN,
  speed_profile: { flat_kph: 25 },
};

interface Case {
  name: string;
  action: ManualAction;
  payload: ManualActionPayload;
}

const cases: Case[] = [
  {
    name: 'drag_waypoint',
    action: 'drag_waypoint',
    payload: {
      action: 'drag_waypoint',
      waypoint_index: 1,
      new_coord: [-105.1, 40.07],
    },
  },
  {
    name: 'add_waypoint with explicit index',
    action: 'add_waypoint',
    payload: { action: 'add_waypoint', coord: [-105.08, 40.06], insert_at: 1 },
  },
  {
    name: 'add_waypoint nearest-segment',
    action: 'add_waypoint',
    payload: { action: 'add_waypoint', coord: [-105.08, 40.06] },
  },
  {
    name: 'remove_waypoint',
    action: 'remove_waypoint',
    payload: { action: 'remove_waypoint', waypoint_index: 1 },
  },
  {
    name: 'reverse_route',
    action: 'reverse_route',
    payload: { action: 'reverse_route' },
  },
  {
    name: 'clear_route',
    action: 'clear_route',
    payload: { action: 'clear_route' },
  },
];

async function main(): Promise<void> {
  for (const c of cases) {
    const result = await applyManualAction(route, context, c.action, c.payload);
    if (result.ok) {
      console.log(`${c.name}: OK`);
      console.log(`  distance_km: ${result.route.stats.distance_km.toFixed(2)}`);
      console.log(`  waypoints:   ${result.route.waypoints.length}`);
      console.log(`  provider:    ${result.metadata.provider_used ?? '(none)'}`);
      console.log(`  duration_ms: ${result.metadata.duration_ms}`);
    } else {
      console.log(`${c.name}: FAIL`);
      console.log(`  reason: ${result.reason.kind}`);
      if ('explanation' in result.reason) {
        console.log(`  detail: ${result.reason.explanation}`);
      } else if ('message' in result.reason) {
        console.log(`  detail: ${result.reason.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error('Smoke test crashed (this is itself a bug — applyManualAction should never throw):', error);
  process.exit(1);
});
