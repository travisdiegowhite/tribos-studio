/**
 * Executor — the public facade for all route-changing operations.
 *
 * Wraps the four operations from Executor Spec §2.2 into a single
 * class with one singleton accessor. Three of the four operations
 * (`applyMutation`, `applyMutations`, `applyManualAction`) are pure
 * delegation to their respective modules — the facade exists so
 * production code can call one object that does everything the
 * executor needs to do. The novel piece is `generate()`: the
 * cold-start / replace / alternatives path that produces routes from
 * scratch with no current route as input.
 *
 * Construction: production code calls `getExecutor()`. Tests can
 * construct directly via `new Executor(...)` or replace the singleton
 * via `setExecutor(...)`.
 *
 * After T2.5 the executor is functionally complete. The Phase 1 UI
 * rebuild and the Doc 2b conversational pipeline both consume this
 * API.
 */

import { applyManualAction as applyManualActionImpl } from '../ManualHandlers';
import {
  applyMutation as applyMutationImpl,
  applyMutations as applyMutationsImpl,
} from '../MutationHandlers';
import type {
  ExecutorResult,
  GenerationConstraints,
  ManualAction,
  ManualActionPayload,
  Mutation,
  RouteContext,
  RouteSnapshot,
} from '../types';
import { generateAlternatives, generateOne } from './generate';

export interface ExecutorConfig {
  // Reserved for future use. The facade has no configuration today;
  // upstream singletons (RouterClient) own their own config. Kept in
  // the signature so `new Executor({...})` can grow without API
  // churn.
}

export class Executor {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config: ExecutorConfig = {}) {
    // No state today; constructor is a placeholder for future config.
  }

  /**
   * Apply a single mutation to a route. Delegates to
   * `MutationHandlers.applyMutation`. Never throws.
   */
  async applyMutation(
    route: RouteSnapshot,
    context: RouteContext,
    mutation: Mutation,
  ): Promise<ExecutorResult> {
    return applyMutationImpl(route, context, mutation);
  }

  /**
   * Apply multiple mutations sequentially with all-or-nothing
   * rollback. Delegates to `MutationHandlers.applyMutations`. Never
   * throws.
   */
  async applyMutations(
    route: RouteSnapshot,
    context: RouteContext,
    mutations: Mutation[],
  ): Promise<ExecutorResult> {
    return applyMutationsImpl(route, context, mutations);
  }

  /**
   * Apply a manual user action (drag, add, remove, reverse, clear).
   * Delegates to `ManualHandlers.applyManualAction`. Never throws.
   */
  async applyManualAction(
    route: RouteSnapshot,
    context: RouteContext,
    action: ManualAction,
    payload: ManualActionPayload,
  ): Promise<ExecutorResult> {
    return applyManualActionImpl(route, context, action, payload);
  }

  /**
   * Generate one or more routes from constraints. No current route
   * required. Used for response_type "cold_start", "replace",
   * "alternatives".
   *
   * - `count: 1` (default) — returns a single `ExecutorResult`.
   * - `count: 3` — returns 3 alternative `ExecutorResult`s produced in
   *   parallel via variety perturbations. Failed alternatives are
   *   returned as `{ ok: false, ... }` entries rather than thrown.
   */
  async generate(
    context: RouteContext,
    constraints: GenerationConstraints,
  ): Promise<ExecutorResult>;
  async generate(
    context: RouteContext,
    constraints: GenerationConstraints,
    count: 1,
  ): Promise<ExecutorResult>;
  async generate(
    context: RouteContext,
    constraints: GenerationConstraints,
    count: 3,
  ): Promise<ExecutorResult[]>;
  async generate(
    context: RouteContext,
    constraints: GenerationConstraints,
    count?: 1 | 3,
  ): Promise<ExecutorResult | ExecutorResult[]>;
  async generate(
    context: RouteContext,
    constraints: GenerationConstraints,
    count: 1 | 3 = 1,
  ): Promise<ExecutorResult | ExecutorResult[]> {
    if (count === 3) {
      return generateAlternatives(context, constraints);
    }
    return generateOne(context, constraints);
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let instance: Executor | null = null;

/**
 * Production accessor for the shared `Executor`. Lazy-instantiates on
 * first call. All production code should import from
 * `src/routing/executor` (the top-level barrel) rather than this
 * module directly.
 */
export function getExecutor(): Executor {
  if (!instance) instance = new Executor();
  return instance;
}

/**
 * Test injection point. Pass an `Executor` (or a stub conforming to
 * its shape) to replace the singleton; pass `null` to reset and force
 * the next `getExecutor()` call to construct a fresh instance.
 */
export function setExecutor(executor: Executor | null): void {
  instance = executor;
}
