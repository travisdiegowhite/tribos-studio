import { describe, expect, it } from 'vitest';
import { ConstraintBuilderError } from '../../ConstraintBuilderError';
import { buildConstraintForSwapToFamiliar } from '../../handlers/swap_to_familiar';
import { buildConstraintForSwapToUnfamiliar } from '../../handlers/swap_to_unfamiliar';
import { makeContext, makeRoute } from '../fixtures';

describe('swap_to_familiar', () => {
  it('promotes familiar segments to prefer_segments', () => {
    const route = makeRoute();
    const ctx = makeContext({ familiar_segments: ['a', 'b', 'c'] });
    const constraint = buildConstraintForSwapToFamiliar(route, ctx, {
      type: 'swap_to_familiar',
      region: 'colorado-front-range',
    });
    expect(constraint.prefer_segments).toEqual(['a', 'b', 'c']);
  });

  it('throws infeasible_constraint when user has no familiar segments', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraintForSwapToFamiliar(route, makeContext(), {
        type: 'swap_to_familiar',
        region: 'anywhere',
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('throws infeasible_constraint on empty familiar_segments', () => {
    const route = makeRoute();
    const ctx = makeContext({ familiar_segments: [] });
    expect(() =>
      buildConstraintForSwapToFamiliar(route, ctx, {
        type: 'swap_to_familiar',
        region: 'anywhere',
      }),
    ).toThrow(ConstraintBuilderError);
  });
});

describe('swap_to_unfamiliar', () => {
  it('adds familiar segments to exclude_segments', () => {
    const route = makeRoute();
    const ctx = makeContext({ familiar_segments: ['a', 'b'] });
    const constraint = buildConstraintForSwapToUnfamiliar(route, ctx, {
      type: 'swap_to_unfamiliar',
      region: 'anywhere',
    });
    expect(constraint.exclude_segments).toEqual(['a', 'b']);
  });

  it('produces an empty exclude_segments list when no familiar segments', () => {
    const route = makeRoute();
    const constraint = buildConstraintForSwapToUnfamiliar(route, makeContext(), {
      type: 'swap_to_unfamiliar',
      region: 'anywhere',
    });
    expect(constraint.exclude_segments).toEqual([]);
  });
});
