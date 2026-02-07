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
 * Fetch surface data for a route from Overpass API.
 * Returns per-coordinate-segment surface info.
 */
export async function fetchRouteSurfaceData(coordinates) {
  if (!coordinates || coordinates.length < 2) return null;

  try {
    // Sample coordinates to limit API load (max ~60 query points)
    const maxSamples = 60;
    const step = Math.max(1, Math.ceil(coordinates.length / maxSamples));
    const sampled = [];
    for (let i = 0; i < coordinates.length; i += step) sampled.push(coordinates[i]);
    if (sampled[sampled.length - 1] !== coordinates[coordinates.length - 1]) {
      sampled.push(coordinates[coordinates.length - 1]);
    }

    // Bounding box
    const lats = sampled.map(c => c[1]);
    const lons = sampled.map(c => c[0]);
    const bufDeg = 30 / 111000; // ~30m buffer
    const bbox = `${Math.min(...lats) - bufDeg},${Math.min(...lons) - bufDeg},${Math.max(...lats) + bufDeg},${Math.max(...lons) + bufDeg}`;

    const query = `[out:json][timeout:10];(way["highway"]["surface"](${bbox}););out geom;`;

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

    // Match: for each route coordinate segment, find the closest OSM way
    const surfaceSegments = [];
    for (let i = 0; i < coordinates.length - 1; i++) {
      const mid = [(coordinates[i][0] + coordinates[i + 1][0]) / 2, (coordinates[i][1] + coordinates[i + 1][1]) / 2];
      let best = null, bestDist = Infinity;
      for (const el of data.elements) {
        if (el.type !== 'way' || !el.geometry) continue;
        for (const node of el.geometry) {
          const d = Math.abs(node.lon - mid[0]) + Math.abs(node.lat - mid[1]); // fast approx
          if (d < bestDist) { bestDist = d; best = el; }
        }
      }
      const surface = best?.tags?.surface ? classifySurface(best.tags.surface) : 'unknown';
      surfaceSegments.push(surface);
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
