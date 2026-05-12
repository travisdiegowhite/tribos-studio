/**
 * Coordinate boundary converters.
 *
 * Each external API/format that doesn't use the canonical `[lng, lat]`
 * convention gets a named converter here. Inline conversions in feature
 * code are a contract violation — always go through one of these.
 *
 * See `src/types/geo.ts` for the canonical `Coordinate` type and
 * `coord-audit-report.md` for the full inventory of boundary sites.
 */

import type { Coordinate } from '../types/geo';

// ---------------------------------------------------------------------------
// Mapbox
//
// Mapbox GL (both the map renderer and the Directions/MapMatching APIs)
// is `[lng, lat]` natively — same as canonical. The one wrinkle is that
// Mapbox GL DOM events (click, drag) deliver an `event.lngLat` object
// of shape `{lng, lat}`. Convert at the event handler.
// ---------------------------------------------------------------------------

/** Mapbox GL event payload (`event.lngLat`). */
export interface MapboxLngLat {
  lng: number;
  lat: number;
}

export function mapboxEventToCanonical(lngLat: MapboxLngLat): Coordinate {
  return [lngLat.lng, lngLat.lat];
}

// ---------------------------------------------------------------------------
// Stadia Maps / Valhalla
//
// Valhalla `/route` and `/expansion` requests take `{lat, lon}` per
// location in the body. Responses use polyline-encoded geometry which
// our `decodePolyline` already emits as canonical arrays.
// ---------------------------------------------------------------------------

export interface ValhallaLocation {
  lat: number;
  lon: number;
}

export function canonicalToValhalla(c: Coordinate): ValhallaLocation {
  return { lon: c[0], lat: c[1] };
}

export function valhallaToCanonical(loc: ValhallaLocation): Coordinate {
  return [loc.lon, loc.lat];
}

// ---------------------------------------------------------------------------
// BRouter
//
// Takes `lonlats=` in the query string as `lon,lat|lon,lat|…`. Response
// geometry is GeoJSON `[lng, lat]` arrays — canonical.
// ---------------------------------------------------------------------------

export function canonicalToBRouter(coords: readonly Coordinate[]): string {
  return coords.map(([lng, lat]) => `${lng},${lat}`).join('|');
}

// ---------------------------------------------------------------------------
// Open-Elevation
//
// Request body: `{ locations: [{ latitude, longitude }, …] }`.
// Response: `{ results: [{ latitude, longitude, elevation }, …] }`.
// ---------------------------------------------------------------------------

export interface OpenElevationLocation {
  latitude: number;
  longitude: number;
}

export interface OpenElevationResult extends OpenElevationLocation {
  elevation: number;
}

export function canonicalToOpenElevation(c: Coordinate): OpenElevationLocation {
  return { latitude: c[1], longitude: c[0] };
}

export function openElevationToCanonical(
  r: OpenElevationResult,
): { coordinate: Coordinate; elevation: number } {
  return { coordinate: [r.longitude, r.latitude], elevation: r.elevation };
}

// ---------------------------------------------------------------------------
// OpenTopoData (via our /api/elevation proxy)
//
// Request: `coordinates: [[lng, lat], …]` (already canonical).
// Response per result: `{ lat, lon, elevation }`.
// ---------------------------------------------------------------------------

export interface OpenTopoResult {
  lat: number;
  lon: number;
  elevation: number;
}

export function openTopoToCanonical(
  r: OpenTopoResult,
): { coordinate: Coordinate; elevation: number } {
  return { coordinate: [r.lon, r.lat], elevation: r.elevation };
}

// ---------------------------------------------------------------------------
// Activity import (Strava polyline, FIT records, GPX track points)
//
// All three sources use a per-point `{latitude, longitude}` shape.
// Per the T1.2 spec ("hidden landmine"), every consumer that hands an
// imported track-point stream to downstream analysis converts through
// this helper. The parsers themselves keep their existing output shape
// — that's a deliberate constraint to avoid breaking the import path.
// ---------------------------------------------------------------------------

export interface ActivityTrackPoint {
  latitude: number;
  longitude: number;
}

export function activityPointToCanonical(p: ActivityTrackPoint): Coordinate {
  return [p.longitude, p.latitude];
}

export function activityPointsToCanonical(
  points: readonly ActivityTrackPoint[],
): Coordinate[] {
  return points.map(activityPointToCanonical);
}

// ---------------------------------------------------------------------------
// Supabase `routes.start_*` / `routes.end_*` scalar columns
//
// `routes` stores start/end coordinates as four scalar columns
// (`start_latitude`, `start_longitude`, `end_latitude`, `end_longitude`).
// Every reader assembles the canonical pair manually; do it here once.
// ---------------------------------------------------------------------------

export interface RouteRowStart {
  start_latitude: number | null | undefined;
  start_longitude: number | null | undefined;
}
export interface RouteRowEnd {
  end_latitude: number | null | undefined;
  end_longitude: number | null | undefined;
}

export function routeRowStartToCanonical(
  row: RouteRowStart,
): Coordinate | null {
  if (row.start_latitude == null || row.start_longitude == null) return null;
  return [row.start_longitude, row.start_latitude];
}

export function routeRowEndToCanonical(row: RouteRowEnd): Coordinate | null {
  if (row.end_latitude == null || row.end_longitude == null) return null;
  return [row.end_longitude, row.end_latitude];
}

// ---------------------------------------------------------------------------
// Loose normaliser
//
// Five modules in the codebase (`aiRouteGenerator.js`,
// `claudeRouteService.js`, `enhancedContext.js`, `iterativeRouteBuilder.js`,
// `rideAnalysis.js`) carry private helpers that accept "any of:
// `[lng, lat]`, `{lng, lat}`, `{lon, lat}`, `{longitude, latitude}`" and
// emit canonical arrays. Consolidate them.
//
// This is a tolerant converter for **input from untyped sources** (e.g.
// JSON bodies in API requests, persisted localStorage state from before
// the contract). New code should NOT call this — it exists to absorb
// historical shape drift without forcing a rewrite of every caller.
// ---------------------------------------------------------------------------

export type LooseCoordinate =
  | readonly [number, number]
  | { lng: number; lat: number }
  | { lon: number; lat: number }
  | { longitude: number; latitude: number };

export function looseToCanonical(value: unknown): Coordinate | null {
  if (Array.isArray(value)) {
    if (value.length < 2) return null;
    const [lng, lat] = value;
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    return [lng, lat];
  }
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const lng = v.lng ?? v.lon ?? v.longitude;
    const lat = v.lat ?? v.latitude;
    if (typeof lng === 'number' && typeof lat === 'number') {
      return [lng, lat];
    }
  }
  return null;
}
