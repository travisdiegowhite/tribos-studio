/**
 * MutationHandlers public API.
 *
 * The composition layer that wires ConstraintBuilder (intent →
 * constraint) and RouterClient (constraint → route) together. Two
 * functions, both `Promise<ExecutorResult>`, neither throws.
 *
 * T2.3 ships this module with zero production callers. T2.5 (Executor
 * facade) wires it in.
 */

export { applyMutation, applyMutations } from './MutationHandlers';
export { translateConstraintBuilderError } from './errorTranslation';
export type { FailureOrigin } from './metrics';
