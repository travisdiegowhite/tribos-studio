/**
 * STUB — DISCUSS WITH TRAVIS BEFORE IMPLEMENTING.
 *
 * See T2.2 spec §6 / "Anchoring — anchor_at_poi" for context on why
 * this is stubbed.
 *
 * Open questions:
 *  1. Where does the POI lookup happen? In ConstraintBuilder (violates
 *     pure-function rule) or upstream (in T2.3 with results passed in)?
 *  2. How is ambiguity handled (multiple POIs match query)?
 *  3. How are POI types defined and what's the v1 enum?
 *  4. What's the caching strategy?
 *
 * Confidence rating (when implemented): best-effort.
 *
 * Tracking: see project notes; needs Overpass API integration.
 */

import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';

export function buildConstraintForAnchorAtPoi(
  _route: RouteSnapshot,
  _context: RouteContext,
  _mutation: Extract<Mutation, { type: 'anchor_at_poi' }>,
): RouteConstraint {
  throw new ConstraintBuilderError(
    'unsupported_mutation',
    'anchor_at_poi',
    'anchor_at_poi requires Overpass POI lookup not yet implemented. ' +
      'Pending design: lookup boundary, ambiguity handling, POI type enum, ' +
      'caching strategy.',
  );
}
