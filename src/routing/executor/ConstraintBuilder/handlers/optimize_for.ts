/**
 * optimize_for — safety-net only — should not normally fire.
 *
 * Per Option Y locked architecture, the LLM is required to expand
 * `optimize_for` into component mutations before emitting. If
 * ConstraintBuilder receives a raw `optimize_for`, the LLM violated
 * its contract. The error propagates as `mutation_not_supported` so
 * the dispatcher can issue a `pushback`.
 */

import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';

export function buildConstraintForOptimizeFor(
  _route: RouteSnapshot,
  _context: RouteContext,
  mutation: Extract<Mutation, { type: 'optimize_for' }>,
): RouteConstraint {
  throw new ConstraintBuilderError(
    'unsupported_mutation',
    'optimize_for',
    `optimize_for { criterion: "${mutation.criterion}" } reached ConstraintBuilder. ` +
      `Per architectural decision (Option Y), this mutation must be LLM-expanded ` +
      `into component mutations before reaching the executor. If this fires ` +
      `repeatedly in production, the LLM prompt requires correction.`,
  );
}
