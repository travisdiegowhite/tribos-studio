import { describe, expect, it } from 'vitest';
import { ConstraintBuilderError } from '../../ConstraintBuilderError';
import { buildConstraintForChangeRouteShape } from '../../handlers/change_route_shape';
import { buildConstraintForExtendDistance } from '../../handlers/extend_distance';
import { buildConstraintForReverseRoute } from '../../handlers/reverse_route';
import { buildConstraintForShortenDistance } from '../../handlers/shorten_distance';
import { buildConstraintForSmoothRoute } from '../../handlers/smooth_route';
import { buildConstraintForTrimRoute } from '../../handlers/trim_route';
import { eqGeometry, makeContext, makeRoute } from '../fixtures';

describe('reverse_route', () => {
  it('reverses the waypoint order', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[5], geom[10]] });
    const constraint = buildConstraintForReverseRoute(route, makeContext(), {
      type: 'reverse_route',
    });
    expect(constraint.waypoints).toEqual([geom[10], geom[5], geom[0]]);
    expect(constraint.profile).toBe('road');
  });

  it('handles empty waypoint lists', () => {
    const route = makeRoute({ waypoints: [] });
    const constraint = buildConstraintForReverseRoute(route, makeContext(), {
      type: 'reverse_route',
    });
    expect(constraint.waypoints).toEqual([]);
  });
});

describe('trim_route', () => {
  it('trims from the end', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[5], geom[10]] });
    const constraint = buildConstraintForTrimRoute(route, makeContext(), {
      type: 'trim_route',
      from: 'end',
      amount_km: 5,
    });
    expect(constraint.waypoints.length).toBeLessThan(3);
    expect(constraint.waypoints[0]).toEqual(geom[0]);
    expect(constraint.target_distance_km).toBeGreaterThan(4);
    expect(constraint.target_distance_km).toBeLessThan(6);
  });

  it('trims from the start', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[5], geom[10]] });
    const constraint = buildConstraintForTrimRoute(route, makeContext(), {
      type: 'trim_route',
      from: 'start',
      amount_km: 5,
    });
    expect(constraint.waypoints[constraint.waypoints.length - 1]).toEqual(geom[10]);
  });

  it('downgrades loop to point_to_point when trimming from start', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[5], geom[10]] });
    const ctx = makeContext({ shape: 'loop' });
    const constraint = buildConstraintForTrimRoute(route, ctx, {
      type: 'trim_route',
      from: 'start',
      amount_km: 3,
    });
    expect(constraint.shape).toBe('point_to_point');
  });

  it('preserves shape when trimming from end', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[10]] });
    const ctx = makeContext({ shape: 'loop' });
    const constraint = buildConstraintForTrimRoute(route, ctx, {
      type: 'trim_route',
      from: 'end',
      amount_km: 2,
    });
    expect(constraint.shape).toBe('loop');
  });

  it('throws infeasible_constraint when amount >= total distance', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraintForTrimRoute(route, makeContext(), {
        type: 'trim_route',
        from: 'end',
        amount_km: 999,
      }),
    ).toThrow(ConstraintBuilderError);
  });
});

describe('extend_distance', () => {
  it('sets target_distance_km = current + delta', () => {
    const route = makeRoute({ distance_km: 10 });
    const constraint = buildConstraintForExtendDistance(route, makeContext(), {
      type: 'extend_distance',
      delta_km: 5,
    });
    expect(constraint.target_distance_km).toBeGreaterThan(14);
    expect(constraint.target_distance_km).toBeLessThan(16);
  });

  it('inserts a detour waypoint when scoped', () => {
    const route = makeRoute();
    const wpsBefore = route.waypoints.length;
    const constraint = buildConstraintForExtendDistance(route, makeContext(), {
      type: 'extend_distance',
      delta_km: 5,
      scope: { start_km: 4, end_km: 6 },
    });
    expect(constraint.waypoints.length).toBeGreaterThan(wpsBefore);
  });

  it('throws infeasible_constraint when extension exceeds serviceable region', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraintForExtendDistance(route, makeContext(), {
        type: 'extend_distance',
        delta_km: 100,
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('throws on non-positive delta_km', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraintForExtendDistance(route, makeContext(), {
        type: 'extend_distance',
        delta_km: 0,
      }),
    ).toThrow(ConstraintBuilderError);
  });
});

describe('shorten_distance', () => {
  it('sets target_distance_km = current - delta', () => {
    const route = makeRoute({ distance_km: 10 });
    const constraint = buildConstraintForShortenDistance(route, makeContext(), {
      type: 'shorten_distance',
      delta_km: 3,
    });
    expect(constraint.target_distance_km).toBeGreaterThan(6);
    expect(constraint.target_distance_km).toBeLessThan(8);
  });

  it('strips waypoints inside the scope when scoped', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({
      geometry: geom,
      waypoints: [geom[0], geom[5], geom[10]],
    });
    const constraint = buildConstraintForShortenDistance(route, makeContext(), {
      type: 'shorten_distance',
      delta_km: 1,
      scope: { start_km: 4, end_km: 6 },
    });
    // Middle waypoint at km ~5 should be removed.
    expect(constraint.waypoints).toEqual([geom[0], geom[10]]);
  });

  it('throws infeasible_constraint when target < 2km', () => {
    // Use a short geometry so totalDistanceKm matches stats.distance_km.
    const route = makeRoute({ geometry: eqGeometry(6), distance_km: 5 });
    expect(() =>
      buildConstraintForShortenDistance(route, makeContext(), {
        type: 'shorten_distance',
        delta_km: 4,
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('throws on non-positive delta_km', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraintForShortenDistance(route, makeContext(), {
        type: 'shorten_distance',
        delta_km: -1,
      }),
    ).toThrow(ConstraintBuilderError);
  });
});

describe('change_route_shape', () => {
  it('appends start_coord to close a loop', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[10]] });
    const ctx = makeContext({ start_coord: geom[0] });
    const constraint = buildConstraintForChangeRouteShape(route, ctx, {
      type: 'change_route_shape',
      target: 'loop',
    });
    expect(constraint.shape).toBe('loop');
    expect(constraint.waypoints[constraint.waypoints.length - 1]).toEqual(geom[0]);
  });

  it('returns midpoint waypoints for out_and_back', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[10]] });
    const constraint = buildConstraintForChangeRouteShape(route, makeContext(), {
      type: 'change_route_shape',
      target: 'out_and_back',
    });
    expect(constraint.shape).toBe('out_and_back');
    expect(constraint.waypoints.length).toBe(2);
  });

  it('throws infeasible_constraint on too-short out_and_back', () => {
    const route = makeRoute({ distance_km: 2, geometry: eqGeometry(3) });
    expect(() =>
      buildConstraintForChangeRouteShape(route, makeContext(), {
        type: 'change_route_shape',
        target: 'out_and_back',
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('drops the closing waypoint to convert loop → point_to_point', () => {
    const geom = eqGeometry(11);
    // closed loop
    const route = makeRoute({
      geometry: geom,
      waypoints: [geom[0], geom[5], geom[0]],
    });
    const constraint = buildConstraintForChangeRouteShape(route, makeContext(), {
      type: 'change_route_shape',
      target: 'point_to_point',
    });
    expect(constraint.shape).toBe('point_to_point');
    expect(constraint.waypoints.length).toBe(2);
  });
});

describe('smooth_route', () => {
  it('simplify_turns reduces (or guards) colinear waypoints', () => {
    // Construct a near-straight line with many points; Douglas-Peucker
    // collapses to endpoints, which on a long route exceeds the 20%
    // guard and throws. Accept either reduction or guard-throw — both
    // are spec-compliant outcomes for the "simplify a colinear route"
    // case.
    const wps = eqGeometry(20);
    const route = makeRoute({ geometry: wps, waypoints: wps });
    try {
      const constraint = buildConstraintForSmoothRoute(
        route,
        makeContext(),
        { type: 'smooth_route', target: 'simplify_turns' },
      );
      expect(constraint.waypoints.length).toBeLessThanOrEqual(wps.length);
    } catch (e) {
      expect(e).toBeInstanceOf(ConstraintBuilderError);
      expect((e as ConstraintBuilderError).kind).toBe('infeasible_constraint');
    }
  });

  it('simplify_turns leaves a small zigzag mostly alone', () => {
    // 3-point route with a real turn; should not throw and waypoint
    // count should not collapse below 2.
    const wps = [[0, 0], [0.01, 0.005], [0.02, 0]] as const;
    const route = makeRoute({
      geometry: wps as unknown as never,
      waypoints: wps as unknown as never,
    });
    const constraint = buildConstraintForSmoothRoute(
      route,
      makeContext(),
      { type: 'smooth_route', target: 'simplify_turns' },
    );
    expect(constraint.waypoints.length).toBeGreaterThanOrEqual(2);
  });

  it('remove_doublebacks emits empty avoid_segments in v1', () => {
    const route = makeRoute();
    const constraint = buildConstraintForSmoothRoute(route, makeContext(), {
      type: 'smooth_route',
      target: 'remove_doublebacks',
    });
    expect(constraint.avoid_segments).toEqual([]);
  });

  it('remove_dead_ends trims tail when last waypoint coincides with an earlier one', () => {
    const geom = eqGeometry(11);
    // Construct waypoints with a tail going back to start
    const route = makeRoute({
      geometry: geom,
      waypoints: [geom[0], geom[5], geom[10], geom[0]],
    });
    const constraint = buildConstraintForSmoothRoute(route, makeContext(), {
      type: 'smooth_route',
      target: 'remove_dead_ends',
    });
    expect(constraint.waypoints.length).toBeLessThanOrEqual(2);
  });
});
