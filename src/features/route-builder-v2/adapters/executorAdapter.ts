/**
 * Executor adapter — the seam between Route Builder 2.0 hooks and the
 * routing executor (`src/routing/executor`).
 *
 * Responsibilities:
 *   - Translate UI-level form input into `GenerationConstraints`.
 *   - Build a `RouteContext` for every executor call (Doc 2b §9.1).
 *   - Forward to the executor singleton (`getExecutor()`).
 *   - Provide a stub for chat-input interpretation (P1.4 fills it).
 *
 * The adapter is intentionally small. It owns no state; everything it
 * needs comes from the call args, the Zustand store, and Supabase
 * (via `assembleRouteContext`).
 */

import {
  getExecutor,
  type ExecutorResult,
  type GenerationConstraints,
  type ManualAction,
  type ManualActionPayload,
  type Mutation,
  type RouteSnapshot,
  type Coordinate,
  type RoutingProfile,
  type RouteShape,
  type SurfaceMix,
} from '../../../routing/executor';
import {
  assembleRouteContext,
  RouteContextError,
  toExecutorContext,
  type AssembleOptions,
  type FullRouteContext,
} from './assembleRouteContext';
import { enrichElevation, enrichElevationBatch } from './elevationEnrichment';

// ---------------------------------------------------------------------------
// GenerationFormInput — the UI's view of the generation form
// ---------------------------------------------------------------------------

/**
 * Form-level inputs collected by the Route Builder UI. The adapter
 * maps these to `GenerationConstraints` for the executor.
 *
 * Most fields are optional. `start_coord` is REQUIRED for generate
 * paths (the assembler no longer pulls a home location from the DB —
 * it must come from the geolocation hook in the page). When omitted
 * the adapter throws `RouteContextError('context_missing',
 * { required_field: 'start_coord' })` which surfaces in the UI via
 * `useAIGeneration.lastError`.
 */
export interface GenerationFormInput {
  goal?: string;
  duration_minutes?: number;
  distance_km?: number;
  elevation_gain_m?: number;
  start_coord?: Coordinate;
  route_profile?: RoutingProfile;
  route_shape?: RouteShape;
  surface_mix?: SurfaceMix;
  /** Reference a past ride structurally (executor resolves via recent_rides). */
  like_ride_id?: string;
}

export function toGenerationConstraints(
  input: GenerationFormInput,
): GenerationConstraints {
  return {
    goal: input.goal,
    duration_minutes: input.duration_minutes,
    distance_km: input.distance_km,
    elevation_gain_m: input.elevation_gain_m,
    surface_mix: input.surface_mix,
    start_coord: input.start_coord,
    like_ride_id: input.like_ride_id,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AdapterCallOptions extends AssembleOptions {
  /** Override the assembled context (tests only). */
  contextOverride?: FullRouteContext;
}

async function buildContext(
  options: AdapterCallOptions = {},
): Promise<FullRouteContext> {
  if (options.contextOverride) return options.contextOverride;
  return assembleRouteContext(options);
}

/**
 * Resolve the start coordinate for a generate call. Caller-provided
 * `input.start_coord` (from geolocation in the page) wins; a
 * pre-assembled `contextOverride.start_coord` (tests) is the fallback.
 * Throws `context_missing` when neither is present so the UI surfaces
 * an actionable error rather than silently routing from a default.
 */
function resolveGenerateStartCoord(
  input: GenerationFormInput,
  options: AdapterCallOptions,
): Coordinate {
  const fromInput = input.start_coord;
  if (fromInput) return fromInput;
  const fromOverride = options.contextOverride?.start_coord;
  if (fromOverride) return fromOverride;
  throw new RouteContextError('context_missing', {
    required_field: 'start_coord',
    message:
      'start_coord is required for generation. Pass it via GenerationFormInput.start_coord (typically from useUserLocation in the page).',
  });
}

export async function generateRoute(
  input: GenerationFormInput,
  count: 1,
  options?: AdapterCallOptions,
): Promise<ExecutorResult>;
export async function generateRoute(
  input: GenerationFormInput,
  count: 3,
  options?: AdapterCallOptions,
): Promise<ExecutorResult[]>;
export async function generateRoute(
  input: GenerationFormInput,
  count?: 1 | 3,
  options?: AdapterCallOptions,
): Promise<ExecutorResult | ExecutorResult[]>;
export async function generateRoute(
  input: GenerationFormInput,
  count: 1 | 3 = 1,
  options: AdapterCallOptions = {},
): Promise<ExecutorResult | ExecutorResult[]> {
  // Validate start_coord before any expensive assembly work — fast
  // path for a configuration error.
  const start = resolveGenerateStartCoord(input, options);
  const full = await buildContext({
    ...options,
    startCoordOverride: options.contextOverride
      ? options.contextOverride.start_coord ?? start
      : start,
  });
  // Ensure the context the executor sees carries the start coord even
  // when contextOverride didn't pre-populate it.
  const fullWithStart: FullRouteContext = full.start_coord
    ? full
    : { ...full, start_coord: start };
  const ctx = toExecutorContext(fullWithStart);
  const constraints = toGenerationConstraints({ ...input, start_coord: start });
  const executor = getExecutor();
  if (count === 3) {
    const results = await executor.generate(ctx, constraints, 3);
    return enrichElevationBatch(results);
  }
  const result = await executor.generate(ctx, constraints, 1);
  return enrichElevation(result);
}

export async function applyMutation(
  route: RouteSnapshot,
  mutation: Mutation,
  options: AdapterCallOptions = {},
): Promise<ExecutorResult> {
  const full = await buildContext(options);
  const ctx = toExecutorContext(full);
  const result = await getExecutor().applyMutation(route, ctx, mutation);
  return enrichElevation(result);
}

export async function applyManualAction(
  route: RouteSnapshot,
  action: ManualAction,
  payload: ManualActionPayload,
  options: AdapterCallOptions = {},
): Promise<ExecutorResult> {
  const full = await buildContext(options);
  const ctx = toExecutorContext(full);
  const result = await getExecutor().applyManualAction(route, ctx, action, payload);
  return enrichElevation(result);
}

/**
 * STUB: P1.4 will implement chat translation (NL → Mutation).
 * Returns null in P1.2 — callers fall back to the legacy edit panel.
 */
export function interpretChatInput(_text: string): Mutation | null {
  return null;
}

// Re-export the context assembler for callers (e.g. P1.4 chat surface).
export { assembleRouteContext };
