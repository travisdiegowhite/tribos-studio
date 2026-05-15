/**
 * Executor facade public API.
 *
 * Production callers should use `getExecutor()`. Tests can construct
 * directly via `new Executor(...)` or replace the singleton via
 * `setExecutor(...)`.
 */

export { Executor, getExecutor, setExecutor } from './Executor';
export type { ExecutorConfig } from './Executor';
export { PERTURBATION_STRATEGIES, varietyPerturbation } from './variety';
export type { PerturbationStrategy } from './variety';
