/**
 * Shared helpers for provider adapters.
 *
 * The legacy modules (`stadiaMapsRouter.js`, `brouter.js`,
 * `directions.js`) all express errors as either rejected promises or
 * `null` returns. The adapters need to translate those into structured
 * `ProviderFailure` shapes. This file centralises the boilerplate.
 */

import { assertCoordinate } from '../../../types/geo';
import { M_TO_KM, assertKm } from '../../../utils/distanceUnits';
import type { Coordinate } from '../../../types/geo';
import type {
  ProviderFailure,
  RouteSnapshot,
} from '../types';

// ---------------------------------------------------------------------------
// Coordinate / validity gates
// ---------------------------------------------------------------------------

/**
 * Per-call dev assertion: every waypoint should be a valid canonical
 * coordinate. Runs only in dev (the underlying `assertCoordinate`
 * helper is a no-op in production).
 */
export function assertWaypoints(waypoints: readonly Coordinate[], where: string): void {
  for (let i = 0; i < waypoints.length; i++) {
    assertCoordinate(waypoints[i], `${where}.waypoints[${i}]`);
  }
}

/**
 * Legacy validity gate: routes with ≤10 geometry points are treated as
 * degenerate. See `docs/legacy-routing-notes.md` §1 ("Validity filter").
 *
 * Returns `true` if the route is plausibly valid, `false` if it should
 * be discarded.
 */
export function hasValidGeometry(coordinates: readonly unknown[] | undefined): boolean {
  return Array.isArray(coordinates) && coordinates.length > 10;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Best-effort classification of an exception thrown by a legacy
 * provider module into a `ProviderFailure`.
 *
 * The legacy modules sometimes throw, sometimes return `null` — the
 * adapter is responsible for picking the right `ProviderFailure` kind
 * from the message text.
 */
export function classifyError(
  err: unknown,
  context: { timeoutMs?: number } = {},
): ProviderFailure {
  if (err && typeof err === 'object') {
    const errObj = err as { name?: string; message?: string; status?: number };

    if (errObj.name === 'AbortError' || /abort|timed?[\s_-]?out/i.test(errObj.message ?? '')) {
      return {
        kind: 'timeout',
        timeout_ms: context.timeoutMs ?? 0,
      };
    }

    const msg = errObj.message ?? '';

    // Stadia-specific HTTP messages — legacy throws with these strings.
    const httpMatch = msg.match(/(?:API error|HTTP):?\s*(\d{3})/i)
      || msg.match(/Stadia Maps API error:?\s*(\d{3})/i);
    if (httpMatch) {
      return {
        kind: 'http_error',
        status: parseInt(httpMatch[1], 10),
        message: msg,
      };
    }

    if (typeof errObj.status === 'number') {
      return {
        kind: 'http_error',
        status: errObj.status,
        message: msg,
      };
    }

    if (/no route|No route found/i.test(msg)) {
      return { kind: 'no_route_found', message: msg };
    }

    if (/invalid api key|invalid request/i.test(msg)) {
      return { kind: 'http_error', status: 0, message: msg };
    }

    if (/network|fetch|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
      return { kind: 'network_error', message: msg };
    }

    return { kind: 'network_error', message: msg || String(err) };
  }
  return { kind: 'network_error', message: String(err) };
}

// ---------------------------------------------------------------------------
// Snapshot assembly
// ---------------------------------------------------------------------------

/**
 * Build a `RouteSnapshot` from legacy provider output. The legacy
 * shape is well-known: `{coordinates, distance_m, duration_s,
 * elevationGain, elevationLoss}` with `distance_m`/`duration_s` per
 * T1.1 (and `distance`/`duration` as legacy aliases that the adapter
 * does not need).
 *
 * The `waypoints` field is preserved from the caller (the user-
 * specified anchors), not the provider's intermediate route points.
 * Providers do not always echo waypoints back.
 */
export function buildSnapshot(args: {
  coordinates: Coordinate[];
  distance_m: number;
  duration_s: number;
  elevationGain_m?: number;
  elevationLoss_m?: number;
  waypoints: readonly Coordinate[];
}): RouteSnapshot {
  const distance_km = M_TO_KM(args.distance_m);
  assertKm(distance_km, 'RouteSnapshot.stats.distance_km');

  return {
    geometry: args.coordinates,
    waypoints: args.waypoints.map((coordinate) => ({ coordinate })),
    stats: {
      distance_km,
      elevation_gain_m: args.elevationGain_m ?? 0,
      elevation_loss_m: args.elevationLoss_m ?? 0,
      duration_s: args.duration_s,
    },
  };
}
