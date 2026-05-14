/**
 * anchor_through — confidence: reliable.
 *
 * Inserts a waypoint at the nearest position along the existing
 * geometry. The router stitches the new waypoint into the route at
 * solve() time.
 */

import { haversineKm } from '../../../../utils/distanceUnits';
import { isValidCoordinate } from '../../../../types/geo';
import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';

const MAX_ANCHOR_DISTANCE_KM = 100;

export function buildConstraintForAnchorThrough(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'anchor_through' }>,
): RouteConstraint {
  const anchor = mutation.coordinate;
  if (!isValidCoordinate(anchor)) {
    throw new ConstraintBuilderError(
      'infeasible_constraint',
      'anchor_through',
      `anchor_through coordinate is not a valid [lng, lat]: ${JSON.stringify(anchor)}`,
    );
  }

  if (route.waypoints.length === 0) {
    return {
      waypoints: [anchor],
      profile: context.profile ?? 'road',
      shape: context.shape ?? 'point_to_point',
    };
  }

  // Reject anchors absurdly far from the route.
  let nearestKm = Infinity;
  for (const wp of route.waypoints) {
    const [lng1, lat1] = wp.coordinate;
    const [lng2, lat2] = anchor;
    const d = haversineKm(lat1, lng1, lat2, lng2);
    if (d < nearestKm) nearestKm = d;
  }
  if (nearestKm > MAX_ANCHOR_DISTANCE_KM) {
    throw new ConstraintBuilderError(
      'infeasible_constraint',
      'anchor_through',
      `anchor_through coordinate is ${nearestKm.toFixed(1)}km from the nearest waypoint (max ${MAX_ANCHOR_DISTANCE_KM}km).`,
    );
  }

  // Find the waypoint pair whose midpoint is closest to the anchor; insert between them.
  const wps = route.waypoints.map((wp) => wp.coordinate);
  let insertAt = wps.length; // default: end
  let bestDist = Infinity;
  for (let i = 0; i < wps.length; i++) {
    const [lng1, lat1] = wps[i];
    const [lng2, lat2] = anchor;
    const d = haversineKm(lat1, lng1, lat2, lng2);
    if (d < bestDist) {
      bestDist = d;
      insertAt = i + 1;
    }
  }
  // If the nearest waypoint is the last one and the anchor is past it, append.
  // Otherwise insert just after the nearest waypoint.
  const newWaypoints: Coordinate[] = [
    ...wps.slice(0, insertAt),
    anchor,
    ...wps.slice(insertAt),
  ];

  return {
    waypoints: newWaypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
  };
}
