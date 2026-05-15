import { describe, expect, it } from 'vitest';

import { ConstraintBuilderError } from '../../ConstraintBuilder';
import type { ConstraintBuilderErrorKind } from '../../ConstraintBuilder';
import { translateConstraintBuilderError } from '../errorTranslation';

describe('translateConstraintBuilderError', () => {
  it('translates context_missing to ExecutorFailure context_missing', () => {
    const error = new ConstraintBuilderError(
      'context_missing',
      'avoid_exposure',
      'avoid_exposure(wind) requires weather.wind_direction_deg.',
      { required_field: 'weather.wind_direction_deg' },
    );
    const failure = translateConstraintBuilderError(error);
    expect(failure).toEqual({
      kind: 'context_missing',
      required_field: 'weather.wind_direction_deg',
    });
  });

  it('translates infeasible_constraint to constraint_infeasible', () => {
    const error = new ConstraintBuilderError(
      'infeasible_constraint',
      'extend_distance',
      'Extension of 999km exceeds serviceable region (50km).',
    );
    const failure = translateConstraintBuilderError(error);
    expect(failure.kind).toBe('constraint_infeasible');
  });

  it('translates unsupported_mutation to mutation_not_supported', () => {
    const error = new ConstraintBuilderError(
      'unsupported_mutation',
      'change_climb_character',
      'change_climb_character is a v1 stub.',
    );
    const failure = translateConstraintBuilderError(error);
    expect(failure.kind).toBe('mutation_not_supported');
  });

  it('preserves mutationType in constraint_infeasible failure', () => {
    const error = new ConstraintBuilderError(
      'infeasible_constraint',
      'trim_route',
      'trim amount exceeds route length',
    );
    const failure = translateConstraintBuilderError(error);
    if (failure.kind !== 'constraint_infeasible') throw new Error('wrong kind');
    expect(failure.constraint).toBe('trim_route');
  });

  it('preserves mutationType in mutation_not_supported failure', () => {
    const error = new ConstraintBuilderError(
      'unsupported_mutation',
      'optimize_for',
      'optimize_for must be LLM-expanded',
    );
    const failure = translateConstraintBuilderError(error);
    if (failure.kind !== 'mutation_not_supported') throw new Error('wrong kind');
    expect(failure.mutation_type).toBe('optimize_for');
  });

  it('preserves the explanation message on constraint_infeasible', () => {
    const message = 'delta_km must be positive (got -3).';
    const error = new ConstraintBuilderError(
      'infeasible_constraint',
      'extend_distance',
      message,
    );
    const failure = translateConstraintBuilderError(error);
    if (failure.kind !== 'constraint_infeasible') throw new Error('wrong kind');
    expect(failure.explanation).toBe(message);
  });

  it('extracts required_field from error.details', () => {
    const error = new ConstraintBuilderError(
      'context_missing',
      'change_route_shape',
      'change_route_shape(loop) requires start_coord or at least one waypoint.',
      { required_field: 'start_coord' },
    );
    const failure = translateConstraintBuilderError(error);
    if (failure.kind !== 'context_missing') throw new Error('wrong kind');
    expect(failure.required_field).toBe('start_coord');
  });

  it('falls back to parsing required_field from the message when details absent', () => {
    const error = new ConstraintBuilderError(
      'context_missing',
      'avoid_exposure',
      'missing required field: weather',
    );
    const failure = translateConstraintBuilderError(error);
    if (failure.kind !== 'context_missing') throw new Error('wrong kind');
    expect(failure.required_field).toBe('weather');
  });

  it('falls back to "unknown" when required_field cannot be determined', () => {
    const error = new ConstraintBuilderError(
      'context_missing',
      'avoid_exposure',
      'something is missing but the message does not say what',
    );
    const failure = translateConstraintBuilderError(error);
    if (failure.kind !== 'context_missing') throw new Error('wrong kind');
    expect(failure.required_field).toBe('unknown');
  });

  it('falls back to internal_error for an unknown ConstraintBuilderError kind', () => {
    const error = new ConstraintBuilderError(
      'some_future_kind' as ConstraintBuilderErrorKind,
      'reverse_route',
      'a kind T2.3 has never seen',
    );
    const failure = translateConstraintBuilderError(error);
    if (failure.kind !== 'internal_error') throw new Error('wrong kind');
    expect(failure.message).toContain('some_future_kind');
  });
});
