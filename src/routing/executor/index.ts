/**
 * Routing executor — public API.
 *
 * Production code imports from this barrel only. Internal submodules
 * (`Executor/`, `MutationHandlers/`, `ManualHandlers/`,
 * `ConstraintBuilder/`, `RouterClient/`) are implementation details and
 * may be reorganised without affecting callers.
 */

export { Executor, getExecutor, setExecutor } from './Executor';
export type { ExecutorConfig } from './Executor';
export type {
  ClimbCharacter,
  Coordinate,
  ExecutionMetadata,
  ExecutorFailure,
  ExecutorResult,
  ExposureType,
  GenerationConstraints,
  MagnitudeLevel,
  ManualAction,
  ManualActionPayload,
  Mutation,
  MutationType,
  OptimizeCriterion,
  POIType,
  ProviderName,
  RideSummary,
  RouteConstraint,
  RouteContext,
  RouteShape,
  RouteSnapshot,
  RouteStats,
  RouteWaypoint,
  RoutingProfile,
  Scope,
  SegmentId,
  SegmentProperty,
  SmoothTarget,
  SurfaceMix,
  TrafficPreference,
  WeatherContext,
} from './types';
