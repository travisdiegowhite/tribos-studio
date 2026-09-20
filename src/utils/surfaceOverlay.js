/**
 * Surface Overlay Utilities
 *
 * Fetches road surface type data from OpenStreetMap via Overpass API
 * and creates a GeoJSON FeatureCollection for map visualization.
 */

import { haversineMeters } from './distanceUnits';
import { fetchOverpassElements } from './overpassClient';

// Surface type colors (solid = paved, semi-transparent for visual distinction)
export const SURFACE_COLORS = {
  paved:   '#3D8B50', // teal
  gravel:  '#D4820A', // gold
  unpaved: '#C17C60', // terracotta
  mixed:   '#B8A0C4', // mauve
  unknown: '#9A9C90', // text muted
};

export const SURFACE_LABELS = {
  paved:   'Paved',
  gravel:  'Gravel',
  unpaved: 'Unpaved',
  mixed:   'Mixed',
  unknown: 'Unknown',
};

// OSM surface tag → category
export const SURFACE_MAP = {
  paved: ['paved', 'asphalt', 'concrete', 'paving_stones', 'sett', 'cobblestone', 'concrete:plates', 'concrete:lanes', 'metal'],
  gravel: ['gravel', 'fine_gravel', 'pebblestone', 'compacted'],
  unpaved: ['unpaved', 'dirt', 'earth', 'ground', 'mud', 'sand', 'grass', 'wood', 'clay'],
};

export function classifySurface(tag) {
  if (!tag) return 'unknown';
  const t = tag.toLowerCase().trim();
  for (const [category, tags] of Object.entries(SURFACE_MAP)) {
    if (tags.includes(t)) return category;
  }
  return 'unknown';
}

// A sampled route point further than this from every tagged way is reported
// as 'unknown' rather than inheriting the nearest way's surface. Without a
// cutoff an untagged road silently took the surface of a tagged way hundreds
// of metres away.
export const SURFACE_SNAP_RADIUS_M = 25;
const SNAP_RADIUS_SQ_M = SURFACE_SNAP_RADIUS_M ** 2;

/**
 * Way vertices arrive in two shapes: Overpass `{lat, lon}` nodes and the
 * canonical `[lng, lat]` tuples of a `TaggedWay` (wayTags.ts). Normalise here
 * so the matcher is shape-agnostic.
 */
function nodeLngLat(node) {
  if (Array.isArray(node)) return [node[0], node[1]];
  if (node && typeof node.lon === 'number' && typeof node.lat === 'number') return [node.lon, node.lat];
  return null;
}

/**
 * Build a spatial grid index from way elements for fast nearest-way lookups.
 * Each cell maps to the set of way IDs whose geometry passes through it.
 * Accepts Overpass elements or TaggedWay objects. When `requireTag` is set,
 * only ways carrying that tag are indexed (surface matching); otherwise
 * every way with geometry is (traffic-stress matching).
 */
function buildSpatialIndex(elements, cellSize, requireTag = null) {
  const grid = new Map();
  const wayMap = new Map();

  for (const el of elements) {
    if (!el || !Array.isArray(el.geometry) || !el.tags) continue;
    if (requireTag && !el.tags[requireTag]) continue;
    if (el.type && el.type !== 'way') continue;
    const vertices = el.geometry.map(nodeLngLat).filter(Boolean);
    if (vertices.length === 0) continue;
    wayMap.set(el.id, { el, vertices });
    for (const [lon, lat] of vertices) {
      const cellKey = `${Math.floor(lon / cellSize)},${Math.floor(lat / cellSize)}`;
      if (!grid.has(cellKey)) grid.set(cellKey, new Set());
      grid.get(cellKey).add(el.id);
    }
  }

  return { grid, wayMap, cellSize };
}

/**
 * Squared distance in metres² from point p to segment a–b, all [lon, lat].
 * Equirectangular: longitude is scaled by cos(lat) so east–west and
 * north–south metres match at cycling scales.
 */
function pointToSegmentSqM(p, a, b) {
  const kx = 111000 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 111000;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return cx * cx + cy * cy;
}

/**
 * Find the closest indexed way to a point (distance to the way's EDGES, not
 * just its vertices — a sampled midpoint can sit 40 m from the nearest vertex
 * of the very road it's on), or null when nothing lies within
 * SURFACE_SNAP_RADIUS_M. Checks the cell containing the point plus all 8
 * neighbours.
 */
function findClosestWay(lon, lat, index) {
  const { grid, wayMap, cellSize } = index;
  const cx = Math.floor(lon / cellSize);
  const cy = Math.floor(lat / cellSize);

  const candidateIds = new Set();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${cx + dx},${cy + dy}`;
      const ids = grid.get(key);
      if (ids) ids.forEach(id => candidateIds.add(id));
    }
  }

  const p = [lon, lat];
  let best = null, bestDist = Infinity;
  for (const id of candidateIds) {
    const { el, vertices } = wayMap.get(id);
    if (vertices.length === 1) {
      const d = pointToSegmentSqM(p, vertices[0], vertices[0]);
      if (d < bestDist) { bestDist = d; best = el; }
      continue;
    }
    for (let i = 1; i < vertices.length; i++) {
      const d = pointToSegmentSqM(p, vertices[i - 1], vertices[i]);
      if (d < bestDist) { bestDist = d; best = el; }
    }
  }

  return bestDist <= SNAP_RADIUS_SQ_M ? best : null;
}

/**
 * Match a route geometry against a set of ways. Returns one way (or null)
 * per coordinate segment (length - 1), or null when there are no usable
 * ways. Pure: no network. Samples at most 500 segment midpoints and
 * interpolates the rest, so long routes stay cheap.
 *
 * @param {ReadonlyArray<ReadonlyArray<number>>} coordinates - [lon, lat] tuples
 * @param {ReadonlyArray<any>} ways - Overpass elements or TaggedWay objects
 * @param {{ requireTag?: string | null }} [options] - only index ways carrying this tag
 * @returns {Array<any|null>|null}
 */
export function matchRouteWays(coordinates, ways, options = {}) {
  if (!coordinates || coordinates.length < 2 || !Array.isArray(ways) || ways.length === 0) return null;

  const cellSize = 0.001; // ~111m cells — good granularity for cycling routes
  const index = buildSpatialIndex(ways, cellSize, options.requireTag ?? null);
  if (index.wayMap.size === 0) return null;

  // Sample route points for matching to keep it fast
  // For routes with many coordinates, sample every Nth point
  const maxMatchPoints = 500;
  const matchStep = Math.max(1, Math.ceil(coordinates.length / maxMatchPoints));

  // Match sampled points to nearest way
  const sampledWays = [];
  const sampledIndices = [];
  for (let i = 0; i < coordinates.length - 1; i += matchStep) {
    const nextI = Math.min(i + 1, coordinates.length - 1);
    const midLon = (coordinates[i][0] + coordinates[nextI][0]) / 2;
    const midLat = (coordinates[i][1] + coordinates[nextI][1]) / 2;
    sampledWays.push(findClosestWay(midLon, midLat, index));
    sampledIndices.push(i);
  }

  // Interpolate: fill in all coordinate segments from sampled results
  const matched = [];
  let sampleIdx = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    // Advance to the closest sample
    while (sampleIdx < sampledIndices.length - 1 && sampledIndices[sampleIdx + 1] <= i) {
      sampleIdx++;
    }
    matched.push(sampledWays[sampleIdx]);
  }

  return matched;
}

/**
 * Match a route geometry against a set of surface-tagged ways.
 * Returns one surface category per coordinate segment (length - 1), or null
 * when there are no usable ways. Pure: no network.
 *
 * @param {ReadonlyArray<ReadonlyArray<number>>} coordinates - [lon, lat] tuples
 * @param {ReadonlyArray<any>} ways - Overpass elements or TaggedWay objects with `tags.surface`
 * @returns {string[]|null}
 */
export function matchRouteSurfaces(coordinates, ways) {
  const matched = matchRouteWays(coordinates, ways, { requireTag: 'surface' });
  if (!matched) return null;
  return matched.map((way) => (way?.tags?.surface ? classifySurface(way.tags.surface) : 'unknown'));
}

/**
 * Fetch surface data for a route from Overpass API.
 * Returns per-coordinate-segment surface info.
 *
 * @param {ReadonlyArray<ReadonlyArray<number>>} coordinates - [lon, lat] tuples
 * @param {{ ways?: ReadonlyArray<any> | null }} [options]
 * @param {ReadonlyArray<any>|null} [options.ways] - Pre-fetched surface-tagged ways (e.g. the
 *   `taggedWays` a BRouter route already carries). When given and non-empty
 *   the Overpass round-trip is skipped entirely.
 */
export async function fetchRouteSurfaceData(coordinates, options = {}) {
  if (!coordinates || coordinates.length < 2) return null;

  if (Array.isArray(options.ways) && options.ways.length > 0) {
    const fromWays = matchRouteSurfaces(coordinates, options.ways);
    // null means none of the supplied ways carried a surface tag; Overpass
    // has the same tags for the same ways, but may know neighbouring ones.
    if (fromWays) return fromWays;
  }

  try {
    // Bounding box from ALL coordinates with ~100m buffer
    const lats = coordinates.map(c => c[1]);
    const lons = coordinates.map(c => c[0]);
    const bufDeg = 100 / 111000; // ~100m buffer
    const bbox = `${Math.min(...lats) - bufDeg},${Math.min(...lons) - bufDeg},${Math.max(...lats) + bufDeg},${Math.max(...lons) + bufDeg}`;

    // Only ways that carry an explicit surface tag. Inferring surface from
    // highway class / tracktype for the untagged remainder is the C12 item in
    // docs/route-quality-brainstorm.md — until then they read as 'unknown'.
    const query = `[out:json][timeout:15];(way["highway"]["surface"](${bbox}););out geom;`;

    const elements = await fetchOverpassElements(query);
    if (!elements.length) return null;

    return matchRouteSurfaces(coordinates, elements);
  } catch (err) {
    console.error('Surface data fetch failed:', err);
    return null;
  }
}

/**
 * Group consecutive coordinate segments with the same value into LineString
 * features. `propsFor(value)` supplies each feature's properties (color,
 * label, …). Shared by the surface and traffic-stress overlays.
 *
 * @param {ReadonlyArray<ReadonlyArray<number>>} coordinates
 * @param {ReadonlyArray<any>} values - one per coordinate segment
 * @param {(value: any) => Record<string, any>} propsFor
 */
export function groupSegmentsToFeatures(coordinates, values, propsFor) {
  if (!coordinates || !values || values.length < 1) return null;

  const features = [];
  let segStart = 0;
  let current = values[0];

  for (let i = 1; i < values.length; i++) {
    if (values[i] !== current) {
      // Flush current group
      features.push({
        type: 'Feature',
        properties: propsFor(current),
        geometry: {
          type: 'LineString',
          coordinates: coordinates.slice(segStart, i + 1), // +1 for overlap continuity
        },
      });
      segStart = i;
      current = values[i];
    }
  }

  // Flush last group
  features.push({
    type: 'Feature',
    properties: propsFor(current),
    geometry: {
      type: 'LineString',
      coordinates: coordinates.slice(segStart),
    },
  });

  return { type: 'FeatureCollection', features };
}

/**
 * Create a GeoJSON FeatureCollection for surface-colored route segments.
 * Groups consecutive segments with the same surface type.
 *
 * With `inferences` (one per segment, from surfaceInference.ts) a run is
 * also split where the evidence changes, and each feature carries
 * `inferred` (true when the surface was deduced from tracktype/highway
 * rather than read from a `surface` tag) and `detail` (the deciding tag),
 * so the overlay can draw inferred stretches dashed and say why.
 *
 * @param {ReadonlyArray<ReadonlyArray<number>>} coordinates
 * @param {ReadonlyArray<string>} surfaceSegments
 * @param {ReadonlyArray<{evidence: string, detail: string}>|null} [inferences]
 */
export function createSurfaceRoute(coordinates, surfaceSegments, inferences = null) {
  const withEvidence =
    Array.isArray(inferences) && inferences.length === surfaceSegments?.length;
  if (!withEvidence) {
    return groupSegmentsToFeatures(coordinates, surfaceSegments, (surface) => ({
      color: SURFACE_COLORS[surface] || SURFACE_COLORS.unknown,
      surface,
      label: SURFACE_LABELS[surface] || 'Unknown',
    }));
  }
  const SEP = '\u0000';
  const values = surfaceSegments.map((surface, i) => {
    const inf = inferences[i] || {};
    const inferred = inf.evidence && inf.evidence !== 'surface' && inf.evidence !== 'none' ? '1' : '0';
    return `${surface}${SEP}${inferred}${SEP}${inf.detail || ''}`;
  });
  return groupSegmentsToFeatures(coordinates, values, (value) => {
    const [surface, inferred, detail] = String(value).split(SEP);
    return {
      color: SURFACE_COLORS[surface] || SURFACE_COLORS.unknown,
      surface,
      label: SURFACE_LABELS[surface] || 'Unknown',
      inferred: inferred === '1',
      detail: detail || '',
    };
  });
}

/**
 * Compute surface distribution summary.
 * Returns { paved: 62, gravel: 28, unpaved: 10 } (percentages, 'unknown'
 * omitted so the values may sum to less than 100).
 *
 * When `coordinates` is supplied, each segment is weighted by its length so
 * a run of many short vertices can't over-report its surface; without it the
 * share is by segment count (legacy behaviour, kept for callers that don't
 * have the geometry to hand).
 *
 * @param {string[]} surfaceSegments - one category per coordinate segment
 * @param {ReadonlyArray<ReadonlyArray<number>>|null} [coordinates] - the geometry those segments span
 * @returns {Record<string, number>}
 */
export function computeSurfaceDistribution(surfaceSegments, coordinates = null) {
  if (!surfaceSegments?.length) return {};
  const weights = {};
  let total = 0;
  const useLengths =
    Array.isArray(coordinates) && coordinates.length === surfaceSegments.length + 1;
  for (let i = 0; i < surfaceSegments.length; i++) {
    const s = surfaceSegments[i];
    let w = 1;
    if (useLengths) {
      const a = coordinates[i];
      const b = coordinates[i + 1];
      w = haversineMeters(a[1], a[0], b[1], b[0]);
    }
    weights[s] = (weights[s] || 0) + w;
    total += w;
  }
  if (total <= 0) return {};
  const dist = {};
  for (const [key, w] of Object.entries(weights)) {
    if (key !== 'unknown') dist[key] = Math.round((w / total) * 100);
  }
  return dist;
}
