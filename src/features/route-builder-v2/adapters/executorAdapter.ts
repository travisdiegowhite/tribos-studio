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
  toExecutorContext,
  type AssembleOptions,
  type FullRouteContext,
} from './assembleRouteContext';

// ---------------------------------------------------------------------------
// GenerationFormInput — the UI's view of the generation form
// ---------------------------------------------------------------------------

/**
 * Form-level inputs collected by the Route Builder UI. The adapter
 * maps these to `GenerationConstraints` for the executor.
 *
 * Optional everywhere — RouteContext fills in defaults where the form
 * omits a field (e.g., `start_coord` falls back to profile home).
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
  const full = await buildContext(options);
  const ctx = toExecutorContext(full);
  const constraints = toGenerationConstraints(input);
  const executor = getExecutor();
  if (count === 3) {
    return executor.generate(ctx, constraints, 3);
  }
  return executor.generate(ctx, constraints, 1);
}

export async function applyMutation(
  route: RouteSnapshot,
  mutation: Mutation,
  options: AdapterCallOptions = {},
): Promise<ExecutorResult> {
  const full = await buildContext(options);
  const ctx = toExecutorContext(full);
  return getExecutor().applyMutation(route, ctx, mutation);
}

export async function applyManualAction(
  route: RouteSnapshot,
  action: ManualAction,
  payload: ManualActionPayload,
  options: AdapterCallOptions = {},
): Promise<ExecutorResult> {
  const full = await buildContext(options);
  const ctx = toExecutorContext(full);
  return getExecutor().applyManualAction(route, ctx, action, payload);
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
