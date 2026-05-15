/**
 * ManualHandlers — the UI-driven path of the executor.
 *
 * Receives a `ManualAction` + matching `ManualActionPayload` and produces
 * an updated route via `RouterClient.connect` (or, for `clear_route`,
 * returns an empty route directly).
 *
 * Manual actions carry direct geometric instructions, not intent. They
 * bypass ConstraintBuilder entirely. See T2.4 spec §"Architecture
 * decisions".
 *
 * Public API: `applyManualAction`. Always returns an `ExecutorResult`;
 * never throws. On failure, every result carries `partial: route` (the
 * pre-action state) so the UI can revert.
 *
 * T2.4 ships this module with no production callers. T2.5 (Executor
 * facade) wires it in.
 */

import type {
  ExecutorFailure,
  ExecutorResult,
  ManualAction,
  ManualActionPayload,
  RouteContext,
  RouteSnapshot,
} from '../types';
import { handleAddWaypoint } from './handlers/add_waypoint';
import { handleClearRoute } from './handlers/clear_route';
import { handleDragWaypoint } from './handlers/drag_waypoint';
import { handleRemoveWaypoint } from './handlers/remove_waypoint';
import { handleReverseRoute } from './handlers/reverse_route';
import {
  trackManualHandlerFailed,
  trackManualHandlerStarted,
  trackManualHandlerSucceeded,
} from './metrics';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Apply a manual user action to a route.
 *
 * Manual actions carry direct geometric instructions (e.g. "drag waypoint
 * 3 to coord X"), not intent. They bypass ConstraintBuilder and route
 * straight through `RouterClient.connect`.
 *
 * Always returns an `ExecutorResult`; never throws. On failure, the
 * result includes `partial: route` (the pre-action state) for the UI to
 * revert to.
 */
export async function applyManualAction(
  route: RouteSnapshot,
  context: RouteContext,
  action: ManualAction,
  payload: ManualActionPayload,
): Promise<ExecutorResult> {
  // Defensive: TypeScript can't enforce the discriminator match at the
  // call site, so we do it at runtime. Catches sloppy callers that pass
  // `action: 'drag_waypoint'` with a `payload.action: 'add_waypoint'`.
  if (action !== payload.action) {
    const failure: ExecutorFailure = {
      kind: 'internal_error',
      message: `Action/payload mismatch: action=${action}, payload.action=${payload.action}`,
    };
    return { ok: false, reason: failure, partial: route };
  }

  trackManualHandlerStarted(action);
  const startedAt = Date.now();

  let result: ExecutorResult;
  try {
    switch (payload.action) {
      case 'drag_waypoint':
        result = await handleDragWaypoint(route, context, payload);
        break;
      case 'add_waypoint':
        result = await handleAddWaypoint(route, context, payload);
        break;
      case 'remove_waypoint':
        result = await handleRemoveWaypoint(route, context, payload);
        break;
      case 'reverse_route':
        result = await handleReverseRoute(route, context, payload);
        break;
      case 'clear_route':
        result = await handleClearRoute(route, context, payload);
        break;
      default: {
        // Exhaustiveness check. Unreachable as long as `ManualActionPayload`
        // remains a closed union.
        const _exhaustive: never = payload;
        result = {
          ok: false,
          reason: {
            kind: 'internal_error',
            message: `Unknown manual action: ${(_exhaustive as { action: string }).action}`,
          },
          partial: route,
        };
      }
    }
  } catch (error) {
    // Handlers are documented as never-throws (they go through
    // RouterClient, which returns ExecutorResult). This catch is a
    // defensive net so `applyManualAction`'s never-throws contract
    // holds even if a handler is buggy or a future refactor breaks
    // that invariant.
    result = {
      ok: false,
      reason: {
        kind: 'internal_error',
        message: `ManualHandler threw: ${errorMessage(error)}`,
      },
      partial: route,
    };
  }

  const durationMs = Date.now() - startedAt;
  if (result.ok) {
    trackManualHandlerSucceeded(
      action,
      durationMs,
      result.metadata.provider_used,
      result.metadata.cache_hit,
    );
  } else {
    trackManualHandlerFailed(action, durationMs, result.reason.kind);
  }
  return result;
}
