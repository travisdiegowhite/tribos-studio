/**
 * Surface Overlay Utilities
 *
 * Fetches road surface type data from OpenStreetMap via Overpass API
 * and creates a GeoJSON FeatureCollection for map visualization.
 */

// Surface type colors (solid = paved, semi-transparent for visual distinction)
export const SURFACE_COLORS = {
  paved:   '#1E40AF', // dark blue
  gravel:  '#D97706', // orange/brown
  unpaved: '#92400E', // dark brown
  mixed:   '#EAB308', // yellow
  unknown: '#9CA3AF', // gray
};

export const SURFACE_LABELS = {
  paved:   'Paved',
  gravel:  'Gravel',
  unpaved: 'Unpaved',
  mixed:   'Mixed',
  unknown: 'Unknown',
};

// OSM surface tag → category
const SURFACE_MAP = {
  paved: ['paved', 'asphalt', 'concrete', 'paving_stones', 'sett', 'cobblestone', 'concrete:plates', 'concrete:lanes', 'metal'],
  gravel: ['gravel', 'fine_gravel', 'pebblestone', 'compacted'],
  unpaved: ['unpaved', 'dirt', 'earth', 'ground', 'mud', 'sand', 'grass', 'wood', 'clay'],
};

function classifySurface(tag) {
  if (!tag) return 'unknown';
  const t = tag.toLowerCase().trim();
  for (const [category, tags] of Object.entries(SURFACE_MAP)) {
    if (tags.includes(t)) return category;
  }
  return 'unknown';
}

/**
 * Build a spatial grid index from OSM way elements for fast nearest-way lookups.
 * Each cell maps to the set of way IDs whose geometry passes through it.
 */
function buildSpatialIndex(elements, cellSize) {
  const grid = new Map();
  const wayMap = new Map();

  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || !el.tags?.surface) continue;
    wayMap.set(el.id, el);
    for (const node of el.geometry) {
      const cellKey = `${Math.floor(node.lon / cellSize)},${Math.floor(node.lat / cellSize)}`;
      if (!grid.has(cellKey)) grid.set(cellKey, new Set());
      grid.get(cellKey).add(el.id);
    }
  }

  return { grid, wayMap, cellSize };
}

/**
 * Find the closest OSM way to a point using the spatial index.
 * Checks the cell containing the point plus all 8 neighbors.
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

  let best = null, bestDist = Infinity;
  for (const id of candidateIds) {
    const el = wayMap.get(id);
    for (const node of el.geometry) {
      const d = (node.lon - lon) ** 2 + (node.lat - lat) ** 2; // squared dist — no sqrt needed for comparison
      if (d < bestDist) { bestDist = d; best = el; }
    }
  }

  return best;
}

/**
 * Fetch surface data for a route from Overpass API.
 * Returns per-coordinate-segment surface info.
 */
export async function fetchRouteSurfaceData(coordinates) {
  if (!coordinates || coordinates.length < 2) return null;

  try {
    // Bounding box from ALL coordinates with ~100m buffer
    const lats = coordinates.map(c => c[1]);
    const lons = coordinates.map(c => c[0]);
    const bufDeg = 100 / 111000; // ~100m buffer
    const bbox = `${Math.min(...lats) - bufDeg},${Math.min(...lons) - bufDeg},${Math.max(...lats) + bufDeg},${Math.max(...lons) + bufDeg}`;

    // Also query ways without surface tag but with highway tag to reduce unknowns
    // highway=residential/tertiary/secondary/primary are almost always paved
    const query = `[out:json][timeout:15];(way["highway"]["surface"](${bbox}););out geom;`;

    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!resp.ok) {
      console.warn(`Overpass API error: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    if (!data.elements?.length) return null;

    // Build spatial index for O(1) cell lookups instead of O(n*m)
    const cellSize = 0.001; // ~111m cells — good granularity for cycling routes
    const index = buildSpatialIndex(data.elements, cellSize);

    // Sample route points for matching to keep it fast
    // For routes with many coordinates, sample every Nth point
    const maxMatchPoints = 500;
    const matchStep = Math.max(1, Math.ceil(coordinates.length / maxMatchPoints));

    // Match sampled points to nearest OSM way
    const sampledSurfaces = [];
    const sampledIndices = [];
    for (let i = 0; i < coordinates.length - 1; i += matchStep) {
      const nextI = Math.min(i + 1, coordinates.length - 1);
      const midLon = (coordinates[i][0] + coordinates[nextI][0]) / 2;
      const midLat = (coordinates[i][1] + coordinates[nextI][1]) / 2;

      const closest = findClosestWay(midLon, midLat, index);
      const surface = closest?.tags?.surface ? classifySurface(closest.tags.surface) : 'unknown';
      sampledSurfaces.push(surface);
      sampledIndices.push(i);
    }

    // Interpolate: fill in all coordinate segments from sampled results
    const surfaceSegments = [];
    let sampleIdx = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      // Advance to the closest sample
      while (sampleIdx < sampledIndices.length - 1 && sampledIndices[sampleIdx + 1] <= i) {
        sampleIdx++;
      }
      surfaceSegments.push(sampledSurfaces[sampleIdx]);
    }

    return surfaceSegments;
  } catch (err) {
    console.error('Surface data fetch failed:', err);
    return null;
  }
}

/**
 * Create a GeoJSON FeatureCollection for surface-colored route segments.
 * Groups consecutive segments with the same surface type.
 */
export function createSurfaceRoute(coordinates, surfaceSegments) {
  if (!coordinates || !surfaceSegments || surfaceSegments.length < 1) return null;

  const features = [];
  let segStart = 0;
  let currentSurface = surfaceSegments[0];

  for (let i = 1; i < surfaceSegments.length; i++) {
    if (surfaceSegments[i] !== currentSurface) {
      // Flush current group
      features.push({
        type: 'Feature',
        properties: {
          color: SURFACE_COLORS[currentSurface] || SURFACE_COLORS.unknown,
          surface: currentSurface,
          label: SURFACE_LABELS[currentSurface] || 'Unknown',
        },
        geometry: {
          type: 'LineString',
          coordinates: coordinates.slice(segStart, i + 1), // +1 for overlap continuity
        },
      });
      segStart = i;
      currentSurface = surfaceSegments[i];
    }
  }

  // Flush last group
  features.push({
    type: 'Feature',
    properties: {
      color: SURFACE_COLORS[currentSurface] || SURFACE_COLORS.unknown,
      surface: currentSurface,
      label: SURFACE_LABELS[currentSurface] || 'Unknown',
    },
    geometry: {
      type: 'LineString',
      coordinates: coordinates.slice(segStart),
    },
  });

  return { type: 'FeatureCollection', features };
}

/**
 * Compute surface distribution summary.
 * Returns { paved: 62, gravel: 28, unpaved: 10 } (percentages)
 */
export function computeSurfaceDistribution(surfaceSegments) {
  if (!surfaceSegments?.length) return {};
  const counts = {};
  for (const s of surfaceSegments) counts[s] = (counts[s] || 0) + 1;
  const total = surfaceSegments.length;
  const dist = {};
  for (const [key, count] of Object.entries(counts)) {
    if (key !== 'unknown') dist[key] = Math.round((count / total) * 100);
  }
  return dist;
}
