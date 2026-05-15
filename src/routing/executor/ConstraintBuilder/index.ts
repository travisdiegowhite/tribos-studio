/**
 * ConstraintBuilder public API.
 *
 * Production callers (T2.3 MutationHandlers, T2.5 Executor facade) call
 * `buildConstraint`. Tests can also import individual handlers and the
 * `CONFIDENCE_RATINGS` table.
 *
 * T2.2 ships this module with zero production callers. T2.3 will wire
 * it into MutationHandlers.
 */

export {
  buildConstraint,
  CONFIDENCE_RATINGS,
  ConstraintBuilderError,
} from './ConstraintBuilder';
export type {
  ConfidenceRating,
} from './ConstraintBuilder';
export type { ConstraintBuilderErrorKind } from './ConstraintBuilderError';

// Individual handler exports — useful for direct unit testing.
export { buildConstraintForAnchorAtPoi } from './handlers/anchor_at_poi';
export { buildConstraintForAnchorThrough } from './handlers/anchor_through';
export { buildConstraintForAvoidExposure } from './handlers/avoid_exposure';
export { buildConstraintForAvoidSegment } from './handlers/avoid_segment';
export { buildConstraintForAvoidSegmentByProperty } from './handlers/avoid_segment_by_property';
export { buildConstraintForChangeClimbCharacter } from './handlers/change_climb_character';
export { buildConstraintForChangeRouteShape } from './handlers/change_route_shape';
export { buildConstraintForChangeSurfaceMix } from './handlers/change_surface_mix';
export { buildConstraintForChangeTrafficPreference } from './handlers/change_traffic_preference';
export { buildConstraintForExtendDistance } from './handlers/extend_distance';
export { buildConstraintForIncreaseClimbing } from './handlers/increase_climbing';
export { buildConstraintForOptimizeFor } from './handlers/optimize_for';
export { buildConstraintForReduceClimbing } from './handlers/reduce_climbing';
export { buildConstraintForReverseRoute } from './handlers/reverse_route';
export { buildConstraintForShortenDistance } from './handlers/shorten_distance';
export { buildConstraintForSmoothRoute } from './handlers/smooth_route';
export { buildConstraintForSwapToFamiliar } from './handlers/swap_to_familiar';
export { buildConstraintForSwapToUnfamiliar } from './handlers/swap_to_unfamiliar';
export { buildConstraintForTrimRoute } from './handlers/trim_route';
