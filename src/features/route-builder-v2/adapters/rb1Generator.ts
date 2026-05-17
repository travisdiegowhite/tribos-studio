/**
 * RB1 generator wrap — Route Builder 2.0 generation path.
 *
 * RB2's `Executor.generate` is an early-stage architecture that doesn't
 * yet drive route ideation through Claude the way RB1 does. Until that
 * wiring is production-ready, we bridge: RB2's FormPanel inputs are
 * mapped to RB1's `generateAIRoutes(params)` shape, and each returned
 * RB1 route is converted into an `ExecutorResult { ok: true, route,
 * metadata }` so the rest of RB2 (suggestion store, selectSuggestion,
 * stats overlay, layers) keeps working unchanged.
 *
 * Manual edits (waypoint drag, click-to-add, remove) and mutation-based
 * chat edits still run through the executor — they only need a
 * lightweight RouterClient.connect, not the full RB1 ideation pass.
 */

import { generateAIRoutes } from '../../../utils/aiRouteGenerator.js';
import { supabase } from '../../../lib/supabase';
import type {
  Coordinate,
  ExecutorResult,
  RouteSnapshot,
  RouteShape,
} from '../../../routing/executor';
import type { GenerationFormInput } from './executorAdapter';

type RouteShapeForRb1 = 'loop' | 'out_and_back' | 'point_to_point';

interface Rb1RouteResult {
  name?: string;
  distance?: number; // km
  elevationGain?: number; // m
  elevationLoss?: number; // m
  coordinates?: Array<[number, number]>;
  description?: string;
}

function mapShape(shape: RouteShape | undefined): RouteShapeForRb1 {
  if (shape === 'out_and_back') return 'out_and_back';
  if (shape === 'point_to_point') return 'point_to_point';
  return 'loop';
}

function mapGoal(goal: string | undefined): string {
  // RB1 accepts arbitrary training_goal strings; we just pass through.
  return goal && goal.length > 0 ? goal : 'endurance';
}

function deriveTimeMinutes(input: GenerationFormInput): number {
  if (typeof input.duration_minutes === 'number' && input.duration_minutes > 0) {
    return input.duration_minutes;
  }
  if (typeof input.distance_km === 'number' && input.distance_km > 0) {
    // Default RB1 speed assumption: 28 km/h average.
    return Math.round((input.distance_km / 28) * 60);
  }
  return 60;
}

async function getCurrentUserId(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? undefined;
  } catch {
    return undefined;
  }
}

function toRouteSnapshot(route: Rb1RouteResult, durationMinutes: number): RouteSnapshot | null {
  if (!route?.coordinates || route.coordinates.length < 2) return null;
  const coords = route.coordinates as Coordinate[];
  const distance_km =
    typeof route.distance === 'number' && Number.isFinite(route.distance)
      ? route.distance
      : 0;
  const elevation_gain_m =
    typeof route.elevationGain === 'number' && Number.isFinite(route.elevationGain)
      ? route.elevationGain
      : 0;
  const elevation_loss_m =
    typeof route.elevationLoss === 'number' && Number.isFinite(route.elevationLoss)
      ? route.elevationLoss
      : 0;
  return {
    geometry: coords,
    waypoints: [
      { coordinate: coords[0] },
      { coordinate: coords[coords.length - 1] },
    ],
    stats: {
      distance_km,
      elevation_gain_m,
      elevation_loss_m,
      duration_s: durationMinutes * 60,
    },
  };
}

function wrapAsResult(snap: RouteSnapshot, durationMs: number): ExecutorResult {
  return {
    ok: true,
    route: snap,
    metadata: {
      provider_used: 'rb1-generator',
      duration_ms: durationMs,
      cache_hit: false,
      attempts_tried: 1,
    },
  } as ExecutorResult;
}

/**
 * Generate routes for the FormPanel using RB1's ideation pipeline.
 * Always returns at least one ExecutorResult. When RB1 returns zero
 * routes the result is `{ ok: false, reason: internal_error }` so
 * `useAIGeneration` can surface the error in the form.
 */
export async function generateRouteViaRb1(
  input: GenerationFormInput,
  count: 1 | 3 = 1,
): Promise<ExecutorResult | ExecutorResult[]> {
  if (!input.start_coord) {
    return {
      ok: false,
      reason: {
        kind: 'context_missing',
        required_field: 'start_coord',
      },
    } as ExecutorResult;
  }

  const userId = await getCurrentUserId();
  const durationMinutes = deriveTimeMinutes(input);
  const params = {
    startLocation: input.start_coord,
    timeAvailable: durationMinutes,
    trainingGoal: mapGoal(input.goal),
    routeType: mapShape(input.route_shape),
    userId,
    speedProfile: null,
    speedModifier: 1.0,
  };

  const startedAt = Date.now();
  let rb1Routes: Rb1RouteResult[] = [];
  try {
    rb1Routes = (await generateAIRoutes(params, null)) as Rb1RouteResult[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: { kind: 'internal_error', message: msg },
    } as ExecutorResult;
  }
  const durationMs = Date.now() - startedAt;

  const snapshots = (rb1Routes ?? [])
    .map((r) => toRouteSnapshot(r, durationMinutes))
    .filter((s): s is RouteSnapshot => s !== null);

  if (snapshots.length === 0) {
    return {
      ok: false,
      reason: {
        kind: 'internal_error',
        message: 'No routes generated — try a different start point or duration.',
      },
    } as ExecutorResult;
  }

  if (count === 1) {
    return wrapAsResult(snapshots[0], durationMs);
  }

  // count === 3: pad with the first if RB1 returned fewer than three.
  const padded: RouteSnapshot[] = [];
  for (let i = 0; i < 3; i++) {
    padded.push(snapshots[i] ?? snapshots[snapshots.length - 1]);
  }
  return padded.map((s) => wrapAsResult(s, durationMs));
}
