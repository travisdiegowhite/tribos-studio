import { describe, it, expect, vi } from 'vitest';

vi.mock('./utils/supabaseAdmin.js', () => ({ getSupabaseAdmin: () => ({}) }));

const { sportProfileFromBody } = await import('./onboarding-complete.js');

describe('sportProfileFromBody', () => {
  it('passes a valid choice through in a stable order', () => {
    expect(sportProfileFromBody(['running', 'cycling'], 'running')).toEqual({
      sports: ['cycling', 'running'],
      primary_sport: 'running',
    });
    expect(sportProfileFromBody(['running'], 'running')).toEqual({ sports: ['running'], primary_sport: 'running' });
  });

  it('is null for an older client that sends no sport', () => {
    expect(sportProfileFromBody(undefined, undefined)).toBeNull();
    expect(sportProfileFromBody([], null)).toBeNull();
  });

  it('drops unknown sports and keeps the primary inside the set', () => {
    expect(sportProfileFromBody(['swimming', 'cycling'], 'swimming')).toEqual({
      sports: ['cycling'],
      primary_sport: 'cycling',
    });
    expect(sportProfileFromBody('cycling', 'running')).toEqual({ sports: ['running'], primary_sport: 'running' });
  });
});
