import { describe, expect, it } from 'vitest';
import { ConstraintBuilderError } from '../../ConstraintBuilderError';
import { buildConstraintForAnchorAtPoi } from '../../handlers/anchor_at_poi';
import { buildConstraintForAnchorThrough } from '../../handlers/anchor_through';
import { buildConstraintForAvoidSegment } from '../../handlers/avoid_segment';
import { buildConstraintForAvoidSegmentByProperty } from '../../handlers/avoid_segment_by_property';
import { eqGeometry, makeContext, makeRoute } from '../fixtures';

describe('anchor_through', () => {
  it('inserts the anchor between the nearest waypoint pair', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[10]] });
    const anchor = geom[5];
    const constraint = buildConstraintForAnchorThrough(route, makeContext(), {
      type: 'anchor_through',
      coordinate: anchor,
    });
    expect(constraint.waypoints).toContainEqual(anchor);
    expect(constraint.waypoints.length).toBe(3);
  });

  it('throws infeasible_constraint for an invalid coordinate', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraintForAnchorThrough(route, makeContext(), {
        type: 'anchor_through',
        coordinate: [999, 999] as unknown as readonly [number, number],
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('throws infeasible_constraint for a coordinate >100km from the route', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[10]] });
    expect(() =>
      buildConstraintForAnchorThrough(route, makeContext(), {
        type: 'anchor_through',
        coordinate: [50, 0],
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('handles routes with no existing waypoints by seeding the anchor', () => {
    const route = makeRoute({ waypoints: [] });
    const constraint = buildConstraintForAnchorThrough(route, makeContext(), {
      type: 'anchor_through',
      coordinate: [0, 0],
    });
    expect(constraint.waypoints).toEqual([[0, 0]]);
  });
});

describe('avoid_segment', () => {
  it('adds segment_id to avoid_segments', () => {
    const route = makeRoute();
    const constraint = buildConstraintForAvoidSegment(route, makeContext(), {
      type: 'avoid_segment',
      segment_id: 'seg-42',
    });
    expect(constraint.avoid_segments).toEqual(['seg-42']);
  });

  it('preserves waypoints', () => {
    const geom = eqGeometry(5);
    const route = makeRoute({ geometry: geom, waypoints: [geom[0], geom[4]] });
    const constraint = buildConstraintForAvoidSegment(route, makeContext(), {
      type: 'avoid_segment',
      segment_id: 'x',
    });
    expect(constraint.waypoints).toEqual([geom[0], geom[4]]);
  });
});

describe('anchor_at_poi (STUB)', () => {
  it('always throws unsupported_mutation', () => {
    const route = makeRoute();
    try {
      buildConstraintForAnchorAtPoi(route, makeContext(), {
        type: 'anchor_at_poi',
        poi_query: 'coffee near route',
      });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConstraintBuilderError);
      expect((e as ConstraintBuilderError).kind).toBe('unsupported_mutation');
      expect((e as ConstraintBuilderError).mutationType).toBe('anchor_at_poi');
    }
  });
});

describe('avoid_segment_by_property (STUB)', () => {
  it('always throws unsupported_mutation', () => {
    const route = makeRoute();
    try {
      buildConstraintForAvoidSegmentByProperty(route, makeContext(), {
        type: 'avoid_segment_by_property',
        property: 'steep_climb',
      });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConstraintBuilderError);
      expect((e as ConstraintBuilderError).kind).toBe('unsupported_mutation');
      expect((e as ConstraintBuilderError).mutationType).toBe(
        'avoid_segment_by_property',
      );
    }
  });
});
