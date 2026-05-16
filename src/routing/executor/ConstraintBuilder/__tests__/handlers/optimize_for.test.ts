import { describe, expect, it } from 'vitest';
import { ConstraintBuilderError } from '../../ConstraintBuilderError';
import { buildConstraintForOptimizeFor } from '../../handlers/optimize_for';
import { makeContext, makeRoute } from '../fixtures';

describe('optimize_for (safety net)', () => {
  it('always throws unsupported_mutation', () => {
    const route = makeRoute();
    try {
      buildConstraintForOptimizeFor(route, makeContext(), {
        type: 'optimize_for',
        criterion: 'scenery',
      });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConstraintBuilderError);
      expect((e as ConstraintBuilderError).kind).toBe('unsupported_mutation');
      expect((e as ConstraintBuilderError).mutationType).toBe('optimize_for');
      // The message should mention Option Y so debugging is straightforward.
      expect((e as ConstraintBuilderError).message).toMatch(/Option Y/);
    }
  });

  it.each(['scenery', 'training_value', 'speed', 'social'] as const)(
    'throws for criterion %s',
    (criterion) => {
      const route = makeRoute();
      expect(() =>
        buildConstraintForOptimizeFor(route, makeContext(), {
          type: 'optimize_for',
          criterion,
        }),
      ).toThrow(ConstraintBuilderError);
    },
  );
});
