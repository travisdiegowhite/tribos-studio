import { describe, it, expect } from 'vitest';
import { avoidOptionsOf } from '../routeAvoid';
import { buildBicycleCosting as buildCosting } from '../stadiaMapsRouter';

/** The costing builder with only preferences set (the JS signature wants every option). */
const buildBicycleCosting = (profile: string, opts: { preferences: unknown }) =>
  buildCosting(profile, { preferences: opts.preferences, trainingGoal: undefined, userSpeed: undefined, useHills: undefined });
import { tribosParamsFor, renderTribosProfile } from '../brouterProfiles';
import { tribosForProfileName } from '../brouter';

describe('avoidOptionsOf', () => {
  it('reads flat or nested shapes and defaults to off', () => {
    expect(avoidOptionsOf(null)).toEqual({ unpaved: false, mainRoads: false });
    expect(avoidOptionsOf({ avoid: { unpaved: true } })).toEqual({ unpaved: true, mainRoads: false });
    expect(avoidOptionsOf({ routingPreferences: { avoid: { mainRoads: true } } })).toEqual({ unpaved: false, mainRoads: true });
  });
});

describe('Stadia costing with Avoid', () => {
  const base = buildBicycleCosting('gravel', { preferences: { trafficTolerance: 'high' } });

  it('avoid unpaved sets avoid_bad_surfaces to the maximum', () => {
    const c = buildBicycleCosting('gravel', { preferences: { trafficTolerance: 'high', avoid: { unpaved: true } } });
    expect(base.avoid_bad_surfaces).toBeLessThan(1);
    expect(c.avoid_bad_surfaces).toBe(1);
  });

  it('avoid main roads pushes use_roads down and residential streets up', () => {
    const c = buildBicycleCosting('road', { preferences: { trafficTolerance: 'high', avoid: { mainRoads: true } } });
    expect(c.use_roads).toBeLessThanOrEqual(0.05);
    expect(c.use_living_streets).toBeGreaterThanOrEqual(0.8);
  });

  it('leaves costing untouched with no toggles on', () => {
    const c = buildBicycleCosting('gravel', { preferences: { trafficTolerance: 'high', avoid: { unpaved: false, mainRoads: false } } });
    expect(c).toEqual(base);
  });
});

describe('BRouter Tribos profile with Avoid main roads', () => {
  it('renders avoid_unsafe = true only when asked', () => {
    const off = renderTribosProfile(tribosParamsFor({ surface: 'road', comfortLevel: 3 }));
    const on = renderTribosProfile(tribosParamsFor({ surface: 'road', comfortLevel: 3, avoidMainRoads: true }));
    expect(off).toMatch(/assign\s+avoid_unsafe\s+=\s+false/);
    expect(on).toMatch(/assign\s+avoid_unsafe\s+=\s+true/);
    // Riders who never use the toggle keep the exact same profile text (and cached upload id).
    expect(tribosParamsFor({ surface: 'road', comfortLevel: 3 })).not.toHaveProperty('avoid_unsafe');
  });

  it('flows through the named-profile upgrade', () => {
    expect(tribosForProfileName('trekking', 'medium', null, 2, true)).toMatchObject({ avoid_unsafe: true });
    expect(tribosForProfileName('gravel', 'medium', 40, 2, true)).toMatchObject({ avoid_unsafe: true, template: 'gravel' });
  });
});
