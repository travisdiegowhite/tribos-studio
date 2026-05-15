/**
 * MutationHandlers — the composition layer of the executor.
 *
 * Wires ConstraintBuilder (intent → constraint) and RouterClient
 * (constraint → route) into a single operation. After T2.3, the
 * LLM-driven path of the executor is functionally complete: given a
 * `Mutation`, the system produces a new `RouteSnapshot` or a structured
 * `ExecutorFailure`.
 *
 * There is no per-mutation-type handler at this layer. ConstraintBuilder
 * already does the per-type dispatch (its 19 `buildConstraintFor*`
 * functions); T2.3 just calls `buildConstraint` and lets it route
 * internally. Both entry points compose the same two steps.
 *
 * Public API: `applyMutation` (single) and `applyMutations`
 * (compositional, all-or-nothing). Both always return an
 * `ExecutorResult` — they never throw.
 *
 * T2.3 ships with no production callers. T2.5 (Executor facade) wires it
 * in. RouterClient and ConstraintBuilder are unchanged.
 */

import { getRouterClient } from '../../RouterClient';
import { buildConstraint, ConstraintBuilderError } from '../ConstraintBuilder';
import type {
  ExecutionMetadata,
  ExecutorFailure,
  ExecutorResult,
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../types';
import { translateConstraintBuilderError } from './errorTranslation';
import {
  trackMutationHandlerCompositionalRolledBack,
  trackMutationHandlerCompositionalStarted,
  trackMutationHandlerCompositionalSucceeded,
  trackMutationHandlerFailed,
  trackMutationHandlerStarted,
  trackMutationHandlerSucceeded,
} from './metrics';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Apply a single mutation to a route.
 *
 * Composes ConstraintBuilder (intent → constraint) and RouterClient
 * (constraint → route) into one operation.
 *
 * Always returns an `ExecutorResult`; never throws. All failures are
 * structured as `ExecutorFailure` within the result.
 *
 * @param _isCompositional - internal flag set by `applyMutations` so the
 *   `mutation_handler_started` event records whether this call is part
 *   of a compositional sequence. Callers outside this module leave it
 *   unset.
 */
export async function applyMutation(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Mutation,
  _isCompositional = false,
): Promise<ExecutorResult> {
  const startedAt = Date.now();
  trackMutationHandlerStarted(mutation.type, _isCompositional);

  // Phase 1 — intent → constraint (ConstraintBuilder).
  // ConstraintBuilder's documented contract is that it throws
  // `ConstraintBuilderError`; anything else escaping it is unexpected
  // and maps to `internal_error`. Either way the failure is attributed
  // to the constraint_builder origin.
  let constraint: RouteConstraint;
  try {
    constraint = buildConstraint(route, context, mutation);
  } catch (error) {
    const failure: ExecutorFailure =
      error instanceof ConstraintBuilderError
        ? translateConstraintBuilderError(error)
        : {
            kind: 'internal_error',
            message: `ConstraintBuilder threw: ${errorMessage(error)}`,
          };
    trackMutationHandlerFailed(
      mutation.type,
      Date.now() - startedAt,
      failure.kind,
      'constraint_builder',
    );
    return { ok: false, reason: failure };
  }

  // Phase 2 — constraint → route (RouterClient).
  // RouterClient's contract is to return an `ExecutorResult`, never to
  // throw; the try/catch is a defensive net so `applyMutation`'s
  // never-throws contract holds even if that's ever violated.
  try {
    const result = await getRouterClient().solve(constraint, context);
    if (result.ok) {
      trackMutationHandlerSucceeded(mutation.type, result.metadata);
      return result;
    }
    trackMutationHandlerFailed(
      mutation.type,
      Date.now() - startedAt,
      result.reason.kind,
      'router',
    );
    // RouterClient already speaks the canonical ExecutorFailure shape —
    // pass the failure through unchanged.
    return result;
  } catch (error) {
    const failure: ExecutorFailure = {
      kind: 'internal_error',
      message: `RouterClient threw: ${errorMessage(error)}`,
    };
    trackMutationHandlerFailed(
      mutation.type,
      Date.now() - startedAt,
      failure.kind,
      'router',
    );
    return { ok: false, reason: failure };
  }
}

/**
 * Apply an array of mutations sequentially, with all-or-nothing
 * rollback.
 *
 * Per Turn Model Spec §9:
 * - Mutations apply in array order.
 * - Each mutation's output route is the input to the next.
 * - If any mutation fails, ALL applied mutations are rolled back: the
 *   result carries `partial: originalRoute` — the *pre-turn* state, not
 *   the partial-progress route. Nothing was ever persisted, so this is a
 *   logical rollback, not a true one.
 * - An empty array is valid: returns the original route, success, with
 *   empty metadata.
 *
 * Always returns an `ExecutorResult`; never throws.
 */
export async function applyMutations(
  route: RouteSnapshot,
  context: RouteContext,
  mutations: Mutation[],
): Promise<ExecutorResult> {
  trackMutationHandlerCompositionalStarted(mutations.length);

  const originalRoute = route;
  let current = route;
  const metadataAcc: ExecutionMetadata[] = [];

  for (let i = 0; i < mutations.length; i++) {
    // Sequential, not parallel: each mutation depends on the previous
    // mutation's output route. `Promise.all` would be incorrect here.
    const result = await applyMutation(current, context, mutations[i], true);

    if (!result.ok) {
      trackMutationHandlerCompositionalRolledBack(
        mutations.length,
        i,
        result.reason.kind,
        sumDurationMs(metadataAcc),
      );
      // Rollback: return the pre-turn route as `partial`, NOT the
      // partial-progress route in `current`. The caller must not show
      // intermediate state to the user (Turn Model Spec §9).
      return { ok: false, reason: result.reason, partial: originalRoute };
    }

    current = result.route;
    metadataAcc.push(result.metadata);
  }

  trackMutationHandlerCompositionalSucceeded(
    mutations.length,
    sumDurationMs(metadataAcc),
  );
  return {
    ok: true,
    route: current,
    metadata: aggregateMetadata(metadataAcc),
  };
}

function sumDurationMs(metadatas: ExecutionMetadata[]): number {
  return metadatas.reduce((sum, m) => sum + m.duration_ms, 0);
}

/**
 * Fold N per-mutation metadata objects into one for a compositional
 * result. Semantics, per the T2.3 spec:
 * - `provider_used` — the *last* mutation's provider (most relevant to
 *   the final route the user ends up with).
 * - `duration_ms` — total across all steps, so timing budgets work.
 * - `cache_hit` — true only if *every* step was a cache hit.
 * - `attempts_tried` — total provider attempts across all steps.
 * - `constraint_relaxations` — accumulated across all steps.
 *
 * The empty-array case is handled explicitly: an empty compositional
 * call did no routing work, so it reports zeroed "empty metadata"
 * rather than the misleading `[].every() === true` cache-hit value.
 */
function aggregateMetadata(metadatas: ExecutionMetadata[]): ExecutionMetadata {
  if (metadatas.length === 0) {
    return {
      provider_used: null,
      duration_ms: 0,
      cache_hit: false,
      attempts_tried: 0,
      constraint_relaxations: [],
    };
  }
  return {
    provider_used: metadatas[metadatas.length - 1].provider_used,
    duration_ms: sumDurationMs(metadatas),
    cache_hit: metadatas.every((m) => m.cache_hit),
    attempts_tried: metadatas.reduce((sum, m) => sum + m.attempts_tried, 0),
    constraint_relaxations: metadatas.flatMap(
      (m) => m.constraint_relaxations ?? [],
    ),
  };
}
