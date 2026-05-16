/**
 * ConstraintBuilder — the pure-logic translation layer that converts
 * mutations into RouteConstraint objects.
 *
 * Each of the 19 mutation types has a corresponding
 * `buildConstraintFor<MutationType>` function. The top-level
 * `buildConstraint` dispatches based on the mutation's `type` field.
 *
 * No I/O, no async, no side effects beyond fire-and-forget telemetry.
 * Same inputs always produce the same output.
 *
 * T2.3 (MutationHandlers) will catch `ConstraintBuilderError` and
 * convert it to `ExecutorFailure`.
 */

import { trackRouteBuilder } from '../../../utils/routeBuilderTelemetry';
import type {
  Mutation,
  MutationType,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../types';
import { ConstraintBuilderError } from './ConstraintBuilderError';
import { buildConstraintForAnchorAtPoi } from './handlers/anchor_at_poi';
import { buildConstraintForAnchorThrough } from './handlers/anchor_through';
import { buildConstraintForAvoidExposure } from './handlers/avoid_exposure';
import { buildConstraintForAvoidSegment } from './handlers/avoid_segment';
import { buildConstraintForAvoidSegmentByProperty } from './handlers/avoid_segment_by_property';
import { buildConstraintForChangeClimbCharacter } from './handlers/change_climb_character';
import { buildConstraintForChangeRouteShape } from './handlers/change_route_shape';
import { buildConstraintForChangeSurfaceMix } from './handlers/change_surface_mix';
import { buildConstraintForChangeTrafficPreference } from './handlers/change_traffic_preference';
import { buildConstraintForExtendDistance } from './handlers/extend_distance';
import { buildConstraintForIncreaseClimbing } from './handlers/increase_climbing';
import { buildConstraintForOptimizeFor } from './handlers/optimize_for';
import { buildConstraintForReduceClimbing } from './handlers/reduce_climbing';
import { buildConstraintForReverseRoute } from './handlers/reverse_route';
import { buildConstraintForShortenDistance } from './handlers/shorten_distance';
import { buildConstraintForSmoothRoute } from './handlers/smooth_route';
import { buildConstraintForSwapToFamiliar } from './handlers/swap_to_familiar';
import { buildConstraintForSwapToUnfamiliar } from './handlers/swap_to_unfamiliar';
import { buildConstraintForTrimRoute } from './handlers/trim_route';

/**
 * Per-handler confidence rating. Informs post-beta tuning priorities and
 * tells Doc 2b's conversational layer where to set user expectations.
 */
export type ConfidenceRating = 'reliable' | 'best-effort' | 'experimental' | 'safety-net';

export const CONFIDENCE_RATINGS: Readonly<Record<MutationType, ConfidenceRating>> = {
  // Geometric
  extend_distance: 'reliable',
  shorten_distance: 'reliable',
  trim_route: 'reliable',
  reverse_route: 'reliable',
  smooth_route: 'best-effort',
  change_route_shape: 'best-effort',
  // Climbing
  increase_climbing: 'reliable',
  reduce_climbing: 'reliable',
  change_climb_character: 'experimental',
  // Routing preferences
  change_surface_mix: 'reliable',
  change_traffic_preference: 'reliable',
  avoid_exposure: 'experimental',
  // Anchoring & avoidance
  anchor_through: 'reliable',
  anchor_at_poi: 'best-effort',
  avoid_segment: 'reliable',
  avoid_segment_by_property: 'best-effort',
  // Familiarity
  swap_to_familiar: 'reliable',
  swap_to_unfamiliar: 'reliable',
  // High-level
  optimize_for: 'safety-net',
};

/**
 * Mutation types that are stubbed in v1 and throw `unsupported_mutation`.
 * Used to emit a distinct `constraint_stub_called` telemetry event so
 * the team can prioritize implementation work post-launch.
 */
const STUB_MUTATION_TYPES: ReadonlySet<MutationType> = new Set<MutationType>([
  'change_climb_character',
  'anchor_at_poi',
  'avoid_segment_by_property',
]);

type HandlerFn<T extends MutationType> = (
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: T }>,
) => RouteConstraint;

const HANDLERS: { [K in MutationType]: HandlerFn<K> } = {
  extend_distance: buildConstraintForExtendDistance,
  shorten_distance: buildConstraintForShortenDistance,
  trim_route: buildConstraintForTrimRoute,
  reverse_route: buildConstraintForReverseRoute,
  smooth_route: buildConstraintForSmoothRoute,
  change_route_shape: buildConstraintForChangeRouteShape,
  increase_climbing: buildConstraintForIncreaseClimbing,
  reduce_climbing: buildConstraintForReduceClimbing,
  change_climb_character: buildConstraintForChangeClimbCharacter,
  change_surface_mix: buildConstraintForChangeSurfaceMix,
  change_traffic_preference: buildConstraintForChangeTrafficPreference,
  avoid_exposure: buildConstraintForAvoidExposure,
  anchor_through: buildConstraintForAnchorThrough,
  anchor_at_poi: buildConstraintForAnchorAtPoi,
  avoid_segment: buildConstraintForAvoidSegment,
  avoid_segment_by_property: buildConstraintForAvoidSegmentByProperty,
  swap_to_familiar: buildConstraintForSwapToFamiliar,
  swap_to_unfamiliar: buildConstraintForSwapToUnfamiliar,
  optimize_for: buildConstraintForOptimizeFor,
};

function isScoped(mutation: Mutation): boolean {
  return 'scope' in mutation && mutation.scope != null;
}

function truncate(message: string, max = 200): string {
  if (message.length <= max) return message;
  return `${message.slice(0, max - 1)}…`;
}

/**
 * Translate a single mutation into a RouteConstraint.
 *
 * Pure function: no I/O, no side effects (telemetry is fire-and-forget).
 * Same inputs always produce same output.
 *
 * Throws `ConstraintBuilderError` if the mutation cannot be translated.
 * Callers (T2.3 MutationHandlers) catch and convert to `ExecutorFailure`.
 */
export function buildConstraint(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Mutation,
): RouteConstraint {
  const handler = HANDLERS[mutation.type] as
    | ((r: RouteSnapshot, c: RouteContext, m: Mutation) => RouteConstraint)
    | undefined;
  if (!handler) {
    const err = new ConstraintBuilderError(
      'unsupported_mutation',
      mutation.type,
      `No handler registered for mutation type "${mutation.type}".`,
    );
    trackRouteBuilder('constraint_failed', {
      mutation_type: mutation.type,
      error_kind: err.kind,
      error_message: truncate(err.message),
    });
    throw err;
  }

  try {
    const result = handler(route, context, mutation);
    if (STUB_MUTATION_TYPES.has(mutation.type)) {
      // Defensive — stubs always throw, so this branch is unreachable
      // unless a stub is reimplemented to return a constraint without
      // updating STUB_MUTATION_TYPES.
      trackRouteBuilder('constraint_stub_called', {
        mutation_type: mutation.type,
      });
    }
    trackRouteBuilder('constraint_built', {
      mutation_type: mutation.type,
      scoped: isScoped(mutation),
      confidence: CONFIDENCE_RATINGS[mutation.type],
    });
    return result;
  } catch (e) {
    if (e instanceof ConstraintBuilderError) {
      if (STUB_MUTATION_TYPES.has(mutation.type)) {
        trackRouteBuilder('constraint_stub_called', {
          mutation_type: mutation.type,
        });
      }
      trackRouteBuilder('constraint_failed', {
        mutation_type: mutation.type,
        error_kind: e.kind,
        error_message: truncate(e.message),
      });
    } else {
      trackRouteBuilder('constraint_failed', {
        mutation_type: mutation.type,
        error_kind: 'internal_error',
        error_message: truncate(
          e instanceof Error ? e.message : String(e),
        ),
      });
    }
    throw e;
  }
}

export { ConstraintBuilderError } from './ConstraintBuilderError';
export type { ConstraintBuilderErrorKind } from './ConstraintBuilderError';
