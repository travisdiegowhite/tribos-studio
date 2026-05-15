/**
 * `reverse_route` handler — reverses the waypoint order and re-routes.
 *
 * Deliberate departure from strict shared-executor: T2.3's `reverse_route`
 * mutation also produces a reversed waypoint array via ConstraintBuilder,
 * but the manual path skips that hop. Same final capability
 * (`RouterClient.connect`), shorter path. See T2.4 spec §"Architecture
 * decisions" for the rationale.
 */

import { getRouterClient } from '../../../RouterClient';
import type { ExecutorResult, RouteContext, RouteSnapshot } from '../../types';
import type { ReverseRoutePayload } from '../payloadValidation';

export async function handleReverseRoute(
  route: RouteSnapshot,
  context: RouteContext,
  _payload: ReverseRoutePayload,
): Promise<ExecutorResult> {
  const reversed = [...route.waypoints].reverse();
  const result = await getRouterClient().connect(
    reversed.map((w) => w.coordinate),
    context,
  );
  if (!result.ok) {
    return { ...result, partial: route };
  }
  return result;
}
