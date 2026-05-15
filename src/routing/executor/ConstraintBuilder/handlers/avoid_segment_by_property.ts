/**
 * STUB — DISCUSS WITH TRAVIS BEFORE IMPLEMENTING.
 *
 * See T2.2 spec §6 / "Anchoring — avoid_segment_by_property" for context
 * on why this is stubbed.
 *
 * Why stubbed: requires the route's segment property analysis layer to
 * identify segments matching the property. The current codebase has
 * segment classification work in `routeScoring.js` and
 * `activityRouteAnalyzer.ts` but the integration boundary is undefined.
 *
 * Confidence rating (when implemented): best-effort.
 *
 * Tracking: see project notes; coordinate with T2.3 design.
 */

import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';

export function buildConstraintForAvoidSegmentByProperty(
  _route: RouteSnapshot,
  _context: RouteContext,
  _mutation: Extract<Mutation, { type: 'avoid_segment_by_property' }>,
): RouteConstraint {
  throw new ConstraintBuilderError(
    'unsupported_mutation',
    'avoid_segment_by_property',
    'avoid_segment_by_property requires segment property classification ' +
      'not yet implemented. Pending integration boundary with routeScoring ' +
      'and activityRouteAnalyzer.',
  );
}
