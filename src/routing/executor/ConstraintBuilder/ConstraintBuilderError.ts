import type { MutationType } from '../types';

export type ConstraintBuilderErrorKind =
  | 'context_missing'
  | 'unsupported_mutation'
  | 'infeasible_constraint';

/**
 * Error class for ConstraintBuilder translation failures.
 *
 * Callers in T2.3 (MutationHandlers) catch and convert to
 * `ExecutorFailure`:
 * - `context_missing`   → ExecutorFailure { kind: 'context_missing', required_field }
 * - `unsupported_mutation` → ExecutorFailure { kind: 'mutation_not_supported', mutation_type }
 * - `infeasible_constraint` → ExecutorFailure { kind: 'constraint_infeasible', constraint, explanation }
 */
export class ConstraintBuilderError extends Error {
  public readonly kind: ConstraintBuilderErrorKind;
  public readonly mutationType: MutationType;
  public readonly details?: Record<string, unknown>;

  constructor(
    kind: ConstraintBuilderErrorKind,
    mutationType: MutationType,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ConstraintBuilderError';
    this.kind = kind;
    this.mutationType = mutationType;
    this.details = details;
  }
}
