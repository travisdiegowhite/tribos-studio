/**
 * `clear_route` handler — wipes the route entirely.
 *
 * No router call, no validation: the action is unconditional. Returns an
 * empty `RouteSnapshot` and metadata flagged with `provider_used: null`
 * (since no provider was contacted).
 */

import type { ExecutorResult, RouteContext, RouteSnapshot } from '../../types';
import type { ClearRoutePayload } from '../payloadValidation';

export async function handleClearRoute(
  _route: RouteSnapshot,
  _context: RouteContext,
  _payload: ClearRoutePayload,
): Promise<ExecutorResult> {
  return {
    ok: true,
    route: {
      geometry: [],
      waypoints: [],
      stats: {
        distance_km: 0,
        elevation_gain_m: 0,
        elevation_loss_m: 0,
        duration_s: 0,
      },
    },
    metadata: {
      provider_used: null,
      duration_ms: 0,
      cache_hit: false,
      attempts_tried: 0,
    },
  };
}
