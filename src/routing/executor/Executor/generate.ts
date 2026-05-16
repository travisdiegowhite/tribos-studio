/**
 * `Executor.generate()` implementation.
 *
 * The cold-start / replace / alternatives path. Unlike `applyMutation`,
 * this path has no current route to mutate — `GenerationConstraints`
 * is already constraint-shaped, so it maps directly to a
 * `RouteConstraint` and bypasses ConstraintBuilder entirely.
 *
 * Two paths:
 * - `count: 1` — single `RouterClient.solve` call, returns one result.
 * - `count: 3` — three parallel `RouterClient.solve` calls against
 *   variety-perturbed constraints, returns an array (failures
 *   included as `{ ok: false, ... }` entries).
 */

import type { Coordinate } from '../../../types/geo';
import { getRouterClient } from '../../RouterClient';
import type {
  ExecutorFailure,
  ExecutorResult,
  GenerationConstraints,
  ProviderName,
  RouteConstraint,
  RouteContext,
  RoutingProfile,
} from '../types';
import {
  trackExecutorGenerateCalled,
  trackExecutorGenerateFailed,
  trackExecutorGeneratePartial,
  trackExecutorGenerateSucceeded,
} from './metrics';
import { PERTURBATION_STRATEGIES, varietyPerturbation } from './variety';

/** Speed (km/h on flat) assumed when context carries no `speed_profile`. */
const DEFAULT_FLAT_KPH = 25;

/** Default duration used to derive a target when both distance and duration are missing. */
const DEFAULT_DURATION_MINUTES = 60;

/** Default cardinal direction for the single-route seed loop. */
const DEFAULT_SEED_BEARING_DEG = 0; // north

/** Single-route entry point. */
export async function generateOne(
  context: RouteContext,
  constraints: GenerationConstraints,
): Promise<ExecutorResult> {
  const startedAt = Date.now();
  trackExecutorGenerateCalled({
    count: 1,
    has_like_ride_id: Boolean(constraints.like_ride_id),
    target_distance_km: constraints.distance_km ?? null,
  });

  const baseResult = buildBaseConstraint(constraints, context);
  if (!baseResult.ok) {
    trackExecutorGenerateFailed({
      count: 1,
      duration_ms: Date.now() - startedAt,
      failure_kind: baseResult.failure.kind,
    });
    return { ok: false, reason: baseResult.failure };
  }

  let result: ExecutorResult;
  try {
    result = await getRouterClient().solve(baseResult.constraint, context);
  } catch (error) {
    // RouterClient is contracted to never throw — this is a defensive net.
    const failure: ExecutorFailure = {
      kind: 'internal_error',
      message: `RouterClient threw: ${error instanceof Error ? error.message : String(error)}`,
    };
    trackExecutorGenerateFailed({
      count: 1,
      duration_ms: Date.now() - startedAt,
      failure_kind: failure.kind,
    });
    return { ok: false, reason: failure };
  }

  if (result.ok) {
    trackExecutorGenerateSucceeded({
      count: 1,
      duration_ms: Date.now() - startedAt,
      provider_used: result.metadata.provider_used,
    });
  } else {
    trackExecutorGenerateFailed({
      count: 1,
      duration_ms: Date.now() - startedAt,
      failure_kind: result.reason.kind,
    });
  }
  return result;
}

/** Alternatives entry point — three parallel perturbed `solve` calls. */
export async function generateAlternatives(
  context: RouteContext,
  constraints: GenerationConstraints,
): Promise<ExecutorResult[]> {
  const startedAt = Date.now();
  trackExecutorGenerateCalled({
    count: 3,
    has_like_ride_id: Boolean(constraints.like_ride_id),
    target_distance_km: constraints.distance_km ?? null,
  });

  const baseResult = buildBaseConstraint(constraints, context);
  if (!baseResult.ok) {
    trackExecutorGenerateFailed({
      count: 3,
      duration_ms: Date.now() - startedAt,
      failure_kind: baseResult.failure.kind,
    });
    // Surface the same failure for every alternative — callers expect a
    // length-3 array regardless of upstream errors.
    const failure: ExecutorResult = { ok: false, reason: baseResult.failure };
    return [failure, failure, failure];
  }

  const perturbed = PERTURBATION_STRATEGIES.map((strategy) =>
    varietyPerturbation(baseResult.constraint, strategy),
  );

  const client = getRouterClient();
  const results = await Promise.all(
    perturbed.map(async (constraint): Promise<ExecutorResult> => {
      try {
        return await client.solve(constraint, context);
      } catch (error) {
        return {
          ok: false,
          reason: {
            kind: 'internal_error',
            message: `RouterClient threw: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    }),
  );

  const successful = results.filter((r): r is Extract<ExecutorResult, { ok: true }> => r.ok);
  const durationMs = Date.now() - startedAt;

  if (successful.length === results.length) {
    trackExecutorGenerateSucceeded({
      count: 3,
      duration_ms: durationMs,
      provider_used: mostUsedProvider(successful),
    });
  } else if (successful.length === 0) {
    const firstFailure = results.find((r): r is Extract<ExecutorResult, { ok: false }> => !r.ok);
    trackExecutorGenerateFailed({
      count: 3,
      duration_ms: durationMs,
      failure_kind: firstFailure?.reason.kind ?? 'internal_error',
    });
  } else {
    trackExecutorGeneratePartial({
      successful_count: successful.length,
      failed_count: results.length - successful.length,
      duration_ms: durationMs,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Constraint construction
// ---------------------------------------------------------------------------

type BaseConstraintResult =
  | { ok: true; constraint: RouteConstraint }
  | { ok: false; failure: ExecutorFailure };

function buildBaseConstraint(
  constraints: GenerationConstraints,
  context: RouteContext,
): BaseConstraintResult {
  const startCoord = constraints.start_coord ?? context.start_coord;
  if (!startCoord) {
    return {
      ok: false,
      failure: { kind: 'context_missing', required_field: 'start_coord' },
    };
  }

  const targetKm = resolveTargetDistanceKm(constraints, context);
  const waypoints = buildSeedWaypoints(constraints, context, startCoord, targetKm);

  const constraint: RouteConstraint = {
    waypoints,
    profile: inferProfile(context),
    shape: 'loop',
    target_distance_km: targetKm,
    target_elevation_gain_m: constraints.elevation_gain_m,
    surface_preference: constraints.surface_mix,
  };
  return { ok: true, constraint };
}

function inferProfile(context: RouteContext): RoutingProfile {
  return context.profile ?? 'road';
}

function resolveTargetDistanceKm(
  constraints: GenerationConstraints,
  context: RouteContext,
): number | undefined {
  if (typeof constraints.distance_km === 'number') {
    return constraints.distance_km;
  }
  if (typeof constraints.duration_minutes === 'number') {
    return deriveDistanceFromDuration(constraints.duration_minutes, context);
  }
  return undefined;
}

function deriveDistanceFromDuration(
  durationMinutes: number,
  context: RouteContext,
): number {
  const kph = context.speed_profile?.flat_kph ?? DEFAULT_FLAT_KPH;
  return (durationMinutes / 60) * kph;
}

function buildSeedWaypoints(
  constraints: GenerationConstraints,
  context: RouteContext,
  startCoord: Coordinate,
  targetKm: number | undefined,
): Coordinate[] {
  if (constraints.like_ride_id && context.recent_rides) {
    const ride = context.recent_rides.find((r) => r.id === constraints.like_ride_id);
    if (ride && ride.waypoints.length >= 2) {
      // Reuse the past ride's waypoint structure. The router will
      // re-snap geometry through the modern road network.
      return ride.waypoints;
    }
    // Ride ID present but unresolved (missing from recent_rides or
    // empty waypoints) — fall through to radial loop. Documented
    // behavior; debugging tip lives in T2.5 risk notes.
  }

  const effectiveKm = targetKm ?? deriveDistanceFromDuration(DEFAULT_DURATION_MINUTES, context);
  return radialLoopWaypoints(startCoord, effectiveKm, DEFAULT_SEED_BEARING_DEG);
}

/**
 * Build a four-waypoint loop seed by walking three 90°-turn legs and
 * closing back at the start. Each leg is ~`targetKm / 4`. This is the
 * same shape Tier 2 of the legacy fallback uses, minus the router
 * call (the RouterClient does that downstream).
 */
function radialLoopWaypoints(
  start: Coordinate,
  targetKm: number,
  startBearingDeg: number,
): Coordinate[] {
  const [startLng, startLat] = start;
  const legKm = targetKm / 4;
  const cosLat = Math.cos((startLat * Math.PI) / 180) || 1;

  const step = (from: Coordinate, bearingDeg: number): Coordinate => {
    const theta = (bearingDeg * Math.PI) / 180;
    const dLat = (legKm / 111) * Math.cos(theta);
    const dLng = (legKm / (111 * Math.abs(cosLat))) * Math.sin(theta);
    return [from[0] + dLng, from[1] + dLat];
  };

  const wp1 = step(start, startBearingDeg);
  const wp2 = step(wp1, (startBearingDeg + 90) % 360);
  const wp3 = step(wp2, (startBearingDeg + 180) % 360);

  return [[startLng, startLat], wp1, wp2, wp3, [startLng, startLat]];
}

function mostUsedProvider(
  successful: Extract<ExecutorResult, { ok: true }>[],
): ProviderName | null {
  if (successful.length === 0) return null;
  const counts = new Map<ProviderName, number>();
  for (const result of successful) {
    const p = result.metadata.provider_used;
    if (!p) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best: ProviderName | null = null;
  let bestCount = 0;
  for (const [provider, count] of counts) {
    if (count > bestCount) {
      best = provider;
      bestCount = count;
    }
  }
  return best;
}
