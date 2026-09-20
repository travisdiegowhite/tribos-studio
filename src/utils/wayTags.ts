/**
 * wayTags — turn BRouter's per-segment OSM tags into tagged ways.
 *
 * A BRouter GeoJSON response carries `properties.messages`: a table whose row
 * 0 is the column header and rows 1+ are emitted each time the way tags change
 * along the track. Each row holds the END node of that run (lon/lat as
 * integer microdegrees, as strings), the run's `Distance` in metres and a
 * space-separated `WayTags` string such as
 * `highway=track surface=gravel tracktype=grade2`.
 *
 * The routing providers otherwise never tell us what we were routed onto, so
 * these rows are the only free source of surface, road class, cycleway,
 * shoulder and maxspeed information per segment. Until this module they were
 * parsed only to reject ferries (`ferryGuard.js`).
 *
 * Output is a list of `TaggedWay` in the same spirit as an Overpass way (an
 * id, a geometry, a tag map), with canonical `[lng, lat]` geometry so it can
 * be handed straight to `surfaceOverlay`'s matcher in place of an Overpass
 * result. Pure, no I/O, fail-soft: malformed input yields `[]`.
 */

import type { Coordinate } from '../types/geo';
import { haversineMeters } from './distanceUnits';
import { fnv1a32, stableJson } from './stableHash';

export interface WayTagRow {
  /** End node of the run, canonical [lng, lat]. */
  end: Coordinate;
  /** Length of the run in metres (BRouter `Distance`). */
  distance_m: number;
  /** OSM tags on the way for this run. */
  tags: Record<string, string>;
}

export interface TaggedWay {
  /** Sequential negative id so it can never collide with a real OSM way id. */
  id: number;
  /** Canonical [lng, lat] vertices of the run. */
  geometry: Coordinate[];
  tags: Record<string, string>;
}

/** Parse a BRouter `WayTags` string (`k=v k2=v2`) into a tag map. */
export function parseWayTags(tags: unknown): Record<string, string> {
  if (typeof tags !== 'string' || tags.length === 0) return {};
  const out: Record<string, string> = {};
  for (const token of tags.split(/\s+/)) {
    if (!token) continue;
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    out[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return out;
}

function columnIndex(header: unknown[], name: string): number {
  const wanted = name.toLowerCase();
  return header.findIndex((col) => typeof col === 'string' && col.toLowerCase() === wanted);
}

/** BRouter encodes lon/lat as integer microdegrees, usually as strings. */
function microdegrees(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return null;
  return n / 1e6;
}

/**
 * Parse `properties.messages` into rows. Columns are located by header name
 * so a reordered or extended table still parses; a table without `WayTags`,
 * `Longitude` and `Latitude` yields `[]`.
 */
export function parseBRouterMessages(properties: unknown): WayTagRow[] {
  const messages = (properties as { messages?: unknown } | null | undefined)?.messages;
  if (!Array.isArray(messages) || messages.length < 2) return [];
  const header = messages[0];
  if (!Array.isArray(header)) return [];

  const lonIdx = columnIndex(header, 'Longitude');
  const latIdx = columnIndex(header, 'Latitude');
  const distIdx = columnIndex(header, 'Distance');
  const tagsIdx = columnIndex(header, 'WayTags');
  if (lonIdx === -1 || latIdx === -1 || tagsIdx === -1) return [];

  const rows: WayTagRow[] = [];
  for (const row of messages.slice(1)) {
    if (!Array.isArray(row)) continue;
    const lng = microdegrees(row[lonIdx]);
    const lat = microdegrees(row[latIdx]);
    if (lng === null || lat === null) continue;
    const distance = distIdx === -1 ? Number.NaN : Number.parseFloat(String(row[distIdx]));
    rows.push({
      end: [lng, lat],
      distance_m: Number.isFinite(distance) ? distance : 0,
      tags: parseWayTags(row[tagsIdx]),
    });
  }
  return rows;
}

/** Squared equirectangular distance in degrees² — fine for nearest-vertex search. */
function sqDeg(a: Coordinate, b: Coordinate): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/**
 * Split the track geometry into one `TaggedWay` per message row. Each row's
 * end node is located by walking forward from the previous run's end (the
 * rows are in track order, so a global search is both slower and wrong on
 * routes that cross themselves). The run's geometry is the slice between the
 * two ends, inclusive, so consecutive ways share a vertex.
 *
 * Rows whose end node can't be matched within ~50 m are skipped rather than
 * guessed. Returns `[]` when there's nothing usable.
 */
export function taggedWaysFromBRouter(
  coordinates: ReadonlyArray<Coordinate>,
  rows: ReadonlyArray<WayTagRow>,
): TaggedWay[] {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || rows.length === 0) return [];

  // ~50 m in degrees² at mid latitudes; generous because BRouter's node
  // coordinates come from OSM while the track may be simplified.
  const MAX_SNAP_SQ = (50 / 111000) ** 2;

  const ways: TaggedWay[] = [];
  let cursor = 0;
  for (const row of rows) {
    let bestIdx = -1;
    let bestSq = Infinity;
    for (let i = cursor; i < coordinates.length; i++) {
      const d = sqDeg(coordinates[i], row.end);
      if (d < bestSq) {
        bestSq = d;
        bestIdx = i;
      }
      if (d === 0) break;
    }
    if (bestIdx === -1 || bestSq > MAX_SNAP_SQ) continue;

    const from = cursor;
    const to = Math.max(bestIdx, from + 1);
    if (to >= coordinates.length) break;
    const geometry = coordinates.slice(from, to + 1) as Coordinate[];
    if (geometry.length >= 2) {
      ways.push({ id: -(ways.length + 1), geometry, tags: row.tags });
    }
    cursor = bestIdx;
  }
  return ways;
}

/** Convenience: messages → tagged ways in one call. */
export function taggedWaysFromBRouterProperties(
  coordinates: ReadonlyArray<Coordinate>,
  properties: unknown,
): TaggedWay[] {
  return taggedWaysFromBRouter(coordinates, parseBRouterMessages(properties));
}

/** Total polyline length of the tagged ways, in metres (for coverage checks). */
export function taggedWaysCoverage(ways: ReadonlyArray<TaggedWay>): number {
  let total = 0;
  for (const way of ways) {
    for (let i = 1; i < way.geometry.length; i++) {
      const a = way.geometry[i - 1];
      const b = way.geometry[i];
      total += haversineMeters(a[1], a[0], b[1], b[0]);
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Remembered tags: the route's own build already told us its ways.
//
// A BRouter-built route carries its tags in the response, but the geometry
// then travels through the store and the page as a bare LineString. Rather
// than thread `taggedWays` through every `setRouteGeometry` caller, the
// BRouter client remembers them here keyed by the geometry, and
// `roadAttributes` recalls them before doing any network work.
// ---------------------------------------------------------------------------

const REMEMBERED_MAX = 30;
const remembered = new Map<string, TaggedWay[]>();

/** Stable key for a geometry, quantized to ~1 m so float noise cannot miss. */
export function geometryKey(coordinates: ReadonlyArray<ReadonlyArray<number>>): string {
  const quantized = coordinates.map(([lng, lat]) => [
    Math.round(lng * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ]);
  return fnv1a32(stableJson(quantized));
}

export function rememberTaggedWays(
  coordinates: ReadonlyArray<ReadonlyArray<number>>,
  ways: ReadonlyArray<TaggedWay> | null | undefined,
): void {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return;
  if (!Array.isArray(ways) || ways.length === 0) return;
  const key = geometryKey(coordinates);
  if (remembered.has(key)) remembered.delete(key);
  else if (remembered.size >= REMEMBERED_MAX) {
    const oldest = remembered.keys().next().value;
    if (oldest !== undefined) remembered.delete(oldest);
  }
  remembered.set(key, [...ways]);
}

export function recallTaggedWays(
  coordinates: ReadonlyArray<ReadonlyArray<number>>,
): TaggedWay[] | null {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const key = geometryKey(coordinates);
  const ways = remembered.get(key);
  if (!ways) return null;
  remembered.delete(key);
  remembered.set(key, ways);
  return ways;
}

export function clearRememberedTaggedWays(): void {
  remembered.clear();
}
