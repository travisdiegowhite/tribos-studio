/**
 * Error translation: ConstraintBuilderError → ExecutorFailure.
 *
 * ConstraintBuilder (T2.2) signals translation failures by throwing a
 * typed `ConstraintBuilderError`. MutationHandlers catches it and maps
 * it onto the canonical `ExecutorFailure` shape so the caller (T2.5
 * facade, ultimately the Turn Model dispatcher in Doc 2b) can pick the
 * right response_type without knowing ConstraintBuilder's internals.
 *
 * RouterClient failures need no translation — RouterClient already
 * returns the canonical `ExecutorFailure` shape (per T2.1), so
 * MutationHandlers passes those through unchanged.
 */

import { ConstraintBuilderError } from '../ConstraintBuilder';
import type { ExecutorFailure } from '../types';

/**
 * Map a `ConstraintBuilderError` onto an `ExecutorFailure`.
 *
 * | ConstraintBuilderError.kind | ExecutorFailure.kind     |
 * |-----------------------------|--------------------------|
 * | `context_missing`           | `context_missing`        |
 * | `infeasible_constraint`     | `constraint_infeasible`  |
 * | `unsupported_mutation`      | `mutation_not_supported` |
 * | (anything else)             | `internal_error`         |
 */
export function translateConstraintBuilderError(
  error: ConstraintBuilderError,
): ExecutorFailure {
  switch (error.kind) {
    case 'context_missing':
      return {
        kind: 'context_missing',
        required_field: extractRequiredField(error),
      };
    case 'infeasible_constraint':
      return {
        kind: 'constraint_infeasible',
        constraint: error.mutationType,
        explanation: error.message,
      };
    case 'unsupported_mutation':
      return {
        kind: 'mutation_not_supported',
        mutation_type: error.mutationType,
      };
    default:
      // ConstraintBuilderErrorKind is a closed union of the three kinds
      // above, so this is unreachable through the type system. Kept as a
      // defensive net in case T2.2 adds a kind without updating T2.3.
      return {
        kind: 'internal_error',
        message: `Unknown ConstraintBuilderError kind: ${
          (error as { kind: string }).kind
        }`,
      };
  }
}

/**
 * Pull `required_field` out of a `context_missing` error.
 *
 * T2.2's handlers attach `{ required_field }` to `error.details` on
 * every `context_missing` throw (verified across all three call sites:
 * `change_route_shape`, `avoid_exposure` wind + sun). The message-parse
 * fallback exists only for forward-compatibility if a future handler
 * forgets the structured field.
 */
function extractRequiredField(error: ConstraintBuilderError): string {
  if (error.details && error.details.required_field != null) {
    return String(error.details.required_field);
  }
  const match = error.message.match(/required field: (\w+)/i);
  return match ? match[1] : 'unknown';
}
