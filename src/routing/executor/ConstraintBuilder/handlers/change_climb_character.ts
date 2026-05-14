/**
 * STUB — DISCUSS WITH TRAVIS BEFORE IMPLEMENTING.
 *
 * See T2.2 spec §6 / "Climbing — change_climb_character" for context on
 * why this is stubbed.
 *
 * Why stubbed: "Character" mutations require either (a) segment-level
 * classification of climb types in the routing layer, (b) iterative
 * search (which this v1 architecture explicitly excludes), or (c)
 * heuristic prompt-engineering that translates character to other
 * constraint primitives. None of these are settled.
 *
 * Confidence rating (when implemented): experimental.
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

export function buildConstraintForChangeClimbCharacter(
  _route: RouteSnapshot,
  _context: RouteContext,
  _mutation: Extract<Mutation, { type: 'change_climb_character' }>,
): RouteConstraint {
  throw new ConstraintBuilderError(
    'unsupported_mutation',
    'change_climb_character',
    'change_climb_character requires segment-character classification not yet ' +
      'implemented. Falls back to nearest single-shot mutation by intent ' +
      '(see Doc 2b conversational layer for fallback handling).',
  );
}
